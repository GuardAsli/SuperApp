/** GuardAsli — scrypt نسخه‌دار + credential بدون بایاس. */
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const KEYLEN = 64;
const N = 32768;
const R = 8;
const P = 1;
const SCRYPT_OPTIONS = { N, r: R, p: P, maxmem: 128 * 1024 * 1024 };

export interface PasswordHash {
  hash: string;
  salt: string;
  N?: number;
  r?: number;
  p?: number;
}

/** پاکت: scrypt$N$r$p$salt$hash  یا سازگاری قدیمی salt$hash */
export function scryptHashSync(password: string): { hash: string } {
  const { hash, salt } = hashPassword(password);
  return { hash: `scrypt$${N}$${R}$${P}$${salt}$${hash}` };
}

export function scryptVerifySync(password: string, envelope: string): boolean {
  if (envelope.startsWith("scrypt$")) {
    const parts = envelope.split("$");
    // scrypt N r p salt hash → 6 parts
    if (parts.length !== 6) return false;
    const Nn = Number(parts[1]);
    const rr = Number(parts[2]);
    const pp = Number(parts[3]);
    const salt = parts[4];
    const hash = parts[5];
    if (!salt || !hash || !Number.isFinite(Nn)) return false;
    return verifyPassword(password, { hash, salt, N: Nn, r: rr, p: pp });
  }
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
  return { hash, salt, N, r: R, p: P };
}

export function verifyPassword(password: string, stored: PasswordHash): boolean {
  try {
    const opts = {
      N: stored.N ?? N,
      r: stored.r ?? R,
      p: stored.p ?? P,
      maxmem: 128 * 1024 * 1024,
    };
    const candidate = scryptSync(password, stored.salt, KEYLEN, opts);
    const expected = Buffer.from(stored.hash, "hex");
    if (candidate.length !== expected.length) return false;
    return timingSafeEqual(candidate, expected);
  } catch {
    return false;
  }
}

export function generateSecureCredential(length = 24): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const n = alphabet.length;
  const limit = 256 - (256 % n);
  let out = "";
  while (out.length < length) {
    const bytes = randomBytes(length - out.length + 8);
    for (let i = 0; i < bytes.length && out.length < length; i++) {
      if (bytes[i] < limit) out += alphabet[bytes[i] % n];
    }
  }
  return out;
}

export function assertStrongPassword(password: string, minLen = 12): void {
  if (password.length < minLen) {
    throw new Error(`VALIDATION_ERROR: رمز باید حداقل ${minLen} کاراکتر باشد`);
  }
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
    throw new Error("VALIDATION_ERROR: رمز باید شامل حروف کوچک، بزرگ و عدد باشد");
  }
}
