/**
 * GuardAsli — لایه KMS / Envelope encryption.
 *
 * مدل:
 *   plaintext → AES-GCM با DEK تصادفی → ciphertext
 *   DEK → wrap با KEK (محلی از MASTER یا ابری)
 *
 * حالت‌ها:
 *   local  — KEK از GUARDASLI_MASTER_SECRET (پیش‌فرض)
 *   env_kek — KEK جدا از GUARDASLI_KMS_KEK
 *   http   — POST به GUARDASLI_KMS_WRAP_URL (آداپتر AWS/GCP/Azure شما)
 */
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  hkdfSync,
  randomBytes,
} from "node:crypto";

const IV_LEN = 12;
const DEK_LEN = 32;

export type KmsMode = "local" | "env_kek" | "http";

function env(name: string): string | undefined {
  try {
    const v = process.env[name];
    return v && v.length > 0 ? v : undefined;
  } catch {
    return undefined;
  }
}

export function getKmsMode(): KmsMode {
  const m = (env("GUARDASLI_KMS_MODE") ?? "local").toLowerCase();
  if (m === "http" || m === "env_kek" || m === "local") return m;
  return "local";
}

function ikmBuffer(secret: string): Buffer {
  const s = secret.trim();
  if (/^[0-9a-fA-F]+$/.test(s) && s.length >= 32 && s.length % 2 === 0) {
    return Buffer.from(s, "hex");
  }
  return Buffer.from(s, "utf8");
}

function deriveKek(label: string, secret: string): Buffer {
  const ikm = ikmBuffer(secret);
  const salt = createHash("sha256").update("GuardAsli.kms.kek.v1").digest();
  const info = Buffer.from(`guardasli-kms-kek|${label}`, "utf8");
  return Buffer.from(hkdfSync("sha256", ikm, salt, info, 32));
}

function aesGcmEncrypt(key: Buffer, plaintext: Buffer, aad?: string): { iv: Buffer; ct: Buffer; tag: Buffer } {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  if (aad) cipher.setAAD(Buffer.from(aad, "utf8"));
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { iv, ct, tag };
}

function aesGcmDecrypt(key: Buffer, iv: Buffer, ct: Buffer, tag: Buffer, aad?: string): Buffer {
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  if (aad) decipher.setAAD(Buffer.from(aad, "utf8"));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]);
}

/** Wrap DEK با KEK محلی. */
function wrapDekLocal(dek: Buffer, kekSecret: string, aad: string): string {
  const kek = deriveKek("wrap", kekSecret);
  const { iv, ct, tag } = aesGcmEncrypt(kek, dek, aad);
  kek.fill(0);
  return ["w1", iv.toString("base64url"), ct.toString("base64url"), tag.toString("base64url")].join(".");
}

function unwrapDekLocal(wrapped: string, kekSecret: string, aad: string): Buffer {
  const parts = wrapped.split(".");
  if (parts[0] !== "w1" || parts.length < 4) throw new Error("KMS_UNWRAP_INVALID");
  const kek = deriveKek("wrap", kekSecret);
  try {
    return aesGcmDecrypt(
      kek,
      Buffer.from(parts[1], "base64url"),
      Buffer.from(parts[2], "base64url"),
      Buffer.from(parts[3], "base64url"),
      aad,
    );
  } finally {
    kek.fill(0);
  }
}

/**
 * HTTP wrap: body { op: "wrap"|"unwrap", dek_b64?, wrapped?, aad }
 * پاسخ: { wrapped } یا { dek_b64 }
 * برای اتصال به Lambda/Cloud Function که AWS KMS / GCP KMS را صدا می‌زند.
 */
