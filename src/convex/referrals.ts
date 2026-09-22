/** GuardAsli — ارجاع و کمیسیون با ایزوله tenant. */
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireActor, requirePermission, requireTenantScope } from "./auth";

export const referralRuleGet = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx, args.token);
    return await ctx.db
      .query("referralRules")
      .withIndex("by_tenant", (q) => q.eq("tenantId", actor.tenantId))
      .unique();
  },
});

export const referralRuleSet = mutation({
  args: {
    token: v.string(),
    enabled: v.boolean(),
    commissionPct: v.number(),
  },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx, args.token);
    requirePermission(actor, "Manage");
    if (args.commissionPct < 0 || args.commissionPct > 100) {
      throw new Error("VALIDATION_ERROR: درصد کمیسیون نامعتبر است");
    }
    const global = await ctx.db
      .query("featureFlags")
      .withIndex("by_key", (q) => q.eq("key", "Referral"))
      .unique();
    if (!global?.globallyEnabled && args.enabled) {
      throw new Error("FORBIDDEN: Feature Referral سراسری غیرفعال است");
    }
    const existing = await ctx.db
      .query("referralRules")
      .withIndex("by_tenant", (q) => q.eq("tenantId", actor.tenantId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        enabled: args.enabled,
        commissionPct: args.commissionPct,
      });
      return { ruleId: existing._id };
    }
    const id = await ctx.db.insert("referralRules", {
      tenantId: actor.tenantId,
      enabled: args.enabled,
      commissionPct: args.commissionPct,
    });
    await ctx.runMutation(internal.audit.log, {
      actorUserId: actor.userId,
      tenantId: actor.tenantId,
      action: "referral.rule_set",
      entityType: "referralRules",
      entityId: id,
      metadata: { enabled: args.enabled, commissionPct: args.commissionPct },
    });
    return { ruleId: id };
  },
});

export const referralAttach = mutation({
  args: {
    token: v.string(),
    referredUserId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx, args.token);
    const rule = await ctx.db
      .query("referralRules")
      .withIndex("by_tenant", (q) => q.eq("tenantId", actor.tenantId))
      .unique();
    if (!rule?.enabled) throw new Error("FORBIDDEN: ارجاع در این tenant فعال نیست");
    const referred = await ctx.db.get(args.referredUserId);
    if (!referred) throw new Error("NOT_FOUND");
    await requireTenantScope(ctx, actor, referred.tenantId);
    if (referred._id === actor.userId) {
      throw new Error("VALIDATION_ERROR: خودارجاعی مجاز نیست");
    }
    const existing = await ctx.db
      .query("referrals")
      .withIndex("by_referred", (q) => q.eq("referredUserId", args.referredUserId))
      .first();
    if (existing) throw new Error("CONFLICT: این کاربر قبلاً ارجاع شده است");
    const id = await ctx.db.insert("referrals", {
      tenantId: actor.tenantId,
      referrerUserId: actor.userId,
      referredUserId: args.referredUserId,
      createdAt: Date.now(),
    });
    return { referralId: id };
  },
});

export const referralList = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx, args.token);
    return await ctx.db
      .query("referrals")
      .withIndex("by_referrer", (q) => q.eq("referrerUserId", actor.userId))
      .collect();
  },
});
