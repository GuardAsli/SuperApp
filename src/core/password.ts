/** GuardAsli — scrypt سخت‌شده + credential بدون بایاس modulo. */
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const KEYLEN = 64;
/** N=2^15 — هزینه بیشتر در برابر brute؛ maxmem متناسب. */
const SCRYPT_OPTIONS = {
  N: 32768,
  r: 8,
  p: 1,
  maxmem: 128 * 1024 * 1024,
};

export interface PasswordHash {
  hash: string;
  salt: string;
}

export function scryptHashSync(password: string): { hash: string } {
  const { hash, salt } = hashPassword(password);
  return { hash: `${salt}$${hash}` };
}

export function scryptVerifySync(password: string, envelope: string): boolean {
  const idx = envelope.indexOf("$");
  if (idx <= 0) return false;
  const salt = envelope.slice(0, idx);
  const hash = envelope.slice(idx + 1);
  if (!salt || !hash) return false;
  return verifyPassword(password, { hash, salt });
}

export function hashPassword(password: string): PasswordHash {
  if (typeof password !== "string" || password.length < 8) {
    throw new Error("رمز عبور باید حداقل ۸ کاراکتر باشد");
  }
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, KEYLEN, SCRYPT_OPTIONS).toString("hex");
  return { hash, salt };
}

export function verifyPassword(password: string, stored: PasswordHash): boolean {
  try {
    const candidate = scryptSync(password, stored.salt, KEYLEN, SCRYPT_OPTIONS);
    const expected = Buffer.from(stored.hash, "hex");
    if (candidate.length !== expected.length) return false;
    return timingSafeEqual(candidate, expected);
  } catch {
    return false;
  }
}

/**
 * تولید credential با rejection sampling — بدون بایاس modulo روی alphabet.
 */
export function generateSecureCredential(length = 24): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const n = alphabet.length; // 58
  const limit = 256 - (256 % n); // بزرگ‌ترین مضرب n زیر ۲۵۶
  let out = "";
  while (out.length < length) {
    const bytes = randomBytes(length - out.length + 8);
    for (let i = 0; i < bytes.length && out.length < length; i++) {
      if (bytes[i] < limit) {
        out += alphabet[bytes[i] % n];
      }
    }
  }
  return out;
}

/** سیاست رمز قوی برای Super Admin / bootstrap. */
export function assertStrongPassword(password: string, minLen = 12): void {
  if (password.length < minLen) {
    throw new Error(`VALIDATION_ERROR: رمز باید حداقل ${minLen} کاراکتر باشد`);
  }
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
    throw new Error(
      "VALIDATION_ERROR: رمز باید شامل حروف کوچک، بزرگ و عدد باشد",
    );
  }
}