async function httpWrap(dek: Buffer, aad: string): Promise<string> {
  const url = env("GUARDASLI_KMS_WRAP_URL");
  if (!url) throw new Error("KMS_HTTP: GUARDASLI_KMS_WRAP_URL لازم است");
  const token = env("GUARDASLI_KMS_WRAP_TOKEN") ?? "";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      op: "wrap",
      dek_b64: dek.toString("base64"),
      aad,
    }),
  });
  if (!res.ok) throw new Error(`KMS_HTTP_WRAP_FAILED: ${res.status}`);
  const body = (await res.json()) as { wrapped?: string };
  if (!body.wrapped) throw new Error("KMS_HTTP_WRAP_FAILED: no wrapped");
  return body.wrapped;
}

async function httpUnwrap(wrapped: string, aad: string): Promise<Buffer> {
  const url = env("GUARDASLI_KMS_WRAP_URL");
  if (!url) throw new Error("KMS_HTTP: GUARDASLI_KMS_WRAP_URL لازم است");
  const token = env("GUARDASLI_KMS_WRAP_TOKEN") ?? "";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ op: "unwrap", wrapped, aad }),
  });
  if (!res.ok) throw new Error(`KMS_HTTP_UNWRAP_FAILED: ${res.status}`);
  const body = (await res.json()) as { dek_b64?: string };
  if (!body.dek_b64) throw new Error("KMS_HTTP_UNWRAP_FAILED: no dek");
  return Buffer.from(body.dek_b64, "base64");
}

function resolveKekSecret(): string {
  const mode = getKmsMode();
  if (mode === "env_kek") {
    const k = env("GUARDASLI_KMS_KEK");
    if (!k || k.length < 32) throw new Error("GUARDASLI_KMS_KEK الزامی و ≥32 است");
    return k;
  }
  const m = env("GUARDASLI_MASTER_SECRET");
  if (!m || m.length < 16) throw new Error("GUARDASLI_MASTER_SECRET لازم است");
  return m;
}

export interface EnvelopeBlob {
  /** e1.wrappedDek.iv.ct.tag */
  blob: string;
  mode: KmsMode;
}

/**
 * رمزنگاری envelope: DEK تصادفی + wrap با KMS/local.
 * برای اسرار حساس‌تر از aead تک‌کلیدی (اختیاری در کنار aead.ts).
 */
export async function envelopeEncrypt(
  plaintext: string,
  aad: string,
): Promise<EnvelopeBlob> {
  const mode = getKmsMode();
  const dek = randomBytes(DEK_LEN);
  let wrapped: string;
  try {
    if (mode === "http") {
      wrapped = await httpWrap(dek, aad);
    } else {
      wrapped = wrapDekLocal(dek, resolveKekSecret(), aad);
    }
    const { iv, ct, tag } = aesGcmEncrypt(dek, Buffer.from(plaintext, "utf8"), aad);
    const blob = [
      "e1",
      mode,
      wrapped,
      iv.toString("base64url"),
      ct.toString("base64url"),
      tag.toString("base64url"),
    ].join(".");
    return { blob, mode };
  } finally {
    dek.fill(0);
  }
}

export async function envelopeDecrypt(blob: string, aad: string): Promise<string> {
  const parts = blob.split(".");
  if (parts[0] !== "e1" || parts.length < 6) throw new Error("ENVELOPE_INVALID");
  const mode = parts[1] as KmsMode;
  const wrapped = parts[2];
  const iv = Buffer.from(parts[3], "base64url");
  const ct = Buffer.from(parts[4], "base64url");
  const tag = Buffer.from(parts[5], "base64url");

  let dek: Buffer;
  if (mode === "http") {
    dek = await httpUnwrap(wrapped, aad);
  } else {
    // local و env_kek هر دو wrap محلی با KEK متفاوت
    const prev = process.env.GUARDASLI_KMS_MODE;
    process.env.GUARDASLI_KMS_MODE = mode;
    try {
      dek = unwrapDekLocal(wrapped, resolveKekSecret(), aad);
    } finally {
      if (prev === undefined) delete process.env.GUARDASLI_KMS_MODE;
      else process.env.GUARDASLI_KMS_MODE = prev;
    }
  }
  try {
    const pt = aesGcmDecrypt(dek, iv, ct, tag, aad);
    return pt.toString("utf8");
  } finally {
    dek.fill(0);
  }
}
