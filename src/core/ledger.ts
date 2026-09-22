/** GuardAsli — Ledger تغییرناپذیر Wallet (بند ۱۵). هر تغییر balance باید Ledger Entry داشته باشد. */

export type LedgerEntryType =
  | "deposit"
  | "purchase"
  | "refund"
  | "adjustment"
  | "admin_credit"
  | "commission";

export interface LedgerEntry {
  id: string;
  walletId: string;
  seq: number; // monotonic per wallet — double-entry chain integrity
  type: LedgerEntryType;
  amount: number; // always > 0
  direction: "credit" | "debit";
  balanceAfter: number;
  reason: string;
  idempotencyKey: string | null;
  createdAt: number;
  metadata?: Record<string, unknown>;
}

export interface WalletState {
  balance: number;
  seq: number;
}

/**
 * اعمال یک Ledger Entry روی وضعیت Wallet — خالص و بدون side effect.
 * قواعد: مبلغ مثبت، توالی پیوسته، جلوگیری از بدهی.
 */
export function applyLedgerEntry(
  state: WalletState,
  entry: Omit<LedgerEntry, "id" | "balanceAfter" | "createdAt">,
): { state: WalletState; entry: LedgerEntry } {
  if (!Number.isInteger(entry.amount) || entry.amount <= 0) {
    throw new Error("مبلغ Ledger باید عدد صحیح مثبت باشد");
  }
  if (entry.seq !== state.seq + 1) {
    throw new Error("توالی Ledger نامعتبر است");
  }
  const delta = entry.direction === "credit" ? entry.amount : -entry.amount;
  const balanceAfter = state.balance + delta;
  if (balanceAfter < 0) {
    throw new Error("موجودی کافی نیست");
  }
  return {
    state: { balance: balanceAfter, seq: entry.seq },
    entry: {
      ...entry,
      id: `le_${entry.walletId}_${entry.seq}`,
      balanceAfter,
      createdAt: Date.now(),
    },
  };
}

/** بازیابی وضعیت Wallet از کل Ledger (برای verify و restore). */
export function replayLedger(
  entries: Array<Pick<LedgerEntry, "seq" | "amount" | "direction" | "type">>,
  initial: WalletState = { balance: 0, seq: 0 },
): WalletState {
  let state = initial;
  for (const e of entries) {
    state = applyLedgerEntry(state, {
      ...e,
      walletId: "replay",
      reason: "replay",
      idempotencyKey: null,
    }).state;
  }
  return state;
}
