/** GuardAsli — crypto unit tests (always non-production env via package.json test script). */
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

// Test-only IKM — NOT used in production. package.json forces NODE_ENV=test.
const MASTER = "unit-test-master-secret-32b-ok!!";

describe("AEAD v3 purpose + kid", () => {
  test("roundtrip payment purpose", () => {
    const aad = "user:u1|provider:cubepay|purpose:payment_credentials";
    const env = encryptSecret("super-secret-key", MASTER, {
      aad,
      purpose: "payment_credentials",
    });
    expect(env.startsWith("v3.")).toBe(true);
    expect(decryptSecret(env, MASTER, { aad, purpose: "payment_credentials" })).toBe(
      "super-secret-key",
    );
  });

  test("wrong purpose fails", () => {
    const env = encryptSecret("x", MASTER, { purpose: "payment_credentials" });
    expect(() => decryptSecret(env, MASTER, { purpose: "telegram_bot_token" })).toThrow();
  });

  test("wrong AAD fails", () => {
    const env = encryptSecret("x", MASTER, { aad: "aad-a", purpose: "generic" });
    expect(() => decryptSecret(env, MASTER, { aad: "aad-b", purpose: "generic" })).toThrow();
  });

  test("v2 legacy still decrypts", () => {
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

describe("scrypt versioned", () => {
  test("hash verify new format", () => {
    const { hash } = scryptHashSync("Password1");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(scryptVerifySync("Password1", hash)).toBe(true);
    expect(scryptVerifySync("wrong", hash)).toBe(false);
  });

  test("legacy salt$hash still verifies", () => {
    const { scryptSync, randomBytes } = require("node:crypto");
    const salt = randomBytes(16).toString("hex");
    const h = scryptSync("Password1", salt, 64, {
      N: 32768,
      r: 8,
      p: 1,
      maxmem: 128 * 1024 * 1024,
    }).toString("hex");
    const legacy = `${salt}$${h}`;
    expect(scryptVerifySync("Password1", legacy)).toBe(true);
  });

  test("strong password policy", () => {
    expect(() => assertStrongPassword("short")).toThrow();
    expect(() => assertStrongPassword("GoodPass1234")).not.toThrow();
  });

  test("credential generation length", () => {
    expect(generateSecureCredential(32).length).toBe(32);
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
