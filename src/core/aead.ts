/** GuardAsli — AES-256-GCM با HKDF هدف‌دار، kid و salt از env. */
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const KEY_LEN = 32;
const DEFAULT_KID = "k1";

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

function hkdfSha256(ikm: Buffer, salt: Buffer, info: Buffer, length: number): Buffer {
  const actualSalt = salt.length > 0 ? salt : Buffer.alloc(32, 0);
  const prk = createHmac("sha256", actualSalt).update(ikm).digest();
  const blocks: Buffer[] = [];
  let prev = Buffer.alloc(0);
  let generated = 0;
  let counter = 1;
  while (generated < length) {
    const input = Buffer.concat([prev, info, Buffer.from([counter])]);
    prev = createHmac("sha256", prk).update(input).digest();
    blocks.push(prev);
    generated += prev.length;
    counter += 1;
    if (counter > 255) throw new Error("HKDF: output too long");
  }
  return Buffer.concat(blocks).subarray(0, length);
}

function hkdfSalt(): Buffer {
  const fromEnv = envStr("GUARDASLI_AEAD_SALT");
  if (fromEnv && fromEnv.length >= 16) {
    return createHash("sha256").update(fromEnv, "utf8").digest();
  }
  return createHash("sha256").update("GuardAsli.aead.salt.v2").digest();
}

function currentKid(): string {
  return envStr("GUARDASLI_AEAD_KID") ?? DEFAULT_KID;
}

function deriveKey(masterSecret: string, purpose: AeadPurpose): Buffer {
  if (!masterSecret || masterSecret.length < 16) {
    throw new Error("INTERNAL_ERROR: GUARDASLI_MASTER_SECRET باید حداقل ۱۶ کاراکتر باشد");
  }
  const ikm = Buffer.from(masterSecret, "utf8");
  const info = Buffer.from(`guardasli-aead-v3|${purpose}`, "utf8");
  return hkdfSha256(ikm, hkdfSalt(), info, KEY_LEN);
}

/** کلید v2 قدیمی (یک purpose مشترک) برای سازگاری. */
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

/**
 * پاکت v3: v3.kid.iv.ct.tag[.aad_b64url]
 * v2: v2.iv.ct.tag[.aad] — خواندنی با کلید legacy
 * v1: v1.iv.ct.tag — خواندنی با SHA256(master)
 */
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
  const kid = currentKid();
  const parts = [
    "v3",
    kid,
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
