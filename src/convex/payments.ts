/** GuardAsli — هسته پرداخت: چهار روش، وضعیت‌ها و جریان‌های اتمی (بند ۱۶–۲۱). */
import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { requireActor, requirePermission, requireTenantScope } from "./auth";

const MAX_CARDS = 10;

// ————— کارت به کارت (بند ۱۸) —————

export const cardList = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx, args.token);
    const method = await ctx.db
      .query("paymentMethods")
      .withIndex("by_key", (q) => q.eq("key", "card_to_card"))
      .unique();
    if (!method?.globallyEnabled) {
      throw new Error("FORBIDDEN: روش کارت به کارت غیرفعال است");
    }
    return await ctx.db
      .query("paymentCards")
      .withIndex("by_tenant_order", (q) => q.eq("tenantId", actor.tenantId))
      .collect();
  },
});

export const cardAdd = mutation({
  args: {
    token: v.string(),
    number: v.string(),
    ownerName: v.string(),
    order: v.number(),
  },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx, args.token);
    requirePermission(actor, "ManagePayments");
    const cards = await ctx.db
      .query("paymentCards")
      .withIndex("by_tenant", (q) => q.eq("tenantId", actor.tenantId))
      .collect();
    if (cards.length >= MAX_CARDS) {
      throw new Error(`VALIDATION_ERROR: حداکثر ${MAX_CARDS} کارت مجاز است`);
    }
    if (!/^\d{16,24}$/.test(args.number.replace(/\s/g, ""))) {
      throw new Error("VALIDATION_ERROR: شماره کارت نامعتبر است");
    }
    if (!args.ownerName.trim()) {
      throw new Error("VALIDATION_ERROR: نام صاحب کارت لازم است");
    }
    const id = await ctx.db.insert("paymentCards", {
      tenantId: actor.tenantId,
      number: args.number.replace(/\s/g, ""),
      ownerName: args.ownerName.trim(),
      enabled: true,
      order: args.order,
    });
    await ctx.runMutation(internal.audit.log, {
      actorUserId: actor.userId,
      tenantId: actor.tenantId,
      action: "payment.card_add",
      entityType: "paymentCards",
      entityId: id,
    });
    return { cardId: id };
  },
});

export const cardToggle = mutation({
  args: { token: v.string(), cardId: v.id("paymentCards"), enabled: v.boolean() },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx, args.token);
    requirePermission(actor, "ManagePayments");
    const card = await ctx.db.get(args.cardId);
    if (!card) throw new Error("NOT_FOUND: کارت یافت نشد");
    await requireTenantScope(ctx, actor, card.tenantId);
    await ctx.db.patch(args.cardId, { enabled: args.enabled });
    return { ok: true };
  },
});

/** ارسال رسید توسط کاربر → PENDING_REVIEW. */
export const cardToCardSubmit = mutation({
  args: {
    token: v.string(),
    cardId: v.id("paymentCards"),
    amount: v.number(),
    receiptStorageId: v.id("_storage"),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx, args.token);
    const method = await ctx.db
      .query("paymentMethods")
      .withIndex("by_key", (q) => q.eq("key", "card_to_card"))
      .unique();
    if (!method?.globallyEnabled) {
      throw new Error("FORBIDDEN: روش کارت به کارت غیرفعال است");
    }
    const card = await ctx.db.get(args.cardId);
    if (!card || !card.enabled) throw new Error("NOT_FOUND: کارت فعال یافت نشد");
    await requireTenantScope(ctx, actor, card.tenantId);
    if (!Number.isInteger(args.amount) || args.amount <= 0) {
      throw new Error("VALIDATION_ERROR: مبلغ نامعتبر است");
    }
    const dupe = await ctx.db
      .query("payments")
      .withIndex("by_idempotency", (q) => q.eq("idempotencyKey", args.idempotencyKey))
      .first();
    if (dupe) return { paymentId: dupe._id, deduped: true };
    const paymentId = await ctx.db.insert("payments", {
      tenantId: actor.tenantId,
      userId: actor.userId,
      method: "card_to_card",
      amount: args.amount,
      status: "pending_review",
      cardId: args.cardId,
      receiptStorageId: args.receiptStorageId,
      idempotencyKey: args.idempotencyKey,
      attemptCount: 0,
      createdAt: Date.now(),
    });
    await ctx.runMutation(internal.audit.log, {
      actorUserId: actor.userId,
      tenantId: actor.tenantId,
      action: "payment.card_to_card_submit",
      entityType: "payments",
      entityId: paymentId,
      metadata: { amount: args.amount, cardId: args.cardId },
    });
    return { paymentId, deduped: false };
  },
});

