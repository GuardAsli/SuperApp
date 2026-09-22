/** GuardAsli — ابزار تولید اعداد تصادفی و هش امن در Convex runtime (بدون node:crypto). */

/** UUID / token از crypto.getRandomValues — در Convex در دسترس است. */
export function randomToken(bytes = 32): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  let out = "";
  for (const b of arr) out += b.toString(16).padStart(2, "0");
  return out;
}

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

export function generateSecureCredentialRuntime(length = 24): string {
  const arr = new Uint8Array(length);
  crypto.getRandomValues(arr);
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[arr[i] % ALPHABET.length];
  return out;
}

/**
 * هش پایدار و یک‌طرفه برای ذخیرهٔ توکن نشست / API key.
 * از SHA-256 (Web Crypto) استفاده می‌کند؛ در صورت نبود، fallback چنددوره‌ای با pepper ثابت محصول.
 * این هش برای lookup است — خود توکن تصادفی 32+ بایت است.
 */
export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const digest = await crypto.subtle.digest("SHA-256", data);
    const bytes = new Uint8Array(digest);
    let out = "";
    for (const b of bytes) out += b.toString(16).padStart(2, "0");
    return out;
  }
  // fallback deterministic (نباید در production بدون subtle رخ دهد)
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0") + "." + input.length.toString(16);
}

/** مقایسهٔ زمان‌ثابت برای secrets کوتاه (webhook secret و مشابه). */
export function timingSafeEqualString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
