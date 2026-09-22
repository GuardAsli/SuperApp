/** GuardAsli — AES-256-GCM با HKDF-SHA256 و AAD برای secrets در حالت سکون. */
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
const HKDF_INFO = Buffer.from("guardasli-aead-v2", "utf8");

/**
 * HKDF-Extract + Expand (RFC 5869) روی SHA-256.
 * salt خالی → صفرهای ۳۲ بایتی طبق RFC وقتی salt ارائه نشود.
 */
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

function deriveKey(masterSecret: string): Buffer {
  if (!masterSecret || masterSecret.length < 16) {
    throw new Error("INTERNAL_ERROR: GUARDASLI_MASTER_SECRET باید حداقل ۱۶ کاراکتر باشد");
  }
  const ikm = Buffer.from(masterSecret, "utf8");
  // salt محصولی ثابت + نسخه — جدا از TOKEN pepper
  const salt = createHash("sha256").update("GuardAsli.aead.salt.v2").digest();
  return hkdfSha256(ikm, salt, HKDF_INFO, KEY_LEN);
}

export interface EncryptOptions {
  /** Additional Authenticated Data — مثلاً tenantId|provider|purpose */
  aad?: string;
}

/**
 * پاکت v2: v2.iv.ct.tag[.aad_b64url]
 * v1 برای سازگاری خوانده می‌شود (بدون AAD، کلید قدیمی SHA256).
 */
export function encryptSecret(
  plaintext: string,
  masterSecret: string,
  opts: EncryptOptions = {},
): string {
  const key = deriveKey(masterSecret);
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  if (opts.aad) {
    cipher.setAAD(Buffer.from(opts.aad, "utf8"));
  }
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const parts = [
    "v2",
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
  if (ver === "v2") {
    const [, ivB64, ctB64, tagB64, aadB64] = parts;
    if (!ivB64 || !ctB64 || !tagB64) {
      throw new Error("پاکت رمزنگاری v2 نامعتبر است");
    }
    const key = deriveKey(masterSecret);
    const decipher = createDecipheriv(ALGO, key, Buffer.from(ivB64, "base64url"));
    const aad =
      opts.aad ??
      (aadB64 ? Buffer.from(aadB64, "base64url").toString("utf8") : undefined);
    if (aad) {
      decipher.setAAD(Buffer.from(aad, "utf8"));
    }
    decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(ctB64, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  }

  // سازگاری فقط‌خواندنی با v1 (کلید = SHA256(master) بدون HKDF)
  if (ver === "v1") {
    const [, ivB64, ctB64, tagB64] = parts;
    if (!ivB64 || !ctB64 || !tagB64) {
      throw new Error("پاکت رمزنگاری v1 نامعتبر است");
    }
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

/** HMAC-SHA256 برای binding اختیاری token↔context (نه برای password). */
export function hmacToken(token: string, secret: string): string {
  return createHmac("sha256", secret).update(token, "utf8").digest("hex");
}

/** مقایسه زمان‌ثابت دو رشته هم‌طول به‌صورت hex/utf8. */
export function timingSafeEqualUtf8(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
