/**
 * GuardAsli — پورت ورود هر نقش.
 *
 * هر نقش صفحه‌ی ورود اختصاصی خودش را دارد؛ پورت URL نقش مجاز را مشخص می‌کند:
 *   https://panel.example.com:616  → فقط super_admin
 *   https://panel.example.com:105  → فقط reseller
 *   https://panel.example.com       → همه‌ی نقش‌ها (کاربر عادی)
 *
 * پورت‌ها با --port-super / --port-reseller و متغیرهای محیطی
 * GUARDASLI_PORT_SUPER / GUARDASLI_PORT_RESELLER قابل تغییرند.
 */

export type EntryRole = "super_admin" | "reseller" | null;

const DEFAULT_SUPER_PORT = 616;
const DEFAULT_RESELLER_PORT = 105;

function numEnv(name: string, fallback: number): number {
  if (typeof import.meta === "undefined") return fallback;
  const raw = (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.[name];
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export const SUPER_ADMIN_PORT = numEnv("VITE_GUARDASLI_PORT_SUPER", DEFAULT_SUPER_PORT);
export const RESELLER_PORT = numEnv("VITE_GUARDASLI_PORT_RESELLER", DEFAULT_RESELLER_PORT);

export interface EntryContext {
  /** پورت فعلی مرورگر؛ رشته‌ی خالی برای پورت پیش‌فرض. */
  port: string;
  /** نقشی که از این آدرس اجازه‌ی ورود دارد. */
  role: EntryRole;
  /** برچسب فارسی برای نمایش به کاربر. */
  label: string;
  /** آیا این صفحه مخصوص نقش است (پورت دارد) یا عمومی. */
  scoped: boolean;
}

/** نقش مجاز را از پورت URL می‌خواند. پورت ناشناخته = عمومی. */
export function entryContext(port?: string): EntryContext {
  const p = (port ?? (typeof window === "undefined" ? "" : window.location.port)).trim();
  if (p === String(SUPER_ADMIN_PORT)) {
    return { port: p, role: "super_admin", label: "سوپر ادمین", scoped: true };
  }
  if (p === String(RESELLER_PORT)) {
    return { port: p, role: "reseller", label: "نماینده", scoped: true };
  }
  return { port: p, role: null, label: "کاربر", scoped: false };
}

/** آیا این نقش از این آدرس اجازه‌ی ورود دارد؟ */
export function roleAllowed(entry: EntryContext, role: string): boolean {
  if (!entry.role) return true;
  if (entry.role === "super_admin") return role === "super_admin";
  // صفحه‌ی نماینده: نماینده و بالادستی‌ها (ادمین/سوپرادمین) هم مجازند.
  if (entry.role === "reseller") return ["reseller", "admin", "super_admin"].includes(role);
  return false;
}

/** راهنمای خطای مخصوص وقتی نقش با پورت جور نیست. */
export function roleMismatchMessage(entry: EntryContext, role: string): string {
  const roleFa: Record<string, string> = {
    user: "کاربر عادی",
    reseller: "نماینده",
    admin: "ادمین",
    super_admin: "سوپر ادمین",
  };
  return `این صفحه مخصوص «${entry.label}» است. حساب شما (${roleFa[role] ?? role}) باید از آدرس نقش خودش وارد شود.`;
}

/** نشانی ورود هر نقش — برای لینک‌های راهنما در صفحه‌ی عمومی. */
export function roleEntryUrl(role: "super_admin" | "reseller", origin: string): string {
  const port = role === "super_admin" ? SUPER_ADMIN_PORT : RESELLER_PORT;
  return `${origin}:${port}`;
}
