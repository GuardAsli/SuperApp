"use node";
/**
 * GuardAsli — اجراکننده provisioning (آیتم P0 حسابرسی).
 *
 * زنجیره کامل برای اشتراک‌های سروردار:
 *   cron هر دقیقه → processDueProvisions
 *     → billing.provisionPickDue   (کارهای سررسید → running + اعتبارسنجی مسیر tenant→server→provider)
 *     → آداپتور واقعی provider     (ساخت remote user روی پنل بالادستی)
 *     → billing.provisionFinish    (active/provisioned + remoteUserId + لینک ورود تلگرام)
 *
 * خرابی آداپتور → provisionFinish(success:false) → retry با backoff تا maxAttempts (dead).
 * اجراکننده‌ی مرده → provisionRequeueStale کار running قدیمی را برمی‌گرداند — هیچ اشتراکی گیر نمی‌کند.
 */
import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { decryptSecret } from "../core/aead";
import { getAdapter } from "../core/providers";
import type { ProviderKind } from "../core/providers/types";

function masterSecret(): string {
  const s = process.env.GUARDASLI_MASTER_SECRET;
  if (!s || s.length < 16) {
    throw new Error("INTERNAL_ERROR: GUARDASLI_MASTER_SECRET تنظیم نشده یا کوتاه است");
  }
  return s;
}

/** ساخت نام کاربر ریموت — یکتا در سرور بالادستی و بدون افشای username پلتفرم. */
function remoteUsername(subscriptionId: string): string {
  return `ga${subscriptionId.replace(/[^a-zA-Z0-9]/g, "").slice(-14)}`;
}

export const processDueProvisions = internalAction({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    // گیرکرده‌ها را اول برگردان — تا کرش اجراکننده اشتراک را برای همیشه قفل نکند.
    await ctx.runMutation(internal.billing.provisionRequeueStale, {});

    const { picked } = (await ctx.runMutation(internal.billing.provisionPickDue, {
      limit: args.limit ?? 10,
    })) as { picked: Array<{ jobId: string; tenantId: string; envelope: string; baseUrl: string; kind: string }> };

    const results: Array<{ jobId: string; ok: boolean; error?: string }> = [];
    let secret: string | null = null;
    for (const p of picked) {
      try {
        // بازکردن envelope فقط همین‌جا — در حافظه‌ی اکشن، هرگز در DB یا لاگ نمی‌رود.
        secret = secret ?? masterSecret();
        // یکسان با قرارداد providers.ts — اعتبار provider با purpose عام رمزنگاری می‌شود.
        let creds: { baseUrl?: string; username?: string; password?: string; apiKey?: string };
        try {
          creds = JSON.parse(decryptSecret(p.envelope, secret)) as typeof creds;
        } catch {
          creds = JSON.parse(
            decryptSecret(p.envelope, secret, { purpose: "payment_credentials" }),
          ) as typeof creds;
        }
        if (creds.baseUrl) {
          // baseUrl ثبت‌شده در provider مقدم است (rotation ممکن) — اما فقط اگر outbound امن باشد.
          p.baseUrl = creds.baseUrl;
        }
        const adapter = getAdapter(p.kind as ProviderKind);
        const cfg = { ...creds, baseUrl: creds.baseUrl || p.baseUrl };
        const spec = {
          username: remoteUsername(p.jobId),
          trafficLimitGb: null as number | null,
          expiredAt: null as number | null,
        };
        // محدودیت ترافیک/انقضا از اشتراک — با یک runQuery سبک.
        const sub = (await ctx.runQuery(internal.billing.provisionSubscriptionSpec, {
          jobId: p.jobId as never,
        })) as { trafficLimitGb: number | null; expiredAt: number | null } | null;
        if (sub) {
          spec.trafficLimitGb = sub.trafficLimitGb;
          spec.expiredAt = sub.expiredAt;
        }
        const created = await adapter.createUser(cfg as never, spec);
        if (!created.ok || !created.data) {
          const err = created.error ?? "create_user failed";
          await ctx.runMutation(internal.billing.provisionFinish, {
            jobId: p.jobId as never,
            success: false,
            error: err,
          });
          results.push({ jobId: p.jobId, ok: false, error: err });
          continue;
        }
        await ctx.runMutation(internal.billing.provisionFinish, {
          jobId: p.jobId as never,
          success: true,
          remoteUserId: created.data.remoteRef,
        });
        results.push({ jobId: p.jobId, ok: true });
      } catch (e) {
        const err = e instanceof Error ? e.message : String(e);
        // خطای decrypt/pin: غیرقابل‌تکرار با retry — ولی برای سادگی همان قرارداد finish-error.
        try {
          await ctx.runMutation(internal.billing.provisionFinish, {
            jobId: p.jobId as never,
            success: false,
            error: err.slice(0, 300),
          });
        } catch {
          // اگر finish هم شکست خورد، provisionRequeueStale در دوره بعد برمی‌گرداند.
        }
        results.push({ jobId: p.jobId, ok: false, error: err.slice(0, 300) });
      }
    }
    return { picked: picked.length, processed: results.length, results };
  },
});
