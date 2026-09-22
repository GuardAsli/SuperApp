"use node";
/** GuardAsli — CubePay/Tetraminator با AAD روی اسرار کاربر. */
import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal, api } from "./_generated/api";
import { decryptSecret, encryptSecret } from "../core/aead";
import { cubePayAdapter, CUBEPAY_BASE } from "../core/payments/cubepay";
import {
  tetraminatorAdapter,
  TETRAMINATOR_DEFAULT_BASE,
  TETRAMINATOR_MIN,
  TETRAMINATOR_MAX,
} from "../core/payments/tetraminator";

function masterSecret(): string {
  const s = process.env.GUARDASLI_MASTER_SECRET;
  if (!s || s.length < 16) {
    throw new Error("INTERNAL_ERROR: GUARDASLI_MASTER_SECRET تنظیم نشده یا کوتاه است");
  }
  return s;
}

function publicBaseUrl(): string {
  return process.env.GUARDASLI_PUBLIC_URL ?? process.env.CONVEX_SITE_URL ?? "https://localhost";
}

function aadFor(userId: string, provider: string): string {
  return `user:${userId}|provider:${provider}|purpose:payment_credentials`;
}

export const saveUserProviderConfigAction = action({
  args: {
    token: v.string(),
    provider: v.union(v.literal("cubepay"), v.literal("tetraminator")),
    apiKeyOrToken: v.string(),
    baseUrl: v.optional(v.string()),
    enabled: v.boolean(),
    label: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.apiKeyOrToken.length < 8) {
      throw new Error("VALIDATION_ERROR: کلید/توکن نامعتبر است");
    }
    const who = await ctx.runQuery(api.auth.whoami, { token: args.token });
    const envelope = encryptSecret(args.apiKeyOrToken, masterSecret(), {
      aad: aadFor(String(who.userId), args.provider),
    });
    return await ctx.runMutation(internal.payments.saveUserProviderConfig, {
      token: args.token,
      provider: args.provider,
      credentialsEncrypted: envelope,
      baseUrl:
        args.baseUrl ??
        (args.provider === "cubepay" ? CUBEPAY_BASE : TETRAMINATOR_DEFAULT_BASE),
      enabled: args.enabled,
      label: args.label,
    });
  },
});

export const createCubePayInvoiceAction = action({
  args: {
    token: v.string(),
    amountRials: v.number(),
    description: v.optional(v.string()),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args) => {
    const prepared = await ctx.runMutation(internal.payments.prepareProviderPayment, {
      token: args.token,
      method: "cubepay",
      amount: args.amountRials,
      idempotencyKey: args.idempotencyKey,
    });
    if (prepared.deduped) {
      return {
        paymentId: prepared.paymentId,
        paymentLink: prepared.paymentLink ?? null,
        deduped: true,
      };
    }
    const cfg = await ctx.runQuery(internal.payments.getUserProviderEnvelope, {
      userId: prepared.userId as never,
      provider: "cubepay",
    });
    if (!cfg?.enabled) throw new Error("FORBIDDEN: پیکربندی CubePay فعال نیست");
    let tokenPlain: string;
    try {
      tokenPlain = decryptSecret(cfg.credentialsEncrypted, masterSecret(), {
        aad: aadFor(String(prepared.userId), "cubepay"),
      });
    } catch {
      // تلاش سازگاری v1 بدون AAD
      try {
        tokenPlain = decryptSecret(cfg.credentialsEncrypted, masterSecret());
      } catch {
        throw new Error("INTERNAL_ERROR: رمزگشایی توکن CubePay ناموفق");
      }
    }
    const callbackUrl = `${publicBaseUrl()}/api/v1/payments/cubepay/callback?order_id=${prepared.paymentId}`;
    const created = await cubePayAdapter.createPayment(
      { token: tokenPlain, baseUrl: cfg.baseUrl ?? CUBEPAY_BASE },
      {
        amountRials: args.amountRials,
        orderId: String(prepared.paymentId).slice(0, 64),
        callbackUrl,
        description: args.description,
      },
    );
    await ctx.runMutation(internal.payments.attachProviderInvoice, {
      paymentId: prepared.paymentId as never,
      providerPaymentId: created.authority,
      paymentLink: created.paymentLink,
      payload: {
        authority: created.authority,
        payAmount: created.payAmount,
        isTest: created.isTest,
      },
    });
    return {
      paymentId: prepared.paymentId,
      paymentLink: created.paymentLink,
      authority: created.authority,
      deduped: false,
    };
  },
});

