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

    // ————— دی‌دوپ: آپدیت تکراری وبهوک → یک پاسخ، نه دو منو پشت هم —————
    // تلگرام در چند حالت همان آپدیت را دوباره می‌فرستد (retry شبکه، دابل‌ارسال،
    // تپ پشت‌سرهم روی دکمه منو). بدون دی‌دوپ، هر آپدیت یک job جدا می‌سازد و کاربر
    // همان منو را چندبار پشت هم می‌گیرد. پنجره ۱۰ ثانیه‌ای کافی است؛ فرمان‌های
    // واقعیِ تکراریِ بعد از آن عادی پردازش می‌شوند.
    const DEDUPE_WINDOW_MS = 10_000;
    const cutoff = Date.now() - DEDUPE_WINDOW_MS;
    const recent = await ctx.db
      .query("jobs")
      .withIndex("by_kind", (q) => q.eq("kind", "bot_command"))
      .filter(
        (q) =>
          q.and(
            q.gte(q.field("nextRunAt"), cutoff),
            q.neq(q.field("status"), "failed"),
          ),
      )
      .collect();
    const dupe = recent.find(
      (j) =>
        j.payload &&
        (j.payload as Record<string, unknown>).botConfigId === args.botConfigId &&
        (j.payload as Record<string, unknown>).chatId === args.chatId &&
        (j.payload as Record<string, unknown>).text === text,
    );
    if (dupe) return { ok: true, deduped: true };

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
    return { ok: true, deduped: false };
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
