"use node";
/** GuardAsli — اکشن‌های Node برای تلگرام: verify initData با bot token رمزگشایی‌شده. */
import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { decryptSecret } from "../core/aead";
import { verifyTelegramInitData } from "../core/telegram";

/**
 * احراز هویت Mini App — verify واقعی روی سرور.
 * کلاینت فقط initData خام می‌فرستد؛ پرچم verified از کلاینت پذیرفته نمی‌شود.
 */
export const miniAppAuthAction = action({
  args: {
    botConfigId: v.id("botConfigs"),
    initData: v.string(),
  },
  handler: async (ctx, args) => {
    const master = process.env.GUARDASLI_MASTER_SECRET;
    if (!master) throw new Error("INTERNAL_ERROR: GUARDASLI_MASTER_SECRET تنظیم نشده");

    const cfg: { tokenEncrypted: string; enabled: boolean } | null = await ctx.runQuery(
      internal.telegram.getBotTokenEnvelope,
      { botConfigId: args.botConfigId },
    );
    if (!cfg || !cfg.enabled) throw new Error("FORBIDDEN: bot فعال نیست");

    let botToken: string;
    try {
      botToken = decryptSecret(cfg.tokenEncrypted, master);
    } catch {
      throw new Error("INTERNAL_ERROR: رمزگشایی توکن bot ناموفق");
    }

    const parsed = verifyTelegramInitData(args.initData, botToken);
    if (!parsed) throw new Error("UNAUTHENTICATED: امضای initData نامعتبر است");

    return await ctx.runMutation(internal.telegram.miniAppCompleteAuth, {
      botConfigId: args.botConfigId,
      telegramUserId: parsed.user.id,
    });
  },
});
