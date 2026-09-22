/** GuardAsli — App Builder و Build Queue. */
import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireActor, requirePermission, requireTenantScope } from "./auth";
import { isValidVersion } from "../core/version";

export const appGet = query({
  args: { token: v.string(), appKind: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx, args.token);
    return await ctx.db
      .query("appCustomizations")
      .withIndex("by_tenant_kind", (q) =>
        q.eq("tenantId", actor.tenantId).eq("appKind", args.appKind),
      )
      .unique();
  },
});

export const appSave = mutation({
  args: {
    token: v.string(),
    appKind: v.union(v.literal("mainapp"), v.literal("dedicated")),
    appName: v.string(),
    shortName: v.optional(v.string()),
    description: v.optional(v.string()),
    packageName: v.optional(v.string()),
    bundleId: v.optional(v.string()),
    version: v.string(),
    primaryColor: v.string(),
    secondaryColor: v.string(),
    accentColor: v.string(),
    backgroundColor: v.string(),
    themeMode: v.string(),
    featureFlags: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx, args.token);
    requirePermission(actor, "ManageApps");
    if (!isValidVersion(args.version)) {
      throw new Error("VALIDATION_ERROR: نسخه باید isMAJOR.MINOR.PATCH باشد");
    }
    const existing = await ctx.db
      .query("appCustomizations")
      .withIndex("by_tenant_kind", (q) =>
        q.eq("tenantId", actor.tenantId).eq("appKind", args.appKind),
      )
      .unique();
    const fields = {
      appName: args.appName,
      ...(args.shortName !== undefined ? { shortName: args.shortName } : {}),
      ...(args.description !== undefined ? { description: args.description } : {}),
      ...(args.packageName !== undefined ? { packageName: args.packageName } : {}),
      ...(args.bundleId !== undefined ? { bundleId: args.bundleId } : {}),
      version: args.version,
      primaryColor: args.primaryColor,
      secondaryColor: args.secondaryColor,
      accentColor: args.accentColor,
      backgroundColor: args.backgroundColor,
      themeMode: args.themeMode,
      featureFlags: args.featureFlags,
    };
    if (existing) {
      await ctx.db.patch(existing._id, fields);
      return { appCustomizationId: existing._id, buildNumber: existing.buildNumber };
    }
    const id = await ctx.db.insert("appCustomizations", {
      tenantId: actor.tenantId,
      appKind: args.appKind,
      buildNumber: 1,
      ...fields,
    });
    return { appCustomizationId: id, buildNumber: 1 };
  },
});

export const buildEnqueue = mutation({
  args: {
    token: v.string(),
    appCustomizationId: v.id("appCustomizations"),
    platform: v.union(v.literal("android"), v.literal("web")),
  },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx, args.token);
    requirePermission(actor, "Build");
    const app = await ctx.db.get(args.appCustomizationId);
    if (!app) throw new Error("NOT_FOUND");
    await requireTenantScope(ctx, actor, app.tenantId);
    // iOS فقط روی macOS — صریحاً رد می‌شود
    const buildNumber = app.buildNumber + 1;
    await ctx.db.patch(app._id, { buildNumber });
    const id = await ctx.db.insert("builds", {
      tenantId: actor.tenantId,
      appCustomizationId: args.appCustomizationId,
      status: "queued",
      platform: args.platform,
      version: app.version,
      buildNumber,
      startedAt: Date.now(),
    });
    await ctx.db.insert("jobs", {
      kind: "build",
      tenantId: actor.tenantId,
      payload: { buildId: id, platform: args.platform },
      status: "queued",
      attempts: 0,
      maxAttempts: 3,
      nextRunAt: Date.now(),
    });
    await ctx.runMutation(internal.audit.log, {
      actorUserId: actor.userId,
      tenantId: actor.tenantId,
      action: "build.enqueue",
      entityType: "builds",
      entityId: id,
      metadata: { platform: args.platform, version: app.version },
    });
    return { buildId: id, buildNumber };
  },
});

export const buildList = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx, args.token);
    return await ctx.db
      .query("builds")
      .withIndex("by_tenant", (q) => q.eq("tenantId", actor.tenantId))
      .order("desc")
      .take(50);
  },
});

export const buildMark = internalMutation({
  args: {
    buildId: v.id("builds"),
    status: v.string(),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.buildId, {
      status: args.status,
      finishedAt: Date.now(),
      ...(args.error ? { logsStorageId: undefined } : {}),
    });
  },
});
