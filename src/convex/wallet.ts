/** GuardAsli — Wallet با Ledger تغییرناپذیر و idempotency (بند ۱۵ و ۴۳). */
import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { requireActor, requirePermission, requireTenantScope, type ActorContext } from "./auth";

/** ثبت یک Ledger Entry اتمی روی Wallet — تنها راه تغییر balance. */
export const ledgerApply = internalMutation({
  args: {
    walletId: v.id("wallets"),
    type: v.string(),
    amount: v.number(),
    direction: v.union(v.literal("credit"), v.literal("debit")),
    reason: v.string(),
    idempotencyKey: v.optional(v.string()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    if (!Number.isInteger(args.amount) || args.amount <= 0) {
      throw new Error("VALIDATION_ERROR: مبلغ باید عدد صحیح مثبت باشد");
    }
    // idempotency: همان کلید → همان نتیجه بدون اثر مجدد
    if (args.idempotencyKey) {
      const dupe = await ctx.db
        .query("ledgerEntries")
        .withIndex("by_idempotency", (q) => q.eq("idempotencyKey", args.idempotencyKey))
        .first();
      if (dupe) {
        return { ledgerEntryId: dupe._id, balanceAfter: dupe.balanceAfter, deduped: true };
      }
    }
    const wallet = await ctx.db.get(args.walletId);
    if (!wallet) throw new Error("NOT_FOUND: کیف پول یافت نشد");
    if (wallet.status !== "active") throw new Error("FORBIDDEN: کیف پول فعال نیست");
    const delta = args.direction === "credit" ? args.amount : -args.amount;
    const balanceAfter = wallet.balance + delta;
    if (balanceAfter < 0) {
      throw new Error("CONFLICT: موجودی کافی نیست");
    }
    const seq = wallet.seq + 1;
    const entryId = await ctx.db.insert("ledgerEntries", {
      walletId: args.walletId,
      tenantId: wallet.tenantId,
      seq,
      type: args.type,
      amount: args.amount,
      direction: args.direction,
      balanceAfter,
      reason: args.reason,
      ...(args.idempotencyKey !== undefined ? { idempotencyKey: args.idempotencyKey } : {}),
      ...(args.metadata !== undefined ? { metadata: args.metadata } : {}),
      createdAt: Date.now(),
    });
    await ctx.db.patch(args.walletId, { balance: balanceAfter, seq });
    return { ledgerEntryId: entryId, balanceAfter, deduped: false };
  },
});

export const getOrCreateWallet = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("wallets")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();
    if (existing) return existing;
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("NOT_FOUND: کاربر یافت نشد");
    const walletId = await ctx.db.insert("wallets", {
      tenantId: user.tenantId,
      userId: args.userId,
      balance: 0,
      seq: 0,
      status: "active",
    });
    return await ctx.db.get(walletId);
  },
});

export const walletGet = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx, args.token);
    const wallet = await ctx.db
      .query("wallets")
      .withIndex("by_user", (q) => q.eq("userId", actor.userId))
      .unique();
    if (wallet) await requireTenantScope(ctx, actor, wallet.tenantId);
    return wallet ?? null;
  },
});

export const walletHistory = query({
  args: { token: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx, args.token);
    const wallet = await ctx.db
      .query("wallets")
      .withIndex("by_user", (q) => q.eq("userId", actor.userId))
      .unique();
    if (!wallet) return [];
    await requireTenantScope(ctx, actor, wallet.tenantId);
    const entries = await ctx.db
      .query("ledgerEntries")
      .withIndex("by_wallet_seq", (q) => q.eq("walletId", wallet._id))
      .order("desc")
      .take(Math.min(args.limit ?? 50, 200));
    return entries;
  },
});

/** شارژ دستی توسط Admin/Super Admin (بند ۱۷) — Ledger + idempotency. */
export const adminManualCredit = mutation({
  args: {
    token: v.string(),
    targetUserId: v.id("users"),
    amount: v.number(),
    reason: v.string(),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx, args.token);
    requirePermission(actor, "ManageWallet");
    const target = await ctx.db.get(args.targetUserId);
    if (!target) throw new Error("NOT_FOUND: کاربر مقصد یافت نشد");
    await requireTenantScope(ctx, actor, target.tenantId);
    if (!Number.isInteger(args.amount) || args.amount <= 0) {
      throw new Error("VALIDATION_ERROR: مبلغ نامعتبر است");
    }
    const wallet = await ctx.db
      .query("wallets")
      .withIndex("by_user", (q) => q.eq("userId", args.targetUserId))
      .unique();
    const walletId =
      wallet?._id ??
      (await ctx.runMutation(internal.wallet.getOrCreateWalletId, { userId: args.targetUserId }));
    const res: { ledgerEntryId: Id<"ledgerEntries">; balanceAfter: number; deduped: boolean } =
      await ctx.runMutation(internal.wallet.ledgerApply, {
        walletId: walletId as Id<"wallets">,
        type: "admin_credit",
        amount: args.amount,
        direction: "credit",
        reason: args.reason,
        idempotencyKey: args.idempotencyKey,
        metadata: { actorUserId: actor.userId },
      });
    await ctx.runMutation(internal.audit.log, {
      actorUserId: actor.userId,
      tenantId: target.tenantId,
      action: "wallet.admin_credit",
      entityType: "wallet",
      entityId: walletId,
      metadata: { amount: args.amount, targetUserId: args.targetUserId, reason: args.reason },
    });
    return res;
  },
});

export const getOrCreateWalletId = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("wallets")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();
    if (existing) return existing._id;
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("NOT_FOUND: کاربر یافت نشد");
    return await ctx.db.insert("wallets", {
      tenantId: user.tenantId,
      userId: args.userId,
      balance: 0,
      seq: 0,
      status: "active",
    });
  },
});
