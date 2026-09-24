"use node";
/** GuardAsli — پانل ادمین: ذخیره‌سازی پیکربندی bot از طریق زنجیره‌ی امن اکشن. */
import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal, api } from "./_generated/api";
import { encryptSecret, decryptBotToken } from "../core/aead";

function master(): string {
  const s = process.env.GUARDASLI_MASTER_SECRET;
  if (!s || s.length < 16) throw new Error("INTERNAL_ERROR: GUARDASLI_MASTER_SECRET لازم است");
  return s;
}

function randomSecret(): string {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  let out = "";
  for (const b of arr) out += b.toString(16).padStart(2, "0");
  return out;
}

type WhoAmI = { userId: string; tenantId: string; role: string };
type ManagerCtx = {
  runQuery: (q: typeof api.auth.whoami, args: { token: string }) => Promise<WhoAmI>;
};

async function requireBotManager(ctx: ManagerCtx, token: string): Promise<WhoAmI> {
  const who = await ctx.runQuery(api.auth.whoami, { token });
  if (!["admin", "super_admin"].includes(who.role)) {
    throw new Error("FORBIDDEN: فقط ادمین");
  }
  return who;
}

/**
 * ذخیره پیکربندی bot با رمزنگاری token سمت سرور.
 * webhookSecret سرور تولید می‌شود و اثبات master secret به mutation منتقل می‌گردد
 * تا هیچ کلاینتی نتواند مستقیماً botConfigSave را صدا بزند.
 * شناسه عددی ادمین تلگرام و URL مینی‌اپ هم همین‌جا ذخیره می‌شوند.
 */
export const saveBotConfigAction = action({
  args: {
    token: v.string(),
    botToken: v.string(),
    displayName: v.string(),
    username: v.optional(v.string()),
    description: v.optional(v.string()),
    enabled: v.boolean(),
    adminTelegramUserId: v.optional(v.number()),
    miniAppUrl: v.optional(v.string()),
    apiBase: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ botConfigId: string; webhookSecret: string }> => {
    if (args.botToken.length < 20) {
      throw new Error("VALIDATION_ERROR: توکن ربات نامعتبر است");
    }
    if (
      args.adminTelegramUserId !== undefined &&
      (!Number.isFinite(args.adminTelegramUserId) || args.adminTelegramUserId <= 0)
    ) {
      throw new Error("VALIDATION_ERROR: شناسه ادمین باید عدد مثبت باشد (با /id در ربات بگیرید)");
    }
    if (args.miniAppUrl !== undefined && args.miniAppUrl !== "" && !/^https:\/\//.test(args.miniAppUrl)) {
      throw new Error("VALIDATION_ERROR: آدرس مینی‌اپ باید با https:// شروع شود");
    }
    const who: { userId: string; tenantId: string; role: string } = await ctx.runQuery(
      api.auth.whoami,
      { token: args.token },
    );
    const envelope = encryptSecret(args.botToken, master(), {
      aad: `tenant:${who.tenantId}|purpose:telegram_bot_token`,
      purpose: "telegram_bot_token",
    });
    const res: { botConfigId: string; webhookSecret: string } = await ctx.runMutation(
      api.telegram.botConfigSave,
      {
        token: args.token,
        botTokenEncrypted: envelope,
        displayName: args.displayName,
        ...(args.username !== undefined ? { username: args.username } : {}),
        ...(args.description !== undefined ? { description: args.description } : {}),
        enabled: args.enabled,
        ...(args.adminTelegramUserId !== undefined
          ? { adminTelegramUserId: args.adminTelegramUserId }
          : {}),
        ...(args.miniAppUrl !== undefined && args.miniAppUrl !== ""
          ? { miniAppUrl: args.miniAppUrl }
          : {}),
        webhookSecret: randomSecret(),
        proof: master(),
      },
    );
    return res;
  },
});

