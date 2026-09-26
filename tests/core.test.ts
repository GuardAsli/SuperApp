/** GuardAsli — تست‌های واحد هسته. */
import { describe, expect, test } from "bun:test";
import { GUARDASLI, INITIAL_VERSIONS, COMPONENTS } from "../src/core/identity";
import {
  parseVersion, isValidVersion, compareVersions, bumpVersion, isCompatible,
} from "../src/core/version";
import { DEFAULT_ROLE_PERMISSIONS, hasPermission, canManageActor, ROLES } from "../src/core/rbac";
import { FEATURE_KEYS, evaluateFeatureAccess, clampPrice } from "../src/core/features";
import { applyLedgerEntry, replayLedger } from "../src/core/ledger";
import { quoteCustomPurchase, type CustomPurchaseConfig } from "../src/core/pricing";
import { validateOutboundUrl } from "../src/core/ssrf";
import { encryptSecret, decryptSecret } from "../src/core/aead";
import { scryptHashSync, scryptVerifySync, generateSecureCredential } from "../src/core/password";
import { verifyTelegramInitData } from "../src/core/telegram";

const MASTER = "test-master-secret-16+";

describe("هویت مرکزی", () => {
  test("نام محصول و توسعه‌دهنده ثابت", () => {
    expect(GUARDASLI.product).toBe("GuardAsli");
    expect(GUARDASLI.developer).toBe("AsliCode");
    expect(GUARDASLI.versionFormat).toBe("isMAJOR.MINOR.PATCH");
  });
  test("نسخه اولیه همه اجزا is0.0.2 است", () => {
    for (const c of COMPONENTS) {
      expect(INITIAL_VERSIONS[c]).toBe("is0.0.2");
    }
  });
});

describe("نسخه‌گذاری isMAJOR.MINOR.PATCH", () => {
  test("پارس و اعتبارسنجی", () => {
    expect(isValidVersion("is0.0.2")).toBe(true);
    expect(isValidVersion("is10.20.30")).toBe(true);
    expect(isValidVersion("1.0.0")).toBe(false);
    expect(isValidVersion("v1.0.0")).toBe(false);
    expect(parseVersion("is2.3.4")).toEqual({ major: 2, minor: 3, patch: 4 });
  });
  test("مقایسه و bump", () => {
    expect(compareVersions("is0.0.2", "is0.1.1")).toBe(-1);
    expect(compareVersions("is1.0.0", "is0.9.9")).toBe(1);
    expect(compareVersions("is1.2.3", "is1.2.3")).toBe(0);
    expect(bumpVersion("is0.0.2", "patch")).toBe("is0.0.3");
    expect(bumpVersion("is0.0.9", "minor")).toBe("is0.1.0");
    expect(bumpVersion("is0.9.9", "minor")).toBe("is0.10.0");
    expect(bumpVersion("is1.9.9", "major")).toBe("is2.0.0");
  });
  test("سازگاری: major یکسان", () => {
    expect(isCompatible("is1.2.0", "is1.9.9")).toBe(true);
    expect(isCompatible("is1.0.0", "is2.0.0")).toBe(false);
  });
});

describe("RBAC", () => {
  test("مجوزهای پیش‌فرض نقش‌ها", () => {
    expect(hasPermission("super_admin", "Manage")).toBe(true);
    expect(hasPermission("user", "ManageWallet")).toBe(false);
    expect(hasPermission("user", "View")).toBe(true);
    expect(hasPermission("reseller", "Resell")).toBe(true);
    expect(hasPermission("sub_reseller", "ManagePayments")).toBe(false);
  });
  test("سلسله‌مراتب مدیریت بازیگران", () => {
    expect(canManageActor("super_admin", "admin")).toBe(true);
    expect(canManageActor("admin", "super_admin")).toBe(false);
    expect(canManageActor("reseller", "sub_reseller")).toBe(true);
    expect(canManageActor("reseller", "admin")).toBe(false);
    expect(canManageActor("sub_reseller", "user")).toBe(true);
    expect(canManageActor("user", "user")).toBe(false);
  });
  test("همه نقش‌ها مجوز View دارند", () => {
    for (const r of ROLES) {
      expect(DEFAULT_ROLE_PERMISSIONS[r].includes("View")).toBe(true);
    }
  });
});

