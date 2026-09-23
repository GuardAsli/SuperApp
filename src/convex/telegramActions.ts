"use node";
/** GuardAsli — اکشن‌های Node تلگرام: رمزنگاری token، verify initData، زنجیره Mini App. */
import { v } from "convex/values";
import { action, internalAction } from "./_generated/server";
import { internal, api } from "./_generated/api";
import { verifyTelegramInitData } from "../core/telegram";
import { encryptSecret, decryptSecret } from "../core/aead";
import { scryptHashSync, scryptVerifySync } from "../core/password";
import { randomToken } from "./runtime";
import { validateOutboundUrl } from "../core/ssrf";

function masterSecret(): string {
  const s = process.env.GA_MASTER_SECRET ?? "";
  if (s.length < 16) {
    throw new Error("INTERNAL_ERROR: GA_MASTER_SECRET پیکربندی نشده است");
  }
  return s;
}

/**
 * ثبت پیکربندی bot: رمزنگاری token با master secret سرور، تولید
 * webhookSecret سمت سرور، سپس فراخوانی botConfigSave با اثبات.
 * کلاینت هرگز token خام یا webhookSecret دلخواه را ارسال نمی‌کند.
 */
export const botConfigSaveAction = action({
  args: {
    token: v.string(),
    botToken: v.string(),
    displayName: v.string(),
    username: v.optional(v.string()),
    description: v.optional(v.string()),
    enabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    if (args.botToken.length < 20) {
      throw new Error("VALIDATION_ERROR: token تلگرام نامعتبر است");
    }
    const enc = encryptSecret(args.botToken, masterSecret());
    const webhookSecret = randomToken(32);
    const res: { botConfigId: string; webhookSecret: string } = await ctx.runMutation(
      api.telegram.botConfigSave,
      {
      token: args.token,
      botTokenEncrypted: enc,
      displayName: args.displayName,
      ...(args.username !== undefined ? { username: args.username } : {}),
      ...(args.description !== undefined ? { description: args.description } : {}),
      enabled: args.enabled,
      webhookSecret,
      proof: masterSecret(),
      },
    );
    return { botConfigId: res.botConfigId, webhookSecret };
  },
});

/**
 * احراز هویت Mini App: initData با bot token واقعی (باز شده از پاکت)
 * تأیید می‌شود؛ سپس session صادر یا ثبت‌نام آغاز می‌گردد.
 * هیچ مسیر جایگزینی برای initDataVerified وجود ندارد.
 */
export const miniAppAuthAction = action({
  args: {
    botConfigId: v.id("botConfigs"),
    initData: v.string(),
    username: v.optional(v.string()),
    password: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const cfg = await ctx.runQuery(internal.telegram.getBotConfigInternal, {
      botConfigId: args.botConfigId,
    });
    if (!cfg || !cfg.enabled) {
      throw new Error("FORBIDDEN: bot فعال نیست");
    }
    let botToken: string;
    try {
      botToken = decryptSecret(cfg.tokenEncrypted, masterSecret());
    } catch {
      throw new Error("INTERNAL_ERROR: رمزگشایی token ناموفق بود");
    }
    const parsed = verifyTelegramInitData(args.initData, botToken);
    if (!parsed) {
      throw new Error("UNAUTHENTICATED: امضای initData نامعتبر است");
    }
    const telegramUserId = parsed.user.id;
    if (args.username && args.password) {
      const { hash } = scryptHashSync(args.password);
      await ctx.runMutation(internal.telegram.miniAppRegisterInternal, {
        botConfigId: args.botConfigId,
        telegramUserId,
        username: args.username,
        passwordEnvelope: hash,
      });
    }
    const session: { accessToken?: string; refreshToken?: string; role?: string; userId?: string; needsRegister?: boolean } =
      await ctx.runMutation(internal.telegram.miniAppAuthInternal, {
      botConfigId: args.botConfigId,
      telegramUserId,
    });
    return { ...session, telegramUserId };
  },
});

/**
 * اتصال کاربر پلتفرم به bot: ادمین همان tenant باید رمز عبور واقعی کاربر
 * را ارائه دهد؛ verify scrypt در node انجام و سپس اتصال اتمی ثبت می‌شود.
 */
export const botUserLinkAction = action({
  args: {
    token: v.string(),
    botConfigId: v.id("botConfigs"),
    telegramUserId: v.number(),
    platformUsername: v.string(),
    password: v.string(),
  },
  handler: async (ctx, args) => {
    // ۱) احراز هویت و مجوز ادمین در همان tenant صاحب bot
    const actor = await ctx.runQuery(internal.auth.assertActor, {
      token: args.token,
      permission: "ManageTelegramBot",
    });
    const cfg = await ctx.runQuery(internal.telegram.getBotConfigInternal, {
      botConfigId: args.botConfigId,
    });
    if (!cfg) throw new Error("NOT_FOUND: bot یافت نشد");
    const tenancy = await ctx.runQuery(internal.auth.checkTenantScope, {
      actorTenantId: actor.tenantId,
      resourceTenantId: cfg.tenantId,
    });
    if (!tenancy.ok) throw new Error("FORBIDDEN: دسترسی بین‌مستأجری مجاز نیست");
    // ۲) یافتن کاربر هدف — باید در همان tenant صاحب bot باشد
    const target = await ctx.runQuery(internal.auth.getUserByUsername, {
      username: args.platformUsername,
    });
    if (!target) throw new Error("NOT_FOUND: کاربر پلتفرم یافت نشد");
    if (target.tenantId !== cfg.tenantId) {
      throw new Error("FORBIDDEN: کاربر متعلق به این bot نیست");
    }
    // ۳) verify واقعی رمز عبور (scrypt در node)
    const creds = await ctx.runQuery(internal.auth.getUserCredentialsById, {
      userId: target._id,
    });
    if (!creds || creds.status !== "active") {
      throw new Error("FORBIDDEN: کاربر غیرفعال است");
    }
    const ok = scryptVerifySync(args.password, creds.passwordHash);
    if (!ok) {
      throw new Error("UNAUTHENTICATED: رمز عبور کاربر نادرست است");
    }
    // ۴) ثبت اتصال
    const res: { botUserId: string } = await ctx.runMutation(
      internal.telegram.botUserLinkInternal,
      {
      botConfigId: args.botConfigId,
      telegramUserId: args.telegramUserId,
      platformUserId: target._id,
      actorUserId: actor.userId,
      },
    );
    return res;
  },
});

/** verify خام initData — برای اکشن‌های دیگر که token بازشده لازم دارند. */
export const verifyInitDataAction = internalAction({
  args: {
    initData: v.string(),
    tokenEncrypted: v.string(),
    masterSecret: v.string(),
  },
  handler: async (_ctx, args) => {
    if (args.masterSecret !== masterSecret()) {
      return { ok: false, reason: "BAD_MASTER_SECRET" };
    }
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

/** ارسال پیام bot — token هرگز در پاسخ/لاگ ظاهر نمی‌شود. */
export const sendTelegramMessage = action({
  args: {
    apiBase: v.string(),
    botToken: v.string(),
    chatId: v.string(),
    text: v.string(),
  },
  handler: async (_ctx, args) => {
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
  handler: async (_ctx, args) => {
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
