/** GuardAsli — تست side-channel و envelope KMS محلی. */
import { describe, expect, test } from "bun:test";
import { constantTimeEqualHex, constantTimeEqualString } from "../src/core/sidechannel";
import { envelopeDecrypt, envelopeEncrypt } from "../src/core/kms";

describe("sidechannel", () => {
  test("equal strings", () => {
    expect(constantTimeEqualString("abc", "abc")).toBe(true);
    expect(constantTimeEqualString("abc", "abd")).toBe(false);
    expect(constantTimeEqualString("abc", "ab")).toBe(false);
  });
  test("equal hex", () => {
    expect(constantTimeEqualHex("dead", "dead")).toBe(true);
    expect(constantTimeEqualHex("dead", "beef")).toBe(false);
  });
});

describe("envelope local KMS", () => {
  test("roundtrip", async () => {
    process.env.GUARDASLI_KMS_MODE = "local";
    process.env.GUARDASLI_MASTER_SECRET = "a".repeat(32);
    const aad = "tenant:t1|purpose:test";
    const { blob, mode } = await envelopeEncrypt("super-secret", aad);
    expect(mode).toBe("local");
    expect(blob.startsWith("e1.")).toBe(true);
    expect(await envelopeDecrypt(blob, aad)).toBe("super-secret");
    await expect(envelopeDecrypt(blob, "wrong-aad")).rejects.toThrow();
  });
});
