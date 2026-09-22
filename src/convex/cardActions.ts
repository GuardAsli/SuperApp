"use node";
/** GuardAsli — کارت با purpose payment_card. */
import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { encryptSecret } from "../core/aead";

function master(): string {
  const s = process.env.GUARDASLI_MASTER_SECRET;
  if (!s || s.length < 16) {
    throw new Error("INTERNAL_ERROR: GUARDASLI_MASTER_SECRET لازم است");
  }
  return s;
}

export const cardAddAction = action({
  args: {
    token: v.string(),
    number: v.string(),
    ownerName: v.string(),
    order: v.number(),
  },
  handler: async (ctx, args) => {
    const num = args.number.replace(/\s/g, "");
    if (!/^\d{16,24}$/.test(num)) {
      throw new Error("VALIDATION_ERROR: شماره کارت نامعتبر است");
    }
    const last4 = num.slice(-4);
    const envelope = encryptSecret(num, master(), {
      aad: `purpose:payment_card|last4:${last4}`,
      purpose: "payment_card",
    });
    return await ctx.runMutation(internal.payments.cardInsertEncrypted, {
      token: args.token,
      numberEncrypted: envelope,
      numberLast4: last4,
      ownerName: args.ownerName,
      order: args.order,
    });
  },
});
