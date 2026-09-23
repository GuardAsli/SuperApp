/** GuardAsli — Dispatcher صف‌ها + پاک‌سازی نشست. */
import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

export const dispatchBotCommand = internalMutation({
  args: {
    botConfigId: v.id("botConfigs"),
    chatId: v.string(),
    text: v.string(),
    telegramUserId: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // محدود کردن طول متن bot برای جلوگیری از payload عظیم
    const text = args.text.slice(0, 4096);
    await ctx.db.insert("jobs", {
      kind: "bot_command",
      payload: {
        botConfigId: args.botConfigId,
        chatId: args.chatId,
        text,
        telegramUserId: args.telegramUserId ?? null,
      },
      status: "queued",
      attempts: 0,
      maxAttempts: 3,
      nextRunAt: Date.now(),
    });
    return { ok: true };
  },
});

export const enqueuePaymentVerify = internalMutation({
  args: {
    paymentId: v.id("payments"),
    provider: v.string(),
    providerPaymentId: v.string(),
  },
  handler: async (ctx, args) => {
    const payment = await ctx.db.get(args.paymentId);
    if (!payment) return { ok: false, reason: "NOT_FOUND" };
    if (payment.status === "paid") return { ok: true, alreadyPaid: true };
    if (payment.providerPaymentId && payment.providerPaymentId !== args.providerPaymentId) {
      return { ok: false, reason: "provider_payment_id mismatch" };
    }
    await ctx.db.insert("jobs", {
      kind: "payment_verify",
      tenantId: payment.tenantId,
      payload: {
        paymentId: args.paymentId,
        provider: args.provider,
        providerPaymentId: args.providerPaymentId,
      },
      status: "queued",
      attempts: 0,
      maxAttempts: 5,
      nextRunAt: Date.now(),
    });
    return { ok: true };
  },
});

/** باطل‌سازی نشست‌های منقضی — cron. */
export const purgeExpiredSessions = internalMutation({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const lim = Math.min(args.limit ?? 200, 500);
    const now = Date.now();
    const rows = await ctx.db
      .query("sessions")
      .withIndex("by_status_expires", (q) => q.eq("status", "active"))
      .filter((q) => q.lt(q.field("expiresAt"), now))
      .take(lim);
    for (const s of rows) {
      await ctx.db.patch(s._id, { status: "expired" });
    }
    return { purged: rows.length };
  },
});
