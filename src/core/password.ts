/** GuardAsli — ذخیره امن رمز عبور. هرگز plaintext ذخیره نمی‌شود (بند ۱۳). */
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const KEYLEN = 64;
const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export interface PasswordHash {
  hash: string;
  salt: string;
}

/** پاکت کامل: salt$hash — برای ذخیره در یک فیلد. */
export function scryptHashSync(password: string): { hash: string } {
  const { hash, salt } = hashPassword(password);
  return { hash: `${salt}$${hash}` };
}

export function scryptVerifySync(password: string, envelope: string): boolean {
  const [salt, hash] = envelope.split("$");
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

export function generateSecureCredential(length = 24): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}
