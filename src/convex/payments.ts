/** GuardAsli — هسته پرداخت با پاسخ‌های redact شده. */
import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { requireActor, requirePermission, requireTenantScope } from "./auth";
import { isTerminalPaid } from "../core/payments/states";

const MAX_CARDS = 10;

async function requireMethodEnabled(ctx: { db: any }, key: string): Promise<void> {
  const method = await ctx.db
    .query("paymentMethods")
    .withIndex("by_key", (q: any) => q.eq("key", key))
    .unique();
  if (!method?.globallyEnabled) {
    throw new Error(`FORBIDDEN: روش پرداخت ${key} غیرفعال است`);
  }
}

function publicCard(c: {
  _id: Id<"paymentCards">;
  ownerName: string;
  enabled: boolean;
  order: number;
  numberLast4?: string;
  number?: string;
}) {
  const last4 =
    c.numberLast4 ??
    (c.number && c.number.length >= 4 ? c.number.slice(-4) : "****");
  return {
    _id: c._id,
    ownerName: c.ownerName,
    enabled: c.enabled,
    order: c.order,
    numberMasked: `****${last4}`,
    numberLast4: last4,
  };
}

export const cardList = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx, args.token);
    await requireMethodEnabled(ctx, "card_to_card");
    const cards = await ctx.db
      .query("paymentCards")
      .withIndex("by_tenant_order", (q) => q.eq("tenantId", actor.tenantId))
      .collect();
    return cards
      .filter((c) => c.enabled || ["admin", "super_admin"].includes(actor.role))
      .map(publicCard);
  },
});

export const cardInsertEncrypted = internalMutation({
  args: {
    token: v.string(),
    numberEncrypted: v.string(),
    numberLast4: v.string(),
    ownerName: v.string(),
    order: v.number(),
  },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx, args.token);
    requirePermission(actor, "ManagePayments");
    if (actor.role !== "super_admin" && actor.role !== "admin") {
      throw new Error("FORBIDDEN: فقط Admin/Super Admin");
    }
    const cards = await ctx.db
      .query("paymentCards")
      .withIndex("by_tenant", (q) => q.eq("tenantId", actor.tenantId))
      .collect();
    if (cards.length >= MAX_CARDS) {
      throw new Error(`VALIDATION_ERROR: حداکثر ${MAX_CARDS} کارت مجاز است`);
    }
    if (!/^\d{4}$/.test(args.numberLast4)) {
      throw new Error("VALIDATION_ERROR: last4 نامعتبر");
    }
    if (!args.ownerName.trim() || args.ownerName.length > 120) {
      throw new Error("VALIDATION_ERROR: نام صاحب کارت نامعتبر است");
    }
    const id = await ctx.db.insert("paymentCards", {
      tenantId: actor.tenantId,
      number: `****${args.numberLast4}`,
      numberLast4: args.numberLast4,
      numberEncrypted: args.numberEncrypted,
      ownerName: args.ownerName.trim().slice(0, 120),
      enabled: true,
      order: args.order,
    });
    await ctx.runMutation(internal.audit.log, {
      actorUserId: actor.userId,
      tenantId: actor.tenantId,
      action: "payment.card_add",
      entityType: "paymentCards",
      entityId: id,
      metadata: { last4: args.numberLast4 },
    });
    return { cardId: id };
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
    if (actor.role !== "super_admin" && actor.role !== "admin") {
      throw new Error("FORBIDDEN: فقط Admin/Super Admin");
    }
    const cards = await ctx.db
      .query("paymentCards")
      .withIndex("by_tenant", (q) => q.eq("tenantId", actor.tenantId))
      .collect();
    if (cards.length >= MAX_CARDS) {
      throw new Error(`VALIDATION_ERROR: حداکثر ${MAX_CARDS} کارت مجاز است`);
    }
    const num = args.number.replace(/\s/g, "");
    if (!/^\d{16,24}$/.test(num)) {
      throw new Error("VALIDATION_ERROR: شماره کارت نامعتبر است");
    }
    const last4 = num.slice(-4);
    const id = await ctx.db.insert("paymentCards", {
      tenantId: actor.tenantId,
      number: `****${last4}`,
      numberLast4: last4,
      ownerName: args.ownerName.trim().slice(0, 120),
      enabled: true,
      order: args.order,
    });
    await ctx.runMutation(internal.audit.log, {
      actorUserId: actor.userId,
      tenantId: actor.tenantId,
      action: "payment.card_add_masked_only",
      entityType: "paymentCards",
      entityId: id,
      metadata: { last4 },
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
    await requireMethodEnabled(ctx, "card_to_card");
    if (args.idempotencyKey.length < 8 || args.idempotencyKey.length > 128) {
      throw new Error("VALIDATION_ERROR: idempotencyKey نامعتبر است");
    }
    const card = await ctx.db.get(args.cardId);
    if (!card || !card.enabled) throw new Error("NOT_FOUND: کارت فعال یافت نشد");
    await requireTenantScope(ctx, actor, card.tenantId);
    if (!Number.isInteger(args.amount) || args.amount <= 0 || args.amount > 1_000_000_000) {
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
    const reason = (args.reason ?? "").slice(0, 500);
    if (args.decision === "approve") {
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
      // بعد از تایید کارت‌به‌کارت هم لینک ورود کاربر می‌رود (غیرمسدودکننده).
      // ارسال از طریق scheduler انجام می‌شود (در mutation اجازه‌ی runAction نیست).
      try {
        await ctx.scheduler.runAfter(0, internal.telegramActions.sendLoginLinkAction, {
          userId: payment.userId,
          tenantId: payment.tenantId,
        });
      } catch {
        // غیرمسدودکننده
      }
    } else if (args.decision === "reject") {
      await ctx.db.patch(args.paymentId, {
        status: "rejected",
        reviewedBy: actor.userId,
        reviewedAt: Date.now(),
      });
    } else {
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
      metadata: { amount: payment.amount, reason },
    });
    return { ok: true };
  },
});