describe("زنجیره Feature شش‌حلقه‌ای", () => {
  const full = {
    globalEnabled: true, planEnabled: true, rolePermissions: ["View", "Purchase"],
    roleRequired: "Purchase", tenantActive: true, ownershipOk: true, quotaOk: true,
  };
  test("عبور با همه حلقه‌ها", () => {
    expect(evaluateFeatureAccess(full)).toBe(true);
  });
  test("رد با نقض هر حلقه", () => {
    expect(evaluateFeatureAccess({ ...full, globalEnabled: false })).toBe(false);
    expect(evaluateFeatureAccess({ ...full, planEnabled: false })).toBe(false);
    expect(evaluateFeatureAccess({ ...full, rolePermissions: ["View"] })).toBe(false);
    expect(evaluateFeatureAccess({ ...full, tenantActive: false })).toBe(false);
    expect(evaluateFeatureAccess({ ...full, ownershipOk: false })).toBe(false);
    expect(evaluateFeatureAccess({ ...full, quotaOk: false })).toBe(false);
  });
  test("کلیدهای feature الزامی موجودند", () => {
    for (const k of ["DedicatedApp", "TelegramBot", "TelegramMiniApp", "WhiteLabel", "CustomPurchase"]) {
      expect(FEATURE_KEYS.includes(k as never)).toBe(true);
    }
  });
  test("clamp قیمت", () => {
    expect(clampPrice(50, 100, null)).toBe(100);
    expect(clampPrice(500, 100, 400)).toBe(400);
    expect(clampPrice(200, 100, 400)).toBe(200);
  });
});

describe("Ledger تغییرناپذیر", () => {
  test("credit و debit صحیح", () => {
    let state = { balance: 0, seq: 0 };
    const r1 = applyLedgerEntry(state, {
      walletId: "w1", seq: 1, type: "deposit", amount: 1000,
      direction: "credit", reason: "test", idempotencyKey: "k1",
    });
    state = r1.state;
    expect(state.balance).toBe(1000);
    const r2 = applyLedgerEntry(state, {
      walletId: "w1", seq: 2, type: "purchase", amount: 400,
      direction: "debit", reason: "buy", idempotencyKey: "k2",
    });
    expect(r2.state.balance).toBe(600);
    expect(r2.entry.balanceAfter).toBe(600);
  });
  test("رد توالی نامعتبر", () => {
    expect(() =>
      applyLedgerEntry({ balance: 0, seq: 5 }, {
        walletId: "w1", seq: 1, type: "deposit", amount: 10,
        direction: "credit", reason: "x", idempotencyKey: null,
      }),
    ).toThrow();
  });
  test("رد موجودی منفی", () => {
    expect(() =>
      applyLedgerEntry({ balance: 100, seq: 1 }, {
        walletId: "w1", seq: 2, type: "purchase", amount: 200,
        direction: "debit", reason: "x", idempotencyKey: null,
      }),
    ).toThrow();
  });
  test("رد مبلغ صفر یا منفی", () => {
    expect(() =>
      applyLedgerEntry({ balance: 0, seq: 0 }, {
        walletId: "w1", seq: 1, type: "deposit", amount: 0,
        direction: "credit", reason: "x", idempotencyKey: null,
      }),
    ).toThrow();
  });
  test("replay ledger بازسازی وضعیت", () => {
    const st = replayLedger([
      { seq: 1, amount: 500, direction: "credit", type: "deposit" },
      { seq: 2, amount: 200, direction: "debit", type: "purchase" },
    ]);
    expect(st.balance).toBe(300);
    expect(st.seq).toBe(2);
  });
});

