/** GuardAsli — ماشین وضعیت پرداخت و انواع Ledger مرتبط. */

export const PAYMENT_STATUSES = [
  "created",
  "pending",
  "pending_review",
  "awaiting_verify",
  "processing",
  "paid",
  "approved",
  "rejected",
  "failed",
  "expired",
  "fraud",
  "refunded",
  "cancelled",
] as const;

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_METHODS = [
  "admin_manual",
  "card_to_card",
  "cubepay",
  "tetraminator",
] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const LEDGER_TYPES = [
  "admin_credit",
  "deposit",
  "purchase",
  "refund",
  "adjustment",
  "commission",
] as const;

/** انتقال‌های مجاز وضعیت پرداخت */
const TRANSITIONS: Record<string, readonly string[]> = {
  created: ["pending", "pending_review", "awaiting_verify", "cancelled", "failed"],
  pending: ["pending_review", "awaiting_verify", "processing", "paid", "failed", "expired", "cancelled"],
  pending_review: ["paid", "approved", "rejected", "fraud", "cancelled"],
  awaiting_verify: ["processing", "paid", "failed", "expired", "cancelled"],
  processing: ["paid", "failed", "expired"],
  paid: ["refunded"],
  approved: ["refunded"],
  rejected: [],
  failed: [],
  expired: [],
  fraud: [],
  refunded: [],
  cancelled: [],
};

export function canTransition(from: string, to: string): boolean {
  const allowed = TRANSITIONS[from];
  if (!allowed) return false;
  return allowed.includes(to);
}

export function assertTransition(from: string, to: string): void {
  if (!canTransition(from, to)) {
    throw new Error(`CONFLICT: انتقال وضعیت پرداخت از ${from} به ${to} مجاز نیست`);
  }
}

/** وضعیت‌هایی که کیف پول را شارژ کرده‌اند — دوباره‌شارژ ممنوع */
export function isTerminalPaid(status: string): boolean {
  return status === "paid" || status === "approved";
}