/** تصمیم ادمین: تایید / رد / رسید جعلی — اتمی و idempotent (بند ۱۸). */
export const cardReview = mutation({
  args: {
    token: v.string(),
    paymentId: v.id("payments"),
    decision: v.union(v.literal("approve"), v.literal("reject"), v.literal("fraud")),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx, args.token);
    requirePermission(actor, "ManagePayments");
    const payment = await ctx.db.get(args.paymentId);
    if (!payment) throw new Error("NOT_FOUND: پرداخت یافت نشد");
    await requireTenantScope(ctx, actor, payment.tenantId);
    if (payment.method !== "card_to_card") {
      throw new Error("VALIDATION_ERROR: این پرداخت کارت به کارت نیست");
    }
    if (payment.status !== "pending_review") {
      throw new Error("CONFLICT: این پرداخت قبلاً بررسی شده است");
    }
    if (args.decision === "approve") {
      // credit دقیقاً یک‌بار — از طریق Ledger با idempotencyKey مشتق از paymentId
      const walletId = await ctx.runMutation(internal.wallet.getOrCreateWalletId, {
        userId: payment.userId,
      });
      const res = await ctx.runMutation(internal.wallet.ledgerApply, {
        walletId,
        type: "deposit",
        amount: payment.amount,
        direction: "credit",
        reason: `card_to_card approve`,
        idempotencyKey: `card_approve:${args.paymentId}`,
        metadata: { paymentId: args.paymentId, reviewerId: actor.userId },
      });
      await ctx.db.patch(args.paymentId, {
        status: "paid",
        reviewedBy: actor.userId,
        reviewedAt: Date.now(),
        ledgerEntryId: res.ledgerEntryId,
      });
    } else if (args.decision === "reject") {
      await ctx.db.patch(args.paymentId, {
        status: "rejected",
        reviewedBy: actor.userId,
        reviewedAt: Date.now(),
      });
    } else {
      // fraud: بدون credit + مسدودسازی کاربر
      await ctx.db.patch(args.paymentId, {
        status: "fraud",
        reviewedBy: actor.userId,
        reviewedAt: Date.now(),
      });
      await ctx.db.patch(payment.userId, { status: "blocked" });
    }
    await ctx.runMutation(internal.audit.log, {
      actorUserId: actor.userId,
      tenantId: payment.tenantId,
      action: `payment.card_review_${args.decision}`,
      entityType: "payments",
      entityId: args.paymentId,
      metadata: { amount: payment.amount, reason: args.reason },
    });
    return { ok: true };
  },
});

// ————— بررسی صف پرداخت‌های در انتظار —————

export const pendingPayments = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx, args.token);
    requirePermission(actor, "ManagePayments");
    return await ctx.db
      .query("payments")
      .withIndex("by_tenant_status", (q) =>
        q.eq("tenantId", actor.tenantId).eq("status", "pending_review"),
      )
      .collect();
  },
});

// ————— روش‌های پرداخت: کنترل سراسری Super Admin —————

export const methodSetEnabled = mutation({
  args: { token: v.string(), key: v.string(), enabled: v.boolean() },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx, args.token);
    requirePermission(actor, "ManagePayments");
    if (actor.role !== "super_admin") {
      throw new Error("FORBIDDEN: فقط Super Admin");
    }
    const doc = await ctx.db
      .query("paymentMethods")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique();
    if (doc) {
      await ctx.db.patch(doc._id, { globallyEnabled: args.enabled });
    } else {
      await ctx.db.insert("paymentMethods", { key: args.key, globallyEnabled: args.enabled });
    }
    await ctx.runMutation(internal.audit.log, {
      actorUserId: actor.userId,
      action: "payment.method_toggle",
      entityType: "paymentMethods",
      entityId: args.key,
      metadata: { enabled: args.enabled },
    });
    return { ok: true };
  },
});

