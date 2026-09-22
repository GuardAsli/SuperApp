/** GuardAsli — قرارداد پایدار آداپتور درگاه پرداخت (مستقل از Core business). */

export interface PaymentProviderConfig {
  /** secret plaintext فقط در حافظه Node پس از decrypt */
  secret: string;
  baseUrl: string;
}

export interface CreatePaymentRequest {
  amount: number;
  currencyHint?: "rial" | "toman";
  orderId: string;
  callbackUrl: string;
  description?: string;
}

export interface CreatePaymentResponse {
  providerPaymentId: string;
  paymentLink?: string;
  raw?: unknown;
}

export interface VerifyPaymentRequest {
  providerPaymentId: string;
  expectedAmount: number;
}

export interface VerifyPaymentResponse {
  accepted: boolean;
  reason?: string;
  amount?: number;
  raw?: unknown;
}

/**
 * رابط پایدار — افزودن درگاه جدید بدون بازنویسی Core.
 * Implementors: CubePay, Tetraminator, future providers.
 */
export interface PaymentProviderAdapter {
  readonly id: string;
  validateConfig(cfg: PaymentProviderConfig): { ok: boolean; reason?: string };
  createPayment(
    cfg: PaymentProviderConfig,
    req: CreatePaymentRequest,
    fetchImpl?: typeof fetch,
  ): Promise<CreatePaymentResponse>;
  verifyPayment(
    cfg: PaymentProviderConfig,
    req: VerifyPaymentRequest,
    fetchImpl?: typeof fetch,
  ): Promise<VerifyPaymentResponse>;
  healthCheck?(cfg: PaymentProviderConfig, fetchImpl?: typeof fetch): Promise<{ ok: boolean }>;
}
