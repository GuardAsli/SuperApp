/** GuardAsli — API کلاینت VPN (تجربه حرفه‌ای اتصال). */
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireActor, requireTenantScope } from "./auth";
import {
  isSubscriptionActive,
  remainingTrafficGb,
  type ClientConnectProfile,
  type ClientServerView,
  type ClientSubscriptionView,
} from "../core/clientExperience";

export const clientHome = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx, args.token);
    const subs = await ctx.db
      .query("subscriptions")
      .withIndex("by_user", (q) => q.eq("userId", actor.userId))
      .collect();
    const active = subs.find((s) =>
      isSubscriptionActive({
        id: s._id,
        status: s.status,
        trafficLimitGb: s.trafficLimitGb ?? null,
        trafficUsedGb: s.trafficUsedGb ?? null,
        durationEndsAt: s.durationEndsAt ?? null,
        devicesAllowed: s.userLimit ?? null,
      }),
    );
    const servers = await ctx.db
      .query("servers")
      .withIndex("by_tenant", (q) => q.eq("tenantId", actor.tenantId))
      .collect();
    const serverViews: ClientServerView[] = servers
      .filter((s) => s.status === "active" || s.status === "online")
      .map((s, i) => ({
        id: s._id,
        name: s.name,
        status: s.status,
        recommended: i === 0,
      }));

    const subView: ClientSubscriptionView | null = active
      ? {
          id: active._id,
          status: active.status,
          trafficLimitGb: active.trafficLimitGb ?? null,
          trafficUsedGb: active.trafficUsedGb ?? null,
          durationEndsAt: active.durationEndsAt ?? null,
          devicesAllowed: active.userLimit ?? null,
        }
      : null;

    const devices = await ctx.db
      .query("clientDevices")
      .withIndex("by_user", (q) => q.eq("userId", actor.userId))
      .collect();

    return {
      product: "GuardAsli",
      experience: "consumer_vpn",
      subscription: subView,
      remainingTrafficGb: subView ? remainingTrafficGb(subView) : null,
      canConnect: !!subView,
      servers: serverViews,
      devices: devices.map((d) => ({
        id: d._id,
        name: d.name,
        platform: d.platform,
        lastSeenAt: d.lastSeenAt,
        status: d.status,
      })),
      deviceCount: devices.filter((d) => d.status === "active").length,
      deviceLimit: subView?.devicesAllowed ?? null,
    };
  },
});

/** ثبت/به‌روزرسانی دستگاه (مانند محدودیت multi-device نورد) */
export const deviceRegister = mutation({
  args: {
    token: v.string(),
    deviceKey: v.string(),
    name: v.string(),
    platform: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx, args.token);
    if (!/^[a-zA-Z0-9_-]{8,128}$/.test(args.deviceKey)) {
      throw new Error("VALIDATION_ERROR: deviceKey نامعتبر است");
    }
    const subs = await ctx.db
      .query("subscriptions")
      .withIndex("by_user", (q) => q.eq("userId", actor.userId))
      .collect();
    const active = subs.find((s) => s.status === "active");
    const limit = active?.userLimit ?? 5;
    const existing = await ctx.db
      .query("clientDevices")
      .withIndex("by_user_key", (q) => q.eq("userId", actor.userId).eq("deviceKey", args.deviceKey))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        name: args.name.slice(0, 64),
        platform: args.platform.slice(0, 32),
        lastSeenAt: Date.now(),
        status: "active",
      });
      return { deviceId: existing._id, ok: true };
    }
    const activeDevices = await ctx.db
      .query("clientDevices")
      .withIndex("by_user", (q) => q.eq("userId", actor.userId))
      .collect();
    const n = activeDevices.filter((d) => d.status === "active").length;
    if (n >= limit) {
      throw new Error("QUOTA: سقف تعداد دستگاه پر است — یکی را حذف کنید");
    }
    const id = await ctx.db.insert("clientDevices", {
      tenantId: actor.tenantId,
      userId: actor.userId,
      deviceKey: args.deviceKey,
      name: args.name.slice(0, 64),
      platform: args.platform.slice(0, 32),
      status: "active",
      lastSeenAt: Date.now(),
      createdAt: Date.now(),
    });
    return { deviceId: id, ok: true };
  },
});

export const deviceRevoke = mutation({
  args: { token: v.string(), deviceId: v.id("clientDevices") },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx, args.token);
    const d = await ctx.db.get(args.deviceId);
    if (!d) throw new Error("NOT_FOUND");
    if (d.userId !== actor.userId && actor.role !== "super_admin" && actor.role !== "admin") {
      throw new Error("FORBIDDEN");
    }
    await requireTenantScope(ctx, actor, d.tenantId);
    await ctx.db.patch(args.deviceId, { status: "revoked" });
    return { ok: true };
  },
});

/**
 * پروفایل اتصال برای کلاینت.
 * payload از remoteRef سرور + اشتراک ساخته می‌شود — کلاینت با آن تونل را بالا می‌آورد.
 */
export const connectProfile = query({
  args: {
    token: v.string(),
    serverId: v.optional(v.id("servers")),
  },
  handler: async (ctx, args): Promise<ClientConnectProfile | null> => {
    const actor = await requireActor(ctx, args.token);
    const subs = await ctx.db
      .query("subscriptions")
      .withIndex("by_user", (q) => q.eq("userId", actor.userId))
      .collect();
    const active = subs.find((s) => s.status === "active");
    if (!active) return null;
    if (active.durationEndsAt && active.durationEndsAt < Date.now()) return null;

    let server = args.serverId ? await ctx.db.get(args.serverId) : null;
    if (server) await requireTenantScope(ctx, actor, server.tenantId);
    if (!server && active.serverId) server = await ctx.db.get(active.serverId);
    if (!server) {
      const list = await ctx.db
        .query("servers")
        .withIndex("by_tenant", (q) => q.eq("tenantId", actor.tenantId))
        .take(1);
      server = list[0] ?? null;
    }
    if (!server) return null;

    // remoteRef معمولاً لینک ساب یا شناسه کاربر روی پنل بالادستی است
    const payload =
      active.remoteUserId && server.remoteRef
        ? `${server.remoteRef}#${active.remoteUserId}`
        : server.remoteRef;

    return {
      profileType: payload.includes("://") ? "uri" : "subscription_url",
      payload,
      serverId: server._id,
      expiresAt: active.durationEndsAt ?? null,
    };
  },
});
