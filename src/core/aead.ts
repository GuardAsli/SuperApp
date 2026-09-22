/** GuardAsli — AES-256-GCM + HKDF-SHA256 (Node crypto.hkdfSync). */
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  createHash,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const KEY_LEN = 32;
const DEFAULT_KID = "k1";
const MIN_MASTER_LEN = 16;
const PROD_MIN_MASTER_LEN = 32;

export type AeadPurpose =
  | "payment_credentials"
  | "telegram_bot_token"
  | "payment_card"
  | "generic";

function envStr(name: string): string | undefined {
  try {
    if (typeof process === "undefined") return undefined;
    const v = (process as { env?: Record<string, string> }).env?.[name];
    return v && v.length > 0 ? v : undefined;
  } catch {
    return undefined;
  }
}

function isProduction(): boolean {
  const n = envStr("NODE_ENV");
  const g = envStr("GUARDASLI_ENV");
  return n === "production" || g === "production";
}

/**
 * IKM: اگر رشته فقط hex با طول زوج ≥ ۳۲ باشد → باینری؛
 * وگرنه UTF-8 (سازگاری با passphrase).
 */
export function ikmFromMaster(masterSecret: string): Buffer {
  const s = masterSecret.trim();
  if (/^[0-9a-fA-F]+$/.test(s) && s.length >= 32 && s.length % 2 === 0) {
    return Buffer.from(s, "hex");
  }
  return Buffer.from(s, "utf8");
}

function assertMaster(masterSecret: string): void {
  if (!masterSecret || masterSecret.length < MIN_MASTER_LEN) {
    throw new Error(
      `INTERNAL_ERROR: GUARDASLI_MASTER_SECRET باید حداقل ${MIN_MASTER_LEN} کاراکتر باشد`,
    );
  }
  if (isProduction() && masterSecret.length < PROD_MIN_MASTER_LEN) {
    throw new Error(
      `INTERNAL_ERROR: در production حداقل ${PROD_MIN_MASTER_LEN} کاراکتر برای MASTER لازم است`,
    );
  }
  // رد مقادیر شناخته‌شدهٔ ضعیف
  const weak = [
    "changeme",
    "password",
    "secret",
    "test-master-secret",
    "GuardAsli.session.v2",
  ];
  const lower = masterSecret.toLowerCase();
  for (const w of weak) {
    if (lower === w || lower.includes(`test-master-secret`)) {
      if (isProduction()) {
        throw new Error("INTERNAL_ERROR: MASTER ضعیف در production ممنوع است");
      }
    }
  }
}

/**
 * HKDF-SHA256 از Node (RFC 5869).
 * salt خالی در RFC → صفرهای HashLen؛ اینجا همیشه salt ۳۲ بایتی می‌دهیم.
 */
function hkdfSha256(ikm: Buffer, salt: Buffer, info: Buffer, length: number): Buffer {
  const actualSalt = salt.length > 0 ? salt : Buffer.alloc(32, 0);
  const out = hkdfSync("sha256", ikm, actualSalt, info, length);
  return Buffer.from(out);
}

function hkdfSalt(): Buffer {
  const fromEnv = envStr("GUARDASLI_AEAD_SALT");
  if (isProduction()) {
    if (!fromEnv || fromEnv.length < 16) {
      throw new Error(
        "INTERNAL_ERROR: GUARDASLI_AEAD_SALT در production الزامی است (≥16)",
      );
    }
  }
  if (fromEnv && fromEnv.length >= 16) {
    // اگر hex طولانی → باینری؛ وگرنه hash برای طول ثابت ۳۲
    if (/^[0-9a-fA-F]+$/.test(fromEnv) && fromEnv.length >= 32 && fromEnv.length % 2 === 0) {
      return createHash("sha256").update(Buffer.from(fromEnv, "hex")).digest();
    }
    return createHash("sha256").update(fromEnv, "utf8").digest();
  }
  return createHash("sha256").update("GuardAsli.aead.salt.v2").digest();
}

