/** GuardAsli — Audit Logging (بند ۳۶). هرگز secrets لاگ نمی‌شوند. */
import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import { requireActor, requireTenantScope, type ActorContext } from "./auth";

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

/**
 * list — سخت‌گیرانه‌ترین حالت ممکن: هر بازیگر (حتی Super Admin) فقط لاگ‌های
 * درخت مستأجر خودش را می‌بیند. Core با اصل حداقل بودن audit، از دیدن لاگ‌های
 * tenant های دیگر منع شده است.
 *
 * منطق scope:
 * - بدون tenantId → نتایج درخت مستأجر بازیگر (self + children بازگشتی)
 * - با tenantId → باید در همان درخت باشد، وگرنه FORBIDDEN
 */
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
      await requireTenantScope(ctx, actor, args.tenantId);
      return await ctx.db
        .query("auditLogs")
        .withIndex("by_tenant_time", (q) => q.eq("tenantId", args.tenantId!))
        .order("desc")
        .take(limit);
    }

    // بدون tenantId: فقط لاگ‌های درخت مستأجر بازیگر
    const treeIds = await collectTenantTreeIds(ctx, actor.tenantId);
    if (treeIds.length === 0) return [];
    const rows = await ctx.db
      .query("auditLogs")
      .withIndex("by_tenant_time", (q) => q.eq("tenantId", actor.tenantId))
      .order("desc")
      .take(limit);
    // entries with tenantId undefined are platform-level logs; visible only to Core (actor tenant is core)
    const actorTenant = await ctx.db.get(actor.tenantId);
    const isCore = actorTenant?.config?.core === true;
    return rows.filter(
      (r) => r.tenantId === undefined ? isCore : true,
    );
  },
});

/** جمع‌آوری شناسه‌های درخت مستأجر (BFS) — تا عمق ۳۲. */
export async function collectTenantTreeIds(ctx: { db: any }, rootTenantId: string): Promise<string[]> {
  const out: string[] = [];
  const queue: string[] = [rootTenantId];
  let processed = 0;
  while (queue.length > 0 && processed < 32) {
    const cur = queue.shift()!;
    out.push(cur);
    processed++;
    const children = await ctx.db
      .query("tenants")
      .withIndex("by_parent", (q: any) => q.eq("parentTenantId", cur as never))
      .collect();
    for (const c of children) queue.push(c._id);
  }
  return out;
}
