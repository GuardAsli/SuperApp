"use node";
/** GuardAsli — اکشن‌های Node تلگرام: verify initData و ارسال پیام با محافظت token. */
import { v } from "convex/values";
import { action, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { verifyTelegramInitData } from "../core/telegram";
import { validateOutboundUrl } from "../core/ssrf";

export const verifyInitDataAction = internalAction({
  args: {
    initData: v.string(),
    tokenEncrypted: v.string(),
    masterSecret: v.string(),
  },
  handler: async (ctx, args) => {
    // token از پاکت رمزنگاری‌شده باز می‌شود — هرگز لاگ نمی‌شود
    const { decryptSecret } = await import("../core/aead");
    let botToken: string;
    try {
      botToken = decryptSecret(args.tokenEncrypted, args.masterSecret);
    } catch {
      return { ok: false, reason: "DECRYPT_FAILED" };
    }
    const parsed = verifyTelegramInitData(args.initData, botToken);
    if (!parsed) return { ok: false, reason: "BAD_SIGNATURE" };
    return {
      ok: true,
      telegramUserId: parsed.user.id,
      username: parsed.user.username ?? null,
    };
  },
});

/** ارسال پیام bot — webhook-based token هرگز در پاسخ/لاگ ظاهر نمی‌شود. */
export const sendTelegramMessage = action({
  args: {
    apiBase: v.string(),
    botToken: v.string(),
    chatId: v.string(),
    text: v.string(),
  },
  handler: async (ctx, args) => {
    const base = validateOutboundUrl(args.apiBase);
    if (!base.ok) throw new Error(`PROVIDER_ERROR: ${base.reason}`);
    const res = await fetch(`${args.apiBase}/bot${args.botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: args.chatId, text: args.text }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`PROVIDER_ERROR: sendMessage HTTP ${res.status}`);
    return { ok: true };
  },
});

/** تنظیم webhook با secret هر tenant. */
export const setTelegramWebhook = action({
  args: {
    apiBase: v.string(),
    botToken: v.string(),
    webhookUrl: v.string(),
    webhookSecret: v.string(),
  },
  handler: async (ctx, args) => {
    const base = validateOutboundUrl(args.apiBase);
    if (!base.ok) throw new Error(`PROVIDER_ERROR: ${base.reason}`);
    const cb = validateOutboundUrl(args.webhookUrl);
    if (!cb.ok) throw new Error(`PROVIDER_ERROR: ${cb.reason}`);
    const res = await fetch(`${args.apiBase}/bot${args.botToken}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: args.webhookUrl,
        secret_token: args.webhookSecret,
        allowed_updates: ["message", "callback_query"],
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`PROVIDER_ERROR: setWebhook HTTP ${res.status}`);
    return { ok: true };
  },
});