/** فقط فیلدهای لازم برای review — بدون providerPayload خام. */
export const pendingPayments = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx, args.token);
    requirePermission(actor, "ManagePayments");
    const rows = await ctx.db
      .query("payments")
      .withIndex("by_tenant_status", (q) =>
        q.eq("tenantId", actor.tenantId).eq("status", "pending_review"),
      )
      .collect();
    return rows.map((p) => ({
      _id: p._id,
      userId: p.userId,
      method: p.method,
      amount: p.amount,
      status: p.status,
      cardId: p.cardId ?? null,
      hasReceipt: Boolean(p.receiptStorageId),
      createdAt: p.createdAt,
    }));
  },
});

export const myPayments = query({
  args: { token: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx, args.token);
    const rows = await ctx.db
      .query("payments")
      .withIndex("by_user", (q) => q.eq("userId", actor.userId))
      .order("desc")
      .take(Math.min(args.limit ?? 50, 100));
    return rows.map((p) => ({
      _id: p._id,
      method: p.method,
      amount: p.amount,
      status: p.status,
      createdAt: p.createdAt,
      paymentLink: p.paymentLink ?? null,
    }));
  },
});

export const methodSetEnabled = mutation({
  args: { token: v.string(), key: v.string(), enabled: v.boolean() },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx, args.token);
    requirePermission(actor, "ManagePayments");
    if (actor.role !== "super_admin") {
      throw new Error("FORBIDDEN: فقط Super Admin");
    }
    const allowed = ["admin_manual", "card_to_card", "cubepay", "tetraminator"];
    if (!allowed.includes(args.key)) {
      throw new Error("VALIDATION_ERROR: روش پرداخت ناشناخته");
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

export const myProviderConfigList = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx, args.token);
    const rows = await ctx.db
      .query("userPaymentConfigs")
      .withIndex("by_user_provider", (q) => q.eq("userId", actor.userId))
      .collect();
    return rows.map((r) => ({
      provider: r.provider,
      enabled: r.enabled,
      baseUrl: r.baseUrl ?? null,
      label: r.label ?? null,
      hasSecret: r.credentialsEncrypted.length > 0,
      updatedAt: r.updatedAt,
    }));
  },
});

export const saveUserProviderConfig = internalMutation({
  args: {
    token: v.string(),
    provider: v.string(),
    credentialsEncrypted: v.string(),
    baseUrl: v.string(),
    enabled: v.boolean(),
    label: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx, args.token);
    const existing = await ctx.db
      .query("userPaymentConfigs")
      .withIndex("by_user_provider", (q) =>
        q.eq("userId", actor.userId).eq("provider", args.provider),
      )
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        credentialsEncrypted: args.credentialsEncrypted,
        baseUrl: args.baseUrl,
        enabled: args.enabled,
        ...(args.label !== undefined ? { label: args.label } : {}),
        updatedAt: Date.now(),
      });
      return { configId: existing._id };
    }
    const id = await ctx.db.insert("userPaymentConfigs", {
      userId: actor.userId,
      tenantId: actor.tenantId,
      provider: args.provider,
      credentialsEncrypted: args.credentialsEncrypted,
      baseUrl: args.baseUrl,
      enabled: args.enabled,
      ...(args.label !== undefined ? { label: args.label } : {}),
      updatedAt: Date.now(),
    });
    return { configId: id };
  },
});