/** تنظیم/تغییر شناسه عددی ادمین ربات از پنل وب. */
export const setBotAdminAction = action({
  args: { token: v.string(), adminTelegramUserId: v.optional(v.number()) },
  handler: async (ctx, args): Promise<{ ok: boolean }> => {
    if (
      args.adminTelegramUserId !== undefined &&
      (!Number.isFinite(args.adminTelegramUserId) || args.adminTelegramUserId <= 0)
    ) {
      throw new Error("VALIDATION_ERROR: شناسه ادمین باید عدد مثبت باشد");
    }
    await requireBotManager(ctx, args.token);
    await ctx.runMutation(api.telegram.botConfigSetAdmin, {
      token: args.token,
      adminTelegramUserId: args.adminTelegramUserId,
    });
    return { ok: true };
  },
});

/** تنظیم URL مینی‌اپ از پنل وب + ثبت دکمه منو در تلگرام (اگر bot پیکربندی شده باشد). */
export const setBotMiniAppAction = action({
  args: { token: v.string(), miniAppUrl: v.string() },
  handler: async (ctx, args): Promise<{ ok: boolean; menuButtonSet: boolean }> => {
    if (!/^https:\/\//.test(args.miniAppUrl)) {
      throw new Error("VALIDATION_ERROR: آدرس مینی‌اپ باید با https:// شروع شود");
    }
    await requireBotManager(ctx, args.token);
    await ctx.runMutation(api.telegram.botConfigSetMiniApp, {
      token: args.token,
      miniAppUrl: args.miniAppUrl,
    });
    let menuButtonSet = false;
    const cfg = await ctx.runQuery(api.telegram.botConfigGet, { token: args.token });
    if (cfg) {
      try {
        const ctxCfg = await ctx.runQuery(internal.telegram.getBotConfigInternal, {
          botConfigId: cfg.botConfigId as never,
        });
        if (!ctxCfg) throw new Error("NOT_FOUND");
        const botToken = decryptBotToken(ctxCfg.tokenEncrypted, master());
        await ctx.runAction(internal.telegramActions.setBotMenuButtonInternal, {
          botToken,
          miniAppUrl: args.miniAppUrl,
          text: "اپ من",
        });
        menuButtonSet = true;
      } catch {
        // دکمه منو اختیاری است — URL مینی‌اپ ذخیره شده است
      }
    }
    return { ok: true, menuButtonSet };
  },
});

/** تنظیم خودکار webhook تلگرام از پنل وب: base URL عمومی + secret ذخیره‌شده. */
export const setBotWebhookAction = action({
  args: { token: v.string(), publicBaseUrl: v.string() },
  handler: async (ctx, args): Promise<{ ok: boolean; webhookUrl: string }> => {
    const base = args.publicBaseUrl.trim().replace(/\/+$/, "");
    if (!/^https:\/\/.+/.test(base)) {
      throw new Error("VALIDATION_ERROR: آدرس باید https:// کامل باشد");
    }
    await requireBotManager(ctx, args.token);
    const cfg = await ctx.runQuery(api.telegram.botConfigGet, { token: args.token });
    if (!cfg) throw new Error("NOT_FOUND: ابتدا پیکربندی bot را ذخیره کنید");
    const ctxCfg = await ctx.runQuery(internal.telegram.getBotConfigInternal, {
      botConfigId: cfg.botConfigId as never,
    });
    if (!ctxCfg) throw new Error("NOT_FOUND: پیکربندی bot یافت نشد");
    const botToken = decryptBotToken(ctxCfg.tokenEncrypted, master());
    const webhookUrl = `${base}/api/v1/telegram/webhook/${cfg.botConfigId}`;
    await ctx.runAction(internal.telegramActions.setBotWebhookInternal, {
      botToken,
      webhookUrl,
      webhookSecret: ctxCfg.webhookSecret,
    });
    return { ok: true, webhookUrl };
  },
});
