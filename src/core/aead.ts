/** GuardAsli — رمزنگاری AES-256-GCM برای secrets در حالت سکون (بند ۱۴). */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;

function keyFromSecret(secret: string): Buffer {
  return createHash("sha256").update(secret, "utf8").digest();
}

/** Encrypt to compact envelope: v1.iv.ct.tag (base64url parts). */
export function encryptSecret(plaintext: string, masterSecret: string): string {
  const key = keyFromSecret(masterSecret);
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    "v1",
    iv.toString("base64url"),
    ct.toString("base64url"),
    tag.toString("base64url"),
  ].join(".");
}

export function decryptSecret(envelope: string, masterSecret: string): string {
  const [ver, ivB64, ctB64, tagB64] = envelope.split(".");
  if (ver !== "v1" || !ivB64 || !ctB64 || !tagB64) {
    throw new Error("پاکت رمزنگاری نامعتبر است");
  }
  const key = keyFromSecret(masterSecret);
  const decipher = createDecipheriv(ALGO, key, Buffer.from(ivB64, "base64url"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ctB64, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

/** HMAC-based deterministic token hashing for storage/lookup. */
export function hmacToken(token: string, secret: string): string {
  return createHash("sha256").update(`${secret}:${token}`).digest("hex");
}