export const createTetraminatorInvoiceAction = action({
  args: {
    token: v.string(),
    priceToman: v.number(),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args) => {
    if (args.priceToman < TETRAMINATOR_MIN || args.priceToman > TETRAMINATOR_MAX) {
      throw new Error(
        `VALIDATION_ERROR: مبلغ باید بین ${TETRAMINATOR_MIN} و ${TETRAMINATOR_MAX} تومان باشد`,
      );
    }
    const prepared = await ctx.runMutation(internal.payments.prepareProviderPayment, {
      token: args.token,
      method: "tetraminator",
      amount: args.priceToman,
      idempotencyKey: args.idempotencyKey,
    });
    if (prepared.deduped) {
      return {
        paymentId: prepared.paymentId,
        paymentLink: prepared.paymentLink ?? null,
        deduped: true,
      };
    }
    const cfg = await ctx.runQuery(internal.payments.getUserProviderEnvelope, {
      userId: prepared.userId as never,
      provider: "tetraminator",
    });
    if (!cfg?.enabled) throw new Error("FORBIDDEN: پیکربندی Tetraminator فعال نیست");
    let apiKey: string;
    try {
      apiKey = decryptSecret(cfg.credentialsEncrypted, masterSecret(), {
        aad: aadFor(String(prepared.userId), "tetraminator"),
      });
    } catch {
      try {
        apiKey = decryptSecret(cfg.credentialsEncrypted, masterSecret());
      } catch {
        throw new Error("INTERNAL_ERROR: رمزگشایی API Key ناموفق");
      }
    }
    const callbackUrl = `${publicBaseUrl()}/api/v1/payments/tetraminator/webhook?order_id=${prepared.paymentId}`;
    const created = await tetraminatorAdapter.createInvoice(
      { apiKey, baseUrl: cfg.baseUrl ?? TETRAMINATOR_DEFAULT_BASE },
      { price: args.priceToman, callbackUrl },
    );
    await ctx.runMutation(internal.payments.attachProviderInvoice, {
      paymentId: prepared.paymentId as never,
      providerPaymentId: created.pay_id,
      paymentLink: created.payment_link,
      payload: { pay_id: created.pay_id },
    });
    return {
      paymentId: prepared.paymentId,
      paymentLink: created.payment_link ?? null,
      payId: created.pay_id,
      deduped: false,
    };
  },
});

export const verifyProviderPaymentAction = action({
  args: {
    paymentId: v.id("payments"),
    provider: v.string(),
    providerPaymentId: v.string(),
  },
  handler: async (ctx, args) => {
    const payment = await ctx.runQuery(internal.payments.getPaymentInternal, {
      paymentId: args.paymentId,
    });
    if (!payment) return { ok: false, reason: "NOT_FOUND" };
    if (payment.status === "paid" || payment.status === "approved") {
      return { ok: true, alreadyPaid: true };
    }
    if (payment.status !== "awaiting_verify" && payment.status !== "processing") {
      return { ok: false, reason: `status=${payment.status}` };
    }

    const provider = args.provider === "cubepay" ? "cubepay" : "tetraminator";
    const cfg = await ctx.runQuery(internal.payments.getUserProviderEnvelope, {
      userId: payment.userId,
      provider,
    });
    if (!cfg) return { ok: false, reason: "NO_CONFIG" };

    let secret: string;
    try {
      secret = decryptSecret(cfg.credentialsEncrypted, masterSecret(), {
        aad: aadFor(String(payment.userId), provider),
      });
    } catch {
      try {
        secret = decryptSecret(cfg.credentialsEncrypted, masterSecret());
      } catch {
        return { ok: false, reason: "DECRYPT_FAILED" };
      }
    }

    if (args.provider === "tetraminator") {
      const result = await tetraminatorAdapter.verifyPayment(
        { apiKey: secret, baseUrl: cfg.baseUrl ?? TETRAMINATOR_DEFAULT_BASE },
        args.providerPaymentId,
        payment.amount,
      );
      if (!result.accepted) {
        await ctx.runMutation(internal.payments.markPaymentFailed, {
          paymentId: args.paymentId,
          reason: result.reason ?? "inquiry_rejected",
        });
        return { ok: false, reason: result.reason };
      }
    } else if (args.provider === "cubepay") {
      const verified = await cubePayAdapter.verifyPayment(
        { token: secret, baseUrl: cfg.baseUrl ?? CUBEPAY_BASE },
        args.providerPaymentId,
      );
      if (!verified.success) {
        await ctx.runMutation(internal.payments.markPaymentFailed, {
          paymentId: args.paymentId,
          reason: "verify_failed",
        });
        return { ok: false, reason: "verify_failed" };
      }
    } else {
      return { ok: false, reason: "UNKNOWN_PROVIDER" };
    }

    return await ctx.runMutation(internal.payments.acceptProviderPayment, {
      paymentId: args.paymentId,
      expectedAmount: payment.amount,
      providerPaymentId: args.providerPaymentId,
    });
  },
});
