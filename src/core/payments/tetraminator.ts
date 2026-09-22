/** GuardAsli — آداپتور Tetraminator با verify و ضد-replay (بند ۲۰). */
import { validateOutboundUrl } from "../ssrf";

export const TETRAMINATOR_DEFAULT_BASE = "https://api.tetraminator.com/v1";
export const TETRAMINATOR_MIN = 50_000;
export const TETRAMINATOR_MAX = 10_000_000;

export interface TetraminatorConfig {
  apiKey: string;
  baseUrl: string;
}

export function validateTetraminatorConfig(cfg: TetraminatorConfig): { ok: boolean; reason?: string } {
  if (!cfg.apiKey || cfg.apiKey.length < 8) {
    return { ok: false, reason: "API Key Tetraminator نامعتبر است" };
  }
  const url = validateOutboundUrl(cfg.baseUrl);
  if (!url.ok) return { ok: false, reason: url.reason };
  return { ok: true };
}

export interface CreateInvoiceInput {
  price: number;
  callbackUrl: string;
}

export interface CreateInvoiceResult {
  pay_id: string;
  payment_link?: string;
  raw?: unknown;
}

export interface InquiryResult {
  status: boolean;
  payment_status: string;
  amount?: number;
  pay_id?: string;
  raw?: unknown;
}

export const tetraminatorAdapter = {
  /** POST /invoice/create با X-API-KEY. */
  async createInvoice(
    cfg: TetraminatorConfig,
    input: CreateInvoiceInput,
    fetchImpl: typeof fetch = fetch,
  ): Promise<CreateInvoiceResult> {
    const cb = validateOutboundUrl(input.callbackUrl);
    if (!cb.ok) throw new Error(`PROVIDER_ERROR: callback نامعتبر — ${cb.reason}`);
    const base = validateOutboundUrl(cfg.baseUrl);
    if (!base.ok) throw new Error(`PROVIDER_ERROR: base URL نامعتبر — ${base.reason}`);
    if (!Number.isInteger(input.price) || input.price < TETRAMINATOR_MIN || input.price > TETRAMINATOR_MAX) {
      throw new Error(
        `VALIDATION_ERROR: مبلغ باید بین ${TETRAMINATOR_MIN} و ${TETRAMINATOR_MAX} تومان باشد`,
      );
    }
    const res = await fetchImpl(`${cfg.baseUrl}/invoice/create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": cfg.apiKey,
      },
      body: JSON.stringify({
        price: input.price,
        callback_url: input.callbackUrl,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      throw new Error(`PROVIDER_ERROR: invoice/create HTTP ${res.status}`);
    }
    const data = (await res.json()) as Record<string, unknown>;
    const payId = (data.pay_id ?? data.payId) as string | undefined;
    if (!payId) throw new Error("PROVIDER_ERROR: pay_id در پاسخ create یافت نشد");
    return {
      pay_id: payId,
      ...(typeof data.payment_link === "string" ? { payment_link: data.payment_link } : {}),
      raw: data,
    };
  },

  /**
   * GET /payment/inquiry/{pay_id} — تنها مرجع پذیرش پرداخت.
   * پذیرش فقط وقتی: status==true و payment_status=="paid" و pay_id مطابقت و amount مطابقت.
   */
  async verifyPayment(
    cfg: TetraminatorConfig,
    payId: string,
    expectedAmount: number,
    fetchImpl: typeof fetch = fetch,
  ): Promise<{ accepted: boolean; reason?: string; inquiry?: InquiryResult }> {
    const base = validateOutboundUrl(cfg.baseUrl);
    if (!base.ok) throw new Error(`PROVIDER_ERROR: base URL نامعتبر — ${base.reason}`);
    const res = await fetchImpl(`${cfg.baseUrl}/payment/inquiry/${encodeURIComponent(payId)}`, {
      headers: { "X-API-KEY": cfg.apiKey },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      throw new Error(`PROVIDER_ERROR: payment/inquiry HTTP ${res.status}`);
    }
    const data = (await res.json()) as Record<string, unknown>;
    const inquiry: InquiryResult = {
      status: data.status === true,
      payment_status: String(data.payment_status ?? ""),
      ...(typeof data.amount === "number" ? { amount: data.amount } : {}),
      ...(typeof data.pay_id === "string" ? { pay_id: data.pay_id } : {}),
      raw: data,
    };
    if (!inquiry.status) return { accepted: false, reason: "status=false", inquiry };
    if (inquiry.payment_status !== "paid") {
      return { accepted: false, reason: `payment_status=${inquiry.payment_status}`, inquiry };
    }
    if (inquiry.pay_id && inquiry.pay_id !== payId) {
      return { accepted: false, reason: "pay_id mismatch", inquiry };
    }
    if (typeof inquiry.amount === "number" && inquiry.amount !== expectedAmount) {
      return { accepted: false, reason: "amount mismatch", inquiry };
    }
    return { accepted: true, inquiry };
  },
};
