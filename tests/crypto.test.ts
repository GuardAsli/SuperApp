/** GuardAsli — تست رمزنگاری سخت‌شده. */
import { describe, expect, test } from "bun:test";
import { decryptSecret, encryptSecret, timingSafeEqualUtf8 } from "../src/core/aead";
import {
  assertStrongPassword,
  generateSecureCredential,
  scryptHashSync,
  scryptVerifySync,
} from "../src/core/password";
import { verifyTelegramInitData } from "../src/core/telegram";
import { createHmac } from "node:crypto";

const MASTER = "test-master-secret-at-least-16chars";

describe("AEAD v2 HKDF + AAD", () => {
  test("roundtrip with AAD", () => {
    const aad = "user:u1|provider:cubepay|purpose:payment_credentials";
    const env = encryptSecret("super-secret-key", MASTER, { aad });
    expect(env.startsWith("v2.")).toBe(true);
    expect(decryptSecret(env, MASTER, { aad })).toBe("super-secret-key");
  });

  test("wrong AAD fails", () => {
    const env = encryptSecret("x", MASTER, { aad: "aad-a" });
    expect(() => decryptSecret(env, MASTER, { aad: "aad-b" })).toThrow();
  });

  test("wrong master fails", () => {
    const env = encryptSecret("x", MASTER);
    expect(() => decryptSecret(env, "other-master-secret-xx")).toThrow();
  });

  test("v1 legacy still decrypts", () => {
    // ساخت دستی سبک با مسیر v1 داخل decrypt
    const { createCipheriv, createHash, randomBytes } = require("node:crypto");
    const key = createHash("sha256").update(MASTER, "utf8").digest();
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const ct = Buffer.concat([cipher.update("legacy", "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    const env = ["v1", iv.toString("base64url"), ct.toString("base64url"), tag.toString("base64url")].join(".");
    expect(decryptSecret(env, MASTER)).toBe("legacy");
  });
});

describe("scrypt password", () => {
  test("hash verify", () => {
    const { hash } = scryptHashSync("Password1");
    expect(scryptVerifySync("Password1", hash)).toBe(true);
    expect(scryptVerifySync("wrong", hash)).toBe(false);
  });

  test("strong password policy", () => {
    expect(() => assertStrongPassword("short")).toThrow();
    expect(() => assertStrongPassword("alllowercase1")).toThrow();
    expect(() => assertStrongPassword("ALLUPPERCASE1")).toThrow();
    expect(() => assertStrongPassword("NoDigitsHere")).toThrow();
    expect(() => assertStrongPassword("GoodPass1234")).not.toThrow();
  });

  test("credential generation length", () => {
    const c = generateSecureCredential(32);
    expect(c.length).toBe(32);
  });
});

describe("Telegram initData timing-safe", () => {
  test("valid signature accepted", () => {
    const botToken = "123456:ABC-DEF";
    const user = JSON.stringify({ id: 42, first_name: "A" });
    const auth_date = String(Math.floor(Date.now() / 1000));
    const params = new URLSearchParams({ user, auth_date });
    const dataCheckString = [...params.entries()]
      .map(([k, v]) => `${k}=${v}`)
      .sort()
      .join("\n");
    const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
    const hash = createHmac("sha256", secret).update(dataCheckString).digest("hex");
    params.set("hash", hash);
    const parsed = verifyTelegramInitData(params.toString(), botToken);
    expect(parsed?.user.id).toBe(42);
  });

  test("tampered rejected", () => {
    const botToken = "123456:ABC-DEF";
    const user = JSON.stringify({ id: 1, first_name: "B" });
    const auth_date = String(Math.floor(Date.now() / 1000));
    const params = new URLSearchParams({ user, auth_date, hash: "00".repeat(32) });
    expect(verifyTelegramInitData(params.toString(), botToken)).toBeNull();
  });
});

describe("timingSafeEqualUtf8", () => {
  test("equal", () => expect(timingSafeEqualUtf8("abc", "abc")).toBe(true));
  test("diff", () => expect(timingSafeEqualUtf8("abc", "abd")).toBe(false));
});
