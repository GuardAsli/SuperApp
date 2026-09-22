/** GuardAsli — آداپتور CubePay طبق مستندات رسمی (بند ۱۹). */
import { validateOutboundUrl } from "../ssrf";

export const CUBEPAY_BASE = "https://cubevps.ir/smspay";

export interface CubePayConfig {
  token: string;
  baseUrl: string;
}

export function validateCubePayConfig(cfg: CubePayConfig): { ok: boolean; reason?: string } {
  if (!cfg.token || cfg.token.length < 8) {
    return { ok: false, reason: "توکن CubePay نامعتبر است" };
  }
  const url = validateOutboundUrl(cfg.baseUrl);
  if (!url.ok) return { ok: false, reason: url.reason };
  return { ok: true };
}

export interface CreatePaymentInput {
  amountRials: number;
  orderId: string;
  callbackUrl: string;
  description?: string;
  ttlMinutes?: number;
}

export interface CreatePaymentResult {
  success: boolean;
  authority: string;
  paymentLink: string;
  payAmount: number;
  payAmountToman: number;
  isTest: boolean;
}

export interface VerifyPaymentResult {
  success: boolean;
  status?: string;
  raw?: unknown;
}

function requireSsr(origin: string, cfg: CubePayConfig) {
  const cb = validateOutboundUrl(origin);
  if (!cb.ok) throw new Error(`PROVIDER_ERROR: callback نامعتبر — ${cb.reason}`);
  const base = validateOutboundUrl(cfg.baseUrl);
  if (!base.ok) throw new Error(`PROVIDER_ERROR: base URL نامعتبر — ${base.reason}`);
}

export const cubePayAdapter = {
  /** POST /api/v1/create-payment.php */
  async createPayment(
    cfg: CubePayConfig,
    input: CreatePaymentInput,
    fetchImpl: typeof fetch = fetch,
  ): Promise<CreatePaymentResult> {
    requireSsr(input.callbackUrl, cfg);
    if (!Number.isInteger(input.amountRials) || input.amountRials < 1000) {
      throw new Error("VALIDATION_ERROR: حداقل مبلغ ۱۰۰۰ ریال است");
    }
    if (!input.orderId || input.orderId.length > 64) {
      throw new Error("VALIDATION_ERROR: order_id حداکثر ۶۴ کاراکتر است");
    }
    const res = await fetchImpl(`${cfg.baseUrl}/api/v1/create-payment.php`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${cfg.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: input.amountRials,
        order_id: input.orderId,
        callback_url: input.callbackUrl,
        ...(input.description ? { description: input.description.slice(0, 255) } : {}),
        ...(input.ttlMinutes ? { ttl_minutes: input.ttlMinutes } : {}),
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      throw new Error(`PROVIDER_ERROR: create-payment HTTP ${res.status}`);
    }
    const data = (await res.json()) as CreatePaymentResult;
    if (!data.success || !data.authority) {
      throw new Error("PROVIDER_ERROR: پاسخ create-payment نامعتبر است");
    }
    return data;
  },

  /** POST /api/v1/verify-payment.php — فقط یک‌بار موفق جواب می‌دهد. */
  async verifyPayment(
    cfg: CubePayConfig,
    authority: string,
    fetchImpl: typeof fetch = fetch,
  ): Promise<VerifyPaymentResult> {
    const base = validateOutboundUrl(cfg.baseUrl);
    if (!base.ok) throw new Error(`PROVIDER_ERROR: base URL نامعتبر — ${base.reason}`);
    const res = await fetchImpl(`${cfg.baseUrl}/api/v1/verify-payment.php`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${cfg.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ authority }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      throw new Error(`PROVIDER_ERROR: verify-payment HTTP ${res.status}`);
    }
    const data = (await res.json()) as VerifyPaymentResult;
    return data;
  },

  /** GET /status.php — بدون توکن، long-polling تا ~۲۰ ثانیه. */
  async getStatus(
    cfg: CubePayConfig,
    authority: string,
    knownStatus?: string,
    fetchImpl: typeof fetch = fetch,
  ): Promise<Record<string, unknown>> {
    const base = validateOutboundUrl(cfg.baseUrl);
    if (!base.ok) throw new Error(`PROVIDER_ERROR: base URL نامعتبر — ${base.reason}`);
    const u = new URL(`${cfg.baseUrl}/status.php`);
    u.searchParams.set("authority", authority);
    if (knownStatus) u.searchParams.set("known_status", knownStatus);
    const res = await fetchImpl(u.toString(), { signal: AbortSignal.timeout(25_000) });
    if (!res.ok) throw new Error(`PROVIDER_ERROR: status HTTP ${res.status}`);
    return (await res.json()) as Record<string, unknown>;
  },
};
