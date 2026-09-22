/** GuardAsli — محافظت SSRF برای تمام فراخوانی‌های خروجی (بند ۱۴). */
import { isIP } from "node:net";

export interface UrlCheck {
  ok: boolean;
  reason?: string;
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
  const blockedNames = ["localhost", "metadata.google.internal", "metadata.goog"];
  if (blockedNames.includes(host) || host.endsWith(".local") || host.endsWith(".internal")) {
    return { ok: false, reason: "میزبان داخلی مجاز نیست" };
  }
  if (isIP(host) === 4) {
    const [a, b] = host.split(".").map(Number);
    const blocked =
      a === 0 || a === 10 || a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 198 && (b === 18 || b === 19)) ||
      (a === 192 && (b === 0 || b === 2));
    if (blocked) {
      return { ok: false, reason: "آدرس خصوصی مجاز نیست" };
    }
  }
  if (isIP(host) === 6) {
    if (host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80")) {
      return { ok: false, reason: "آدرس IPv6 داخلی مجاز نیست" };
    }
  }
  return { ok: true };
}