export const deleteUserProviderConfig = mutation({
  args: { token: v.string(), provider: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx, args.token);
    const existing = await ctx.db
      .query("userPaymentConfigs")
      .withIndex("by_user_provider", (q) =>
        q.eq("userId", actor.userId).eq("provider", args.provider),
      )
      .unique();
    if (!existing) throw new Error("NOT_FOUND: پیکربندی یافت نشد");
    await ctx.db.delete(existing._id);
    await ctx.runMutation(internal.audit.log, {
      actorUserId: actor.userId,
      tenantId: actor.tenantId,
      action: "payment.user_provider_delete",
      entityType: "userPaymentConfigs",
      entityId: existing._id,
      metadata: { provider: args.provider },
    });
    return { ok: true };
  },
});

export const getUserProviderEnvelope = internalQuery({
  args: { userId: v.id("users"), provider: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("userPaymentConfigs")
      .withIndex("by_user_provider", (q) =>
        q.eq("userId", args.userId).eq("provider", args.provider),
      )
      .unique();
    if (!row) return null;
    return {
      credentialsEncrypted: row.credentialsEncrypted,
      baseUrl: row.baseUrl,
      enabled: row.enabled,
    };
  },
});

export const getPaymentInternal = internalQuery({
  args: { paymentId: v.id("payments") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.paymentId);
  },
});

export const prepareProviderPayment = internalMutation({
  args: {
    token: v.string(),
    method: v.string(),
    amount: v.number(),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx, args.token);
    await requireMethodEnabled(ctx, args.method);
    if (!Number.isInteger(args.amount) || args.amount <= 0 || args.amount > 1_000_000_000) {
      throw new Error("VALIDATION_ERROR: مبلغ نامعتبر است");
    }
    if (args.idempotencyKey.length < 8 || args.idempotencyKey.length > 128) {
      throw new Error("VALIDATION_ERROR: idempotencyKey نامعتبر است");
    }
    const dupe = await ctx.db
      .query("payments")
      .withIndex("by_idempotency", (q) => q.eq("idempotencyKey", args.idempotencyKey))
      .first();
    if (dupe) {
      return {
        paymentId: dupe._id,
        userId: dupe.userId,
        paymentLink: dupe.paymentLink,
        deduped: true,
      };
    }
    const paymentId = await ctx.db.insert("payments", {
      tenantId: actor.tenantId,
      userId: actor.userId,
      method: args.method,
      amount: args.amount,
      status: "awaiting_verify",
      idempotencyKey: args.idempotencyKey,
      attemptCount: 0,
      createdAt: Date.now(),
    });
    return { paymentId, userId: actor.userId, paymentLink: undefined, deduped: false };
  },
});

export const attachProviderInvoice = internalMutation({
  args: {
    paymentId: v.id("payments"),
    providerPaymentId: v.string(),
    paymentLink: v.optional(v.string()),
    payload: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const payment = await ctx.db.get(args.paymentId);
    if (!payment) throw new Error("NOT_FOUND");
    if (isTerminalPaid(payment.status)) return { ok: true };
    await ctx.db.patch(args.paymentId, {
      providerPaymentId: args.providerPaymentId,
      ...(args.paymentLink !== undefined ? { paymentLink: args.paymentLink } : {}),
      ...(args.payload !== undefined ? { providerPayload: args.payload } : {}),
      status: "awaiting_verify",
    });
    return { ok: true };
  },
});

export const markPaymentFailed = internalMutation({
  args: { paymentId: v.id("payments"), reason: v.string() },
  handler: async (ctx, args) => {
    const payment = await ctx.db.get(args.paymentId);
    if (!payment || isTerminalPaid(payment.status)) return { ok: false };
    await ctx.db.patch(args.paymentId, {
      status: "failed",
      providerPayload: { ...(payment.providerPayload as object ?? {}), failReason: args.reason.slice(0, 200) },
    });
    return { ok: true };
  },
});

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

export const acceptProviderPayment = internalMutation({
  args: {
    paymentId: v.id("payments"),
    expectedAmount: v.number(),
    providerPaymentId: v.string(),
  },
  handler: async (ctx, args) => {
    const payment = await ctx.db.get(args.paymentId);
    if (!payment) return { ok: false, reason: "NOT_FOUND" };
    if (payment.status === "paid" || payment.status === "approved") {
      return { ok: true, alreadyPaid: true };
    }
    if (payment.status !== "awaiting_verify" && payment.status !== "processing") {
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
    // بعد از واریز موفق، لینک ورود نقش‌محور به چت تلگرام کاربر می‌رود
    // (اگر ربات/chat تنظیم باشد؛ شکست آن هرگز این تایید را خراب نمی‌کند).
    // ارسال از طریق scheduler انجام می‌شود (در mutation اجازه‌ی runAction نیست).
    try {
      await ctx.scheduler.runAfter(0, internal.telegramActions.sendLoginLinkAction, {
        userId: payment.userId,
        tenantId: payment.tenantId,
      });
    } catch {
      // غیرمسدودکننده
    }
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