describe("Custom Purchase", () => {
  const cfg: CustomPurchaseConfig = {
    minTrafficGb: 10, maxTrafficGb: 1000,
    minUsers: 1, maxUsers: 500,
    minDurationDays: 30, maxDurationDays: 365,
    allowedFeatures: ["MultiDevice", "QR"],
    featurePrices: [{ key: "MultiDevice", price: 20000 }, { key: "QR", price: 5000 }],
  };
  test("محاسبه صحیح قیمت", () => {
    const q = quoteCustomPurchase(cfg, {
      trafficGb: 100, users: 10, durationDays: 60,
      featureKeys: ["MultiDevice", "QR"], perUserCost: 1000, optionalCosts: 0,
    }, 100000);
    expect(q.basePrice).toBe(200000);
    expect(q.trafficPrice).toBe(100000);
    expect(q.featurePrices).toBe(25000);
    expect(q.userCost).toBe(10000);
    expect(q.total).toBe(200000 + 100000 + 25000 + 10000);
  });
  test("رد feature غیرمجاز", () => {
    expect(() => quoteCustomPurchase(cfg, {
      trafficGb: 100, users: 10, durationDays: 60,
      featureKeys: ["Referral"], perUserCost: 0, optionalCosts: 0,
    }, 100000)).toThrow();
  });
  test("رد خارج از محدوده ترافیک", () => {
    expect(() => quoteCustomPurchase(cfg, {
      trafficGb: 5, users: 10, durationDays: 60,
      featureKeys: [], perUserCost: 0, optionalCosts: 0,
    }, 100000)).toThrow();
  });
});

describe("SSRF", () => {
  test("رد میزبان‌های داخلی", () => {
    expect(validateOutboundUrl("http://localhost/x").ok).toBe(false);
    expect(validateOutboundUrl("http://127.0.0.1/x").ok).toBe(false);
    expect(validateOutboundUrl("http://10.0.0.1/x").ok).toBe(false);
    expect(validateOutboundUrl("http://192.168.1.1/x").ok).toBe(false);
    expect(validateOutboundUrl("http://172.16.0.1/x").ok).toBe(false);
    expect(validateOutboundUrl("http://169.254.169.254/latest/meta-data").ok).toBe(false);
    expect(validateOutboundUrl("file:///etc/passwd").ok).toBe(false);
  });
  test("پذیرش میزبان عمومی", () => {
    expect(validateOutboundUrl("https://api.example.com/v1").ok).toBe(true);
    expect(validateOutboundUrl("http://8.8.8.8/dns-query").ok).toBe(true);
  });
});

describe("AES-256-GCM purpose keys", () => {
  test("چرخه رمز/رمزگشایی v3", () => {
    const secret = "bot-token-123456";
    const enc = encryptSecret(secret, MASTER, { purpose: "telegram_bot_token" });
    expect(enc.startsWith("v3.")).toBe(true);
    expect(enc).not.toContain(secret);
    expect(decryptSecret(enc, MASTER, { purpose: "telegram_bot_token" })).toBe(secret);
  });
  test("رد کلید اشتباه", () => {
    const enc = encryptSecret("data", MASTER);
    expect(() => decryptSecret(enc, "other-master-key-xx")).toThrow();
  });
  test("رد master کوتاه", () => {
    expect(() => encryptSecret("x", "short")).toThrow();
  });
});

describe("رمز عبور", () => {
  test("hash و verify", () => {
    const { hash } = scryptHashSync("MyPassword123");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(hash).not.toContain("MyPassword123");
    expect(scryptVerifySync("MyPassword123", hash)).toBe(true);
    expect(scryptVerifySync("WrongPass", hash)).toBe(false);
  });
  test("تولید credential امن", () => {
    const a = generateSecureCredential(24);
    const b = generateSecureCredential(24);
    expect(a).toHaveLength(24);
    expect(a).not.toBe(b);
  });
});

describe("Telegram initData", () => {
  test("رد امضای نامعتبر", () => {
    const fake = "user=%7B%22id%22%3A1%7D&auth_date=1700000000&hash=deadbeef";
    expect(verifyTelegramInitData(fake, "token")).toBe(null);
  });
  test("رد داده بدون hash", () => {
    expect(verifyTelegramInitData("user=%7B%22id%22%3A1%7D", "token")).toBe(null);
  });
});
