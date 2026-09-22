/** GuardAsli — Audit Logging (بند ۳۶). هرگز secrets لاگ نمی‌شوند. */
import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import { requireActor } from "./auth";

export const log = internalMutation({
  args: {
    actorUserId: v.optional(v.id("users")),
    tenantId: v.optional(v.id("tenants")),
    action: v.string(),
    entityType: v.string(),
    entityId: v.optional(v.string()),
    metadata: v.optional(v.any()),
    ip: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("auditLogs", {
      ...(args.actorUserId !== undefined ? { actorUserId: args.actorUserId } : {}),
      ...(args.tenantId !== undefined ? { tenantId: args.tenantId } : {}),
      action: args.action,
      entityType: args.entityType,
      ...(args.entityId !== undefined ? { entityId: args.entityId } : {}),
      ...(args.metadata !== undefined ? { metadata: args.metadata } : {}),
      ...(args.ip !== undefined ? { ip: args.ip } : {}),
      createdAt: Date.now(),
    });
  },
});

export const list = query({
  args: {
    token: v.string(),
    tenantId: v.optional(v.id("tenants")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx, args.token);
    if (actor.role !== "super_admin" && actor.role !== "admin" && actor.role !== "reseller") {
      throw new Error("FORBIDDEN: دسترسی به audit مجاز نیست");
    }
    const limit = Math.min(args.limit ?? 100, 500);
    if (args.tenantId) {
      return await ctx.db
        .query("auditLogs")
        .withIndex("by_tenant_time", (q) => q.eq("tenantId", args.tenantId!))
        .order("desc")
        .take(limit);
    }
    return await ctx.db.query("auditLogs").order("desc").take(limit);
  },
});
