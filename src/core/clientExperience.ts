/**
 * GuardAsli — قرارداد تجربه کلاینت (استاندارد حرفه‌ای UX اپ‌های VPN).
 *
 * نکته صادقانه:
 * - پنل کنترل‌پلن سرورها، اشتراک، دستگاه‌ها و پروفایل اتصال را مدیریت می‌کند.
 * - تونل واقعی (WireGuard / OpenVPN / VLESS و …) روی دستگاه کاربر و از طریق
 *   Provider بالادستی (3X-UI و مشابه) برقرار می‌شود؛ نه داخل Convex.
 * - اپ سفیدبرچسب (Main/Dedicated) باید این API را مصرف کند و UI شبیه
 *   Connect / Disconnect / Server list / Kill switch / Multi-device بسازد.
 */

export const CLIENT_UX_FEATURES = [
  "quick_connect", // یک‌ضرب اتصال به بهترین سرور
  "server_list", // لیست سرور/لوکیشن
  "manual_server", // انتخاب دستی سرور
  "disconnect", // قطع اتصال
  "connection_status", // وضعیت و latency
  "kill_switch", // جلوگیری از نشت بدون VPN (روی کلاینت)
  "auto_connect", // اتصال خودکار در شبکه ناامن
  "multi_device", // محدودیت تعداد دستگاه
  "subscription_status", // باقی‌مانده ترافیک/روز
  "config_import", // import لینک/QR سابسکریپشن
  "split_tunneling", // اختیاری روی کلاینت
  "protocol_select", // انتخاب پروتکل پشتیبانی‌شده Provider
] as const;

export type ClientUxFeature = (typeof CLIENT_UX_FEATURES)[number];

/** فلگ‌های پیش‌فرض اپ dedicated شبیه محصول‌های مصرف‌کننده VPN */
export const DEFAULT_DEDICATED_APP_FLAGS: ClientUxFeature[] = [
  "quick_connect",
  "server_list",
  "manual_server",
  "disconnect",
  "connection_status",
  "kill_switch",
  "auto_connect",
  "multi_device",
  "subscription_status",
  "config_import",
  "protocol_select",
];

export interface ClientServerView {
  id: string;
  name: string;
  status: string;
  providerKind?: string;
  /** برای نمایش UX؛ اتصال واقعی از subscription profile */
  recommended?: boolean;
}

export interface ClientSubscriptionView {
  id: string;
  status: string;
  trafficLimitGb: number | null;
  trafficUsedGb: number | null;
  durationEndsAt: number | null;
  devicesAllowed: number | null;
}

export interface ClientConnectProfile {
  /** لینک یا JSON امن برای کلاینت — هرگز credential خام provider را لو نده */
  profileType: "subscription_url" | "uri" | "json";
  payload: string;
  serverId: string | null;
  expiresAt: number | null;
}

export function remainingTrafficGb(sub: ClientSubscriptionView): number | null {
  if (sub.trafficLimitGb == null) return null;
  const used = sub.trafficUsedGb ?? 0;
  return Math.max(0, sub.trafficLimitGb - used);
}

export function isSubscriptionActive(sub: ClientSubscriptionView, now = Date.now()): boolean {
  if (sub.status !== "active") return false;
  if (sub.durationEndsAt != null && sub.durationEndsAt < now) return false;
  const rem = remainingTrafficGb(sub);
  if (rem != null && rem <= 0) return false;
  return true;
}
