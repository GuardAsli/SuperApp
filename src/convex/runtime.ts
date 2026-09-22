/** GuardAsli — ابزار تولید اعداد تصادفی امن در Convex runtime (بدون node:crypto). */

/** UUID v4 از crypto.getRandomValues مرورگر/runtime — در Convex در دسترس است. */
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
