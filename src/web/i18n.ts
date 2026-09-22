/** GuardAsli — i18n: فارسی پیش‌فرض + انگلیسی */

export type Locale = "fa" | "en";

const STORAGE_KEY = "guardasli.locale";

export function getLocale(): Locale {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "en" || v === "fa") return v;
  } catch {
    /* ignore */
  }
  return "fa";
}

export function setLocale(locale: Locale): void {
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    /* ignore */
  }
  document.documentElement.lang = locale;
  document.documentElement.dir = locale === "fa" ? "rtl" : "ltr";
}

const dict = {
  fa: {
    product: "GuardAsli",
    dashboard: "داشبورد",
    wallet: "کیف پول",
    charge: "شارژ کیف پول",
    balance: "موجودی",
    plans: "پلن‌ها",
    branding: "برندینگ",
    payments: "پرداخت‌ها",
    methods: "روش‌های پرداخت",
    cardToCard: "کارت به کارت",
    cubePay: "CubePay",
    tetraminator: "Tetraminator",
    adminCredit: "شارژ دستی ادمین",
    amount: "مبلغ",
    reason: "دلیل",
    submit: "ثبت",
    approve: "تأیید",
    reject: "رد",
    fraud: "تقلب + مسدود",
    pendingReview: "در انتظار بررسی",
    history: "تاریخچه",
    logout: "خروج",
    login: "ورود",
    register: "ثبت‌نام",
    overview: "نمای کلی",
    providerConfig: "پیکربندی درگاه",
    save: "ذخیره",
    enabled: "فعال",
    disabled: "غیرفعال",
    language: "زبان",
    noTransactions: "هنوز تراکنشی ثبت نشده است.",
    toman: "تومان",
  },
  en: {
    product: "GuardAsli",
    dashboard: "Dashboard",
    wallet: "Wallet",
    charge: "Charge wallet",
    balance: "Balance",
    plans: "Plans",
    branding: "Branding",
    payments: "Payments",
    methods: "Payment methods",
    cardToCard: "Card-to-card",
    cubePay: "CubePay",
    tetraminator: "Tetraminator",
    adminCredit: "Admin manual credit",
    amount: "Amount",
    reason: "Reason",
    submit: "Submit",
    approve: "Approve",
    reject: "Reject",
    fraud: "Fraud + block",
    pendingReview: "Pending review",
    history: "History",
    logout: "Log out",
    login: "Sign in",
    register: "Register",
    overview: "Overview",
    providerConfig: "Provider config",
    save: "Save",
    enabled: "Enabled",
    disabled: "Disabled",
    language: "Language",
    noTransactions: "No transactions yet.",
    toman: "Toman",
  },
} as const;

export type MsgKey = keyof typeof dict.fa;

export function t(key: MsgKey, locale?: Locale): string {
  const loc = locale ?? getLocale();
  return dict[loc][key] ?? dict.fa[key] ?? key;
}
