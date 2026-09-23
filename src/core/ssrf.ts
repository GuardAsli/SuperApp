/** GuardAsli — محافظت SSRF برای تمام فراخوانی‌های خروجی (بند ۱۴). */
/**
 * پیاده‌سازی خالص بدون وابستگی به Node — قابل ایمپورت از کد Convex
 * (query/mutation) و همچنین از اکشن‌های Node.
 */

export interface UrlCheck {
  ok: boolean;
  reason?: string;
}

/** بررسی IPv4 چهاربخشی (جایگزین خالص node:net isIP). */
function isIPv4(host: string): boolean {
  const parts = host.split(".");
  if (parts.length !== 4) return false;
  return parts.every((p) => {
    if (!/^\d{1,3}$/.test(p)) return false;
    const n = Number(p);
    return n >= 0 && n <= 255;
  });
}

/** بررسی IPv6 (جایگزین خالص node:net isIP). */
function isIPv6(host: string): boolean {
  if (!host.includes(":")) return false;
  // حذف zone id (مثل fe80::1%eth0)
  const addr = host.split("%")[0];
  // پشتیبانی از IPv4 نهفته (مثل ::ffff:192.168.1.1)
  const lastColon = addr.lastIndexOf(":");
  const tail = addr.slice(lastColon + 1);
  const dblCount = addr.match(/::/g)?.length ?? 0;
  if (dblCount > 1) return false;
  if (tail.includes(".")) {
    if (!isIPv4(tail)) return false;
    const head = addr.slice(0, lastColon);
    const headGroups = head.split(":").filter((g) => g !== "");
    return headGroups.length <= 6 && headGroups.every((g) => /^[0-9a-fA-F]{1,4}$/.test(g));
  }
  const groups = addr.split(":");
  if (dblCount === 1) {
    if (groups.length > 7) return false;
  } else if (groups.length !== 8) {
    return false;
  }
  return groups.every((g) => g === "" || /^[0-9a-fA-F]{1,4}$/.test(g));
}

function isPrivateIPv4(host: string): boolean {
  const [a, b] = host.split(".").map(Number);
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 192 && (b === 0 || b === 2))
  );
}

export function validateOutboundUrl(raw: string): UrlCheck {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "URL نامعتبر است" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: "فقط http/https مجاز است" };
  }
  const host = url.hostname.toLowerCase();
  // حذف براکت‌های IPv6 که URL parser نگه می‌دارد
  const bareHost = host.startsWith("[") && host.endsWith("]")
    ? host.slice(1, -1)
    : host;
  const blockedNames = ["localhost", "metadata.google.internal", "metadata.goog"];
  if (
    blockedNames.includes(bareHost) ||
    bareHost.endsWith(".local") ||
    bareHost.endsWith(".internal")
  ) {
    return { ok: false, reason: "میزبان داخلی مجاز نیست" };
  }
  if (isIPv4(bareHost)) {
    if (isPrivateIPv4(bareHost)) {
      return { ok: false, reason: "آدرس خصوصی مجاز نیست" };
    }
  } else if (isIPv6(bareHost)) {
    if (
      bareHost === "::1" ||
      bareHost.startsWith("fc") ||
      bareHost.startsWith("fd") ||
      bareHost.startsWith("fe80") ||
      bareHost === "::"
    ) {
      return { ok: false, reason: "آدرس IPv6 داخلی مجاز نیست" };
    }
  }
  return { ok: true };
}
