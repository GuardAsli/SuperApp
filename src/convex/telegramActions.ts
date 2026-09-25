"use node";
/** GuardAsli — اکشن‌های Node تلگرام: رمزنگاری token، verify initData، زنجیره Mini App. */
import { v } from "convex/values";
import { action, internalAction } from "./_generated/server";
import { internal, api } from "./_generated/api";
import { verifyTelegramInitData } from "../core/telegram";
import { decryptBotToken, decryptSecret } from "../core/aead";
import { scryptHashSync, scryptVerifySync } from "../core/password";
import { validateOutboundUrl } from "../core/ssrf";

function masterSecret(): string {
  const s = process.env.GUARDASLI_MASTER_SECRET ?? "";
  if (s.length < 16) {
    throw new Error("INTERNAL_ERROR: GUARDASLI_MASTER_SECRET پیکربندی نشده است");
  }
  return s;
}

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
      botToken = decryptBotToken(cfg.tokenEncrypted, masterSecret());
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

/** مبنا Bot API — پیش‌فرض رسمی؛ در تست محلی با TELEGRAM_API_BASE قابل ریدایرکت است. */
export function botApiBase(): string {
  const raw = process.env.TELEGRAM_API_BASE ?? "";
  if (!raw) return "https://api.telegram.org";
  return raw.replace(/\/+$/, "");
}

/** آدرس عمومی پنل — از env همان دپلویمنت؛ پایه‌ی همه‌ی تنظیم‌های خودکار webhook. */
export function publicBaseUrl(): string {
  const raw = (process.env.GUARDASLI_PUBLIC_URL ?? process.env.CONVEX_SITE_URL ?? "").trim();
  return raw.replace(/\/+$/, "");
}

/** نرمال‌سازی مبنای عمومی ورودی؛ اگر خالی باشد از env دپلویمنت می‌خواند. */
export function resolvePublicBase(input?: string | null): string {
  const raw = (input ?? "").trim() || publicBaseUrl();
  return raw.replace(/\/+$/, "");
}

/** تماس مستقیم با setWebhook تلگرام — استفاده‌ی مشترک اکشن و ترمیم روزانه. */
async function pushWebhook(
  botToken: string,
  webhookUrl: string,
  webhookSecret: string,
): Promise<void> {
  const cb = validateOutboundUrl(webhookUrl);
  if (!cb.ok) throw new Error(`PROVIDER_ERROR: ${cb.reason}`);
  const res = await fetch(`${botApiBase()}/bot${botToken}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: webhookUrl,
      secret_token: webhookSecret,
      allowed_updates: ["message", "callback_query"],
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `PROVIDER_ERROR: setWebhook HTTP ${res.status}${detail ? ` — ${detail.slice(0, 200)}` : ""}`,
    );
  }
}

export interface WebhookRepairResult {
  ok: boolean;
  checked: number;
  set: number;
  failed: string[];
  reason?: string;
}

/**
 * ترمیم خودکار webhook همه‌ی ربات‌های روشن (cron روزانه).
 * اگر webhook در تلگرام پاک شده یا دامنه عوض شده باشد، خودش دوباره ثبت می‌شود.
 */
export const ensureBotWebhooksInternal = internalAction({
  args: {},
  handler: async (ctx): Promise<WebhookRepairResult> => {
    const base = publicBaseUrl();
    if (!/^https:\/\/.+/.test(base)) {
      return {
        ok: false,
        checked: 0,
        set: 0,
        failed: [],
        reason: "GUARDASLI_PUBLIC_URL روی دپلویمنت تنظیم نشده است",
      };
    }
    const cfgs = await ctx.runQuery(internal.telegram.listEnabledBotConfigsInternal, {});
    const failed: string[] = [];
    let set = 0;
    for (const c of cfgs) {
      try {
        const botToken = decryptBotToken(c.tokenEncrypted, masterSecret());
        await pushWebhook(botToken, `${base}/api/v1/telegram/webhook/${c._id}`, c.webhookSecret);
        set++;
      } catch (e) {
        failed.push(`${c.displayName}: ${e instanceof Error ? e.message : "خطا"}`);
      }
    }
    return { ok: failed.length === 0, checked: cfgs.length, set, failed };
  },
});

/** ارسال پاسخ bot از worker — فقط internal، بدون apiBase از کلاینت. */
export const sendBotReply = internalAction({
  args: {
    botToken: v.string(),
    chatId: v.string(),
    text: v.string(),
  },
  handler: async (_ctx, args) => {
    const res = await fetch(`${botApiBase()}/bot${args.botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: args.chatId, text: args.text.slice(0, 4000) }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`PROVIDER_ERROR: sendMessage HTTP ${res.status}`);
    return { ok: true };
  },
});

/** تنظیم webhook با secret — نسخه internal برای worker (/webhook ادمین). */
export const setBotWebhookInternal = internalAction({
  args: {
    botToken: v.string(),
    webhookUrl: v.string(),
    webhookSecret: v.string(),
  },
  handler: async (_ctx, args) => {
    await pushWebhook(args.botToken, args.webhookUrl, args.webhookSecret);
    return { ok: true };
  },
});

/** دکمه منوی bot برای باز کردن مینی‌اپ — نسخه internal. */
export const setBotMenuButtonInternal = internalAction({
  args: {
    botToken: v.string(),
    miniAppUrl: v.string(),
    text: v.string(),
  },
  handler: async (_ctx, args) => {
    const res = await fetch(`${botApiBase()}/bot${args.botToken}/setChatMenuButton`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        menu_button: { type: "web_app", text: args.text.slice(0, 60), web_app: { url: args.miniAppUrl } },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`PROVIDER_ERROR: setChatMenuButton HTTP ${res.status}`);
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
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(
        `PROVIDER_ERROR: setWebhook HTTP ${res.status}${detail ? ` — ${detail.slice(0, 200)}` : ""}`,
      );
    }
    return { ok: true };
  },
});