function currentKid(): string {
  const k = envStr("GUARDASLI_AEAD_KID") ?? DEFAULT_KID;
  if (!/^[a-zA-Z0-9_-]{1,32}$/.test(k)) {
    throw new Error("INTERNAL_ERROR: GUARDASLI_AEAD_KID نامعتبر است");
  }
  return k;
}

function deriveKey(masterSecret: string, purpose: AeadPurpose): Buffer {
  assertMaster(masterSecret);
  const ikm = ikmFromMaster(masterSecret);
  const info = Buffer.from(`guardasli-aead-v3|${purpose}`, "utf8");
  return hkdfSha256(ikm, hkdfSalt(), info, KEY_LEN);
}

function deriveKeyV2Legacy(masterSecret: string): Buffer {
  const ikm = Buffer.from(masterSecret, "utf8");
  const salt = createHash("sha256").update("GuardAsli.aead.salt.v2").digest();
  const info = Buffer.from("guardasli-aead-v2", "utf8");
  return hkdfSha256(ikm, salt, info, KEY_LEN);
}

export interface EncryptOptions {
  aad?: string;
  purpose?: AeadPurpose;
}

export function encryptSecret(
  plaintext: string,
  masterSecret: string,
  opts: EncryptOptions = {},
): string {
  const purpose = opts.purpose ?? "generic";
  const key = deriveKey(masterSecret, purpose);
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  if (opts.aad) cipher.setAAD(Buffer.from(opts.aad, "utf8"));
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const parts = [
    "v3",
    currentKid(),
    iv.toString("base64url"),
    ct.toString("base64url"),
    tag.toString("base64url"),
  ];
  if (opts.aad) {
    parts.push(Buffer.from(opts.aad, "utf8").toString("base64url"));
  }
  return parts.join(".");
}

export function decryptSecret(
  envelope: string,
  masterSecret: string,
  opts: EncryptOptions = {},
): string {
  const parts = envelope.split(".");
  const ver = parts[0];

  if (ver === "v3") {
    const [, _kid, ivB64, ctB64, tagB64, aadB64] = parts;
    if (!ivB64 || !ctB64 || !tagB64) throw new Error("پاکت رمزنگاری v3 نامعتبر است");
    const purpose = opts.purpose ?? "generic";
    const key = deriveKey(masterSecret, purpose);
    const decipher = createDecipheriv(ALGO, key, Buffer.from(ivB64, "base64url"));
    const aad =
      opts.aad ??
      (aadB64 ? Buffer.from(aadB64, "base64url").toString("utf8") : undefined);
    if (aad) decipher.setAAD(Buffer.from(aad, "utf8"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(ctB64, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  }

  if (ver === "v2") {
    const [, ivB64, ctB64, tagB64, aadB64] = parts;
    if (!ivB64 || !ctB64 || !tagB64) throw new Error("پاکت رمزنگاری v2 نامعتبر است");
    const key = deriveKeyV2Legacy(masterSecret);
    const decipher = createDecipheriv(ALGO, key, Buffer.from(ivB64, "base64url"));
    const aad =
      opts.aad ??
      (aadB64 ? Buffer.from(aadB64, "base64url").toString("utf8") : undefined);
    if (aad) decipher.setAAD(Buffer.from(aad, "utf8"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(ctB64, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  }

  if (ver === "v1") {
    const [, ivB64, ctB64, tagB64] = parts;
    if (!ivB64 || !ctB64 || !tagB64) throw new Error("پاکت رمزنگاری v1 نامعتبر است");
    const key = createHash("sha256").update(masterSecret, "utf8").digest();
    const decipher = createDecipheriv(ALGO, key, Buffer.from(ivB64, "base64url"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(ctB64, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  }

  throw new Error("پاکت رمزنگاری نامعتبر است");
}

export function hmacToken(token: string, secret: string): string {
  return createHmac("sha256", secret).update(token, "utf8").digest("hex");
}

export function timingSafeEqualUtf8(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
