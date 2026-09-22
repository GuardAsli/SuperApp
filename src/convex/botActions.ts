"use node";
/** GuardAsli — ذخیره امن توکن ربات با AES-GCM + AAD. */
import { v } from "convex/values";
import { action } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { encryptSecret } from "../core/aead";

function master(): string {
  const s = process.env.GUARDASLI_MASTER_SECRET;
  if (!s || s.length < 16) throw new Error("INTERNAL_ERROR: GUARDASLI_MASTER_SECRET لازم است");
  return s;
}

export const saveBotConfigAction = action({
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
      throw new Error("VALIDATION_ERROR: توکن ربات نامعتبر است");
    }
    const who = await ctx.runQuery(api.auth.whoami, { token: args.token });
    const envelope = encryptSecret(args.botToken, master(), {
      aad: `tenant:${who.tenantId}|purpose:telegram_bot_token`,
    });
    return await ctx.runMutation(api.telegram.botConfigSave, {
      token: args.token,
      tokenEncrypted: envelope,
      displayName: args.displayName,
      username: args.username,
      description: args.description,
      enabled: args.enabled,
    });
  },
});
