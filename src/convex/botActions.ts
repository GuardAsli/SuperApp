"use node";
/** GuardAsli — پانل ادمین: ذخیره‌سازی پیکربندی bot از طریق زنجیره‌ی امن اکشن. */
import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal, api } from "./_generated/api";
import { encryptSecret } from "../core/aead";

function master(): string {
  const s = process.env.GUARDASLI_MASTER_SECRET;
  if (!s || s.length < 16) throw new Error("INTERNAL_ERROR: GUARDASLI_MASTER_SECRET لازم است");
  return s;
}

/**
 * ذخیره پیکربندی bot با رمزنگاری token سمت سرور.
 * webhookSecret سرور تولید می‌شود و اثبات master secret به mutation منتقل می‌گردد
 * تا هیچ کلاینتی نتواند مستقیماً botConfigSave را صدا بزند.
 */
export const saveBotConfigAction = action({
  args: {
    token: v.string(),
    botToken: v.string(),
    displayName: v.string(),
    username: v.optional(v.string()),
    description: v.optional(v.string()),
    enabled: v.boolean(),
    apiBase: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ botConfigId: string; webhookSecret: string }> => {
    if (args.botToken.length < 20) {
      throw new Error("VALIDATION_ERROR: توکن ربات نامعتبر است");
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
        webhookSecret: randomSecret(),
        proof: master(),
      },
    );
    return res;
  },
});

function randomSecret(): string {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  let out = "";
  for (const b of arr) out += b.toString(16).padStart(2, "0");
  return out;
}
