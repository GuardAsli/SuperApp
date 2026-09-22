/** GuardAsli — RNG و SHA-256 در Convex runtime؛ بدون fallback ضعیف. */

export function randomToken(bytes = 32): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  let out = "";
  for (const b of arr) out += b.toString(16).padStart(2, "0");
  return out;
}

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
const ALPHABET_LIMIT = 256 - (256 % ALPHABET.length);

/** credential بدون بایاس modulo. */
export function generateSecureCredentialRuntime(length = 24): string {
  let out = "";
  while (out.length < length) {
    const arr = new Uint8Array(length - out.length + 8);
    crypto.getRandomValues(arr);
    for (let i = 0; i < arr.length && out.length < length; i++) {
      if (arr[i] < ALPHABET_LIMIT) {
        out += ALPHABET[arr[i] % ALPHABET.length];
      }
    }
  }
  return out;
}

/**
 * SHA-256 hex — فقط Web Crypto.
 * اگر subtle در دسترس نباشد، خطا (fail-closed) — هیچ هش ضعیف جایگزین نمی‌شود.
 */
export async function sha256Hex(input: string): Promise<string> {
  if (typeof crypto === "undefined" || !crypto.subtle) {
    throw new Error("INTERNAL_ERROR: crypto.subtle در دسترس نیست — هش نشست غیرممکن است");
  }
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(digest);
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

/** مقایسه زمان‌ثابت برای secrets هم‌طول. */
export function timingSafeEqualString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
