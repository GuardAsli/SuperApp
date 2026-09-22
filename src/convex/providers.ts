/** GuardAsli — مدیریت Provider سرور (3X-UI / Sanaei / PasarGuard / Rebecca). */
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireActor, requirePermission, requireTenantScope } from "./auth";
import { PROVIDER_KINDS } from "../core/providers/types";

export const providerList = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx, args.token);
    const rows = await ctx.db
      .query("providers")
      .withIndex("by_tenant", (q) => q.eq("tenantId", actor.tenantId))
      .collect();
    return rows.map((p) => ({
      _id: p._id,
      kind: p.kind,
      name: p.name,
      baseUrl: p.baseUrl,
      capabilities: p.capabilities,
      status: p.status,
      hasCredentials: p.credentialsEncrypted.length > 0,
    }));
  },
});

export const providerUpsert = mutation({
  args: {
    token: v.string(),
    providerId: v.optional(v.id("providers")),
    kind: v.string(),
    name: v.string(),
    baseUrl: v.string(),
    credentialsEncrypted: v.string(),
    capabilities: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx, args.token);
    requirePermission(actor, "ManageServers");
    if (!PROVIDER_KINDS.includes(args.kind as never)) {
      throw new Error("VALIDATION_ERROR: kind نامعتبر است");
    }
    if (args.providerId) {
      const existing = await ctx.db.get(args.providerId);
      if (!existing) throw new Error("NOT_FOUND");
      await requireTenantScope(ctx, actor, existing.tenantId);
      await ctx.db.patch(args.providerId, {
        kind: args.kind,
        name: args.name,
        baseUrl: args.baseUrl,
        credentialsEncrypted: args.credentialsEncrypted,
        capabilities: args.capabilities,
        status: "active",
      });
      await ctx.runMutation(internal.audit.log, {
        actorUserId: actor.userId,
        tenantId: actor.tenantId,
        action: "provider.update",
        entityType: "providers",
        entityId: args.providerId,
      });
      return { providerId: args.providerId };
    }
    const id = await ctx.db.insert("providers", {
      tenantId: actor.tenantId,
      kind: args.kind,
      name: args.name,
      baseUrl: args.baseUrl,
      credentialsEncrypted: args.credentialsEncrypted,
      capabilities: args.capabilities,
      status: "active",
    });
    await ctx.runMutation(internal.audit.log, {
      actorUserId: actor.userId,
      tenantId: actor.tenantId,
      action: "provider.create",
      entityType: "providers",
      entityId: id,
    });
    return { providerId: id };
  },
});

export const serverList = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx, args.token);
    return await ctx.db
      .query("servers")
      .withIndex("by_tenant", (q) => q.eq("tenantId", actor.tenantId))
      .collect();
  },
});

export const serverUpsert = mutation({
  args: {
    token: v.string(),
    serverId: v.optional(v.id("servers")),
    providerId: v.id("providers"),
    name: v.string(),
    remoteRef: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx, args.token);
    requirePermission(actor, "ManageServers");
    const provider = await ctx.db.get(args.providerId);
    if (!provider) throw new Error("NOT_FOUND: provider");
    await requireTenantScope(ctx, actor, provider.tenantId);
    if (args.serverId) {
      const s = await ctx.db.get(args.serverId);
      if (!s) throw new Error("NOT_FOUND");
      await requireTenantScope(ctx, actor, s.tenantId);
      await ctx.db.patch(args.serverId, {
        name: args.name,
        remoteRef: args.remoteRef,
        providerId: args.providerId,
      });
      return { serverId: args.serverId };
    }
    const id = await ctx.db.insert("servers", {
      tenantId: actor.tenantId,
      providerId: args.providerId,
      name: args.name,
      remoteRef: args.remoteRef,
      status: "active",
    });
    return { serverId: id };
  },
});
