/** GuardAsli — Dispatcher صف‌ها: دستورات bot، verify پرداخت، نگهداری دوره‌ای. */
import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

/** ثبت دستور bot در صف پرداخت — پاسخ نهایی توسط worker/اکشن ارسال می‌شود. */
export const dispatchBotCommand = internalMutation({
  args: {
    botConfigId: v.id("botConfigs"),
    chatId: v.string(),
    text: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("jobs", {
      kind: "bot_command",
      payload: { botConfigId: args.botConfigId, chatId: args.chatId, text: args.text },
      status: "queued",
      attempts: 0,
      maxAttempts: 3,
      nextRunAt: Date.now(),
    });
    return { ok: true };
  },
});

/** enqueue verify پرداخت — از webhook ها؛ ضد-replay از طریق وضعیت payments. */
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
