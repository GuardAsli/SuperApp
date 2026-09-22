/** GuardAsli — i18n ساده FA/EN · پیش‌فرض فارسی */
export type Locale = "fa" | "en";

const KEY = "guardasli.locale";

export function getLocale(): Locale {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "en" || v === "fa") return v;
  } catch {
    /* */
  }
  return "fa";
}

export function setLocale(locale: Locale): void {
  try {
    localStorage.setItem(KEY, locale);
  } catch {
    /* */
  }
}

const dict: Record<string, { fa: string; en: string }> = {
  dashboard: { fa: "داشبورد", en: "Dashboard" },
  overview: { fa: "نمای کلی", en: "Overview" },
  wallet: { fa: "کیف پول", en: "Wallet" },
  charge: { fa: "شارژ", en: "Charge" },
  payments: { fa: "پرداخت‌ها", en: "Payments" },
  plans: { fa: "پلن‌ها", en: "Plans" },
  branding: { fa: "برندینگ", en: "Branding" },
  admin: { fa: "مدیریت", en: "Admin" },
  monitor: { fa: "مانیتور", en: "Monitor" },
  logout: { fa: "خروج", en: "Logout" },
  balance: { fa: "موجودی", en: "Balance" },
  toman: { fa: "تومان", en: "Toman" },
  amount: { fa: "مبلغ", en: "Amount" },
  submit: { fa: "ثبت", en: "Submit" },
  save: { fa: "ذخیره شد", en: "Saved" },
  history: { fa: "تاریخچه", en: "History" },
  noTransactions: { fa: "تراکنشی نیست", en: "No transactions" },
  cardToCard: { fa: "کارت‌به‌کارت", en: "Card to card" },
  cubePay: { fa: "CubePay", en: "CubePay" },
  tetraminator: { fa: "Tetraminator", en: "Tetraminator" },
  providerConfig: { fa: "پیکربندی درگاه", en: "Provider config" },
  enabled: { fa: "فعال", en: "Enabled" },
  disabled: { fa: "غیرفعال", en: "Disabled" },
  pendingReview: { fa: "در انتظار بررسی", en: "Pending review" },
  approve: { fa: "تأیید", en: "Approve" },
  reject: { fa: "رد", en: "Reject" },
  fraud: { fa: "تقلب", en: "Fraud" },
  adminCredit: { fa: "شارژ دستی", en: "Manual credit" },
  paymentMethods: { fa: "روش‌های پرداخت", en: "Payment methods" },
  health: { fa: "سلامت سیستم", en: "System health" },
  jobs: { fa: "صف کارها", en: "Job queue" },
  refresh: { fa: "بروزرسانی", en: "Refresh" },
};

export function t(key: string, locale: Locale): string {
  const row = dict[key];
  if (!row) return key;
  return row[locale] ?? row.fa ?? key;
}