export const methodList = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    await requireActor(ctx, args.token);
    return await ctx.db.query("paymentMethods").collect();
  },
});

// ————— ثبت پرداخت provider (state machine مشترک) —————

/** ایجاد رکورد پرداخت provider — بدون credit؛ credit فقط بعد از verify. */
export const providerPaymentCreate = internalMutation({
  args: {
    tenantId: v.id("tenants"),
    userId: v.id("users"),
    method: v.string(),
    amount: v.number(),
    providerPaymentId: v.string(),
    providerPayload: v.optional(v.any()),
    idempotencyKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.idempotencyKey) {
      const dupe = await ctx.db
        .query("payments")
        .withIndex("by_idempotency", (q) => q.eq("idempotencyKey", args.idempotencyKey!))
        .first();
      if (dupe) return { paymentId: dupe._id, deduped: true };
    }
    const paymentId = await ctx.db.insert("payments", {
      tenantId: args.tenantId,
      userId: args.userId,
      method: args.method,
      amount: args.amount,
      status: "awaiting_verify",
      providerPaymentId: args.providerPaymentId,
      ...(args.providerPayload !== undefined ? { providerPayload: args.providerPayload } : {}),
      ...(args.idempotencyKey !== undefined ? { idempotencyKey: args.idempotencyKey } : {}),
      attemptCount: 0,
      createdAt: Date.now(),
    });
    return { paymentId, deduped: false };
  },
});

/**
 * acceptProviderPayment — تنها مسیر credit شدن Wallet از پرداخت provider.
 * Webhook هرگز مستقیماً Wallet را credit نمی‌کند؛ این mutation فقط پس از
 * verify موفق adapter صدا زده می‌شود و ضد-replay است.
 */
export const acceptProviderPayment = internalMutation({
  args: {
    paymentId: v.id("payments"),
    expectedAmount: v.number(),
    providerPaymentId: v.string(),
  },
  handler: async (ctx, args) => {
    const payment = await ctx.db.get(args.paymentId);
    if (!payment) return { ok: false, reason: "NOT_FOUND" };
    if (payment.status === "paid") {
      return { ok: true, alreadyPaid: true }; // ضد-replay
    }
    if (payment.status !== "awaiting_verify") {
      return { ok: false, reason: `status=${payment.status}` };
    }
    if (payment.providerPaymentId !== args.providerPaymentId) {
      return { ok: false, reason: "provider_payment_id mismatch" };
    }
    if (payment.amount !== args.expectedAmount) {
      return { ok: false, reason: "amount mismatch" };
    }
    const walletId: Id<"wallets"> = await ctx.runMutation(internal.wallet.getOrCreateWalletId, {
      userId: payment.userId,
    });
    const res: { ledgerEntryId: Id<"ledgerEntries">; balanceAfter: number; deduped: boolean } =
      await ctx.runMutation(internal.wallet.ledgerApply, {
      walletId,
      type: "deposit",
      amount: payment.amount,
      direction: "credit",
      reason: `provider payment ${payment.method}`,
      idempotencyKey: `provider_accept:${args.paymentId}`,
      metadata: { paymentId: args.paymentId },
    });
    await ctx.db.patch(args.paymentId, {
      status: "paid",
      ledgerEntryId: res.ledgerEntryId,
      reviewedAt: Date.now(),
    });
    await ctx.runMutation(internal.audit.log, {
      tenantId: payment.tenantId,
      actorUserId: payment.userId,
      action: "payment.provider_paid",
      entityType: "payments",
      entityId: args.paymentId,
      metadata: { method: payment.method, amount: payment.amount },
    });
    return { ok: true, alreadyPaid: false, balanceAfter: res.balanceAfter };
  },
});
