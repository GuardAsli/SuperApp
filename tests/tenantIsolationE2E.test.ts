/**
 * GuardAsli — rule #3: prove that no cross-tenant read, write, or access is
 * possible at any layer.
 *
 * This suite drives the REAL exported handler functions from src/convex/*
 * through a simulated Convex ctx (see tenantIsolation.ts). Nothing is mocked
 * at the authorization level: requireActor, requirePermission,
 * requireTenantScope and the ledger/idempotency engines all execute their
 * production code paths, including internal runQuery/runMutation dispatches.
 *
 * Scenario (two fully separated reseller trees):
 *   Core (t-core, core=true)
 *     ├── t-resA ── t-subA     users: resA(reseller), a1(user), s1(user in sub)
 *     └── t-resB               users: resB(reseller), b1(user)
 *
 * For every surface the same question is asked twice: may resA touch resB's
 * resources (must FAIL), and may b1 touch resA's resources (must FAIL).
 */
import { describe, expect, test } from "bun:test";
import { buildScenario, call, expectThrows, type Scenario } from "./tenantIsolation";
import { stableTokenHash } from "../src/core/sessionToken";
import * as auth from "../src/convex/auth";
import * as wallet from "../src/convex/wallet";
import * as users from "../src/convex/users";
import * as billing from "../src/convex/billing";
import * as payments from "../src/convex/payments";
import * as providersMod from "../src/convex/providers";
import * as telegram from "../src/convex/telegram";
import * as infra from "../src/convex/infra";
import * as apps from "../src/convex/apps";
import * as referrals from "../src/convex/referrals";
import * as clientApi from "../src/convex/clientApi";
import * as audit from "../src/convex/audit";
import * as tenantsMod from "../src/convex/tenants";

const FORBIDDEN = "FORBIDDEN";

/** Seed one wallet per user and one plan per tenant; returns ids. */
function seedEconomy(s: Scenario) {
  const t = s.db.tables;
  const mkWallet = (walletId: string, userId: string, tenantId: string, balance: number) => {
    t.wallets.push({ _id: walletId, userId, tenantId, balance, seq: 0, status: "active" });
  };
  mkWallet("w-core", s.ids.uCore, s.ids.tCore, 1_000_000);
  mkWallet("w-resA", s.ids.uResA, s.ids.tResA, 500_000);
  mkWallet("w-a1", s.ids.uA1, s.ids.tResA, 100_000);
  mkWallet("w-s1", s.ids.uS1, s.ids.tSubA, 50_000);
  mkWallet("w-resB", s.ids.uResB, s.ids.tResB, 500_000);
  mkWallet("w-b1", s.ids.uB1, s.ids.tResB, 100_000);

  t.plans.push({
    _id: "plan-A", tenantId: s.ids.tResA, name: "Plan A", kind: "volume",
    price: 10_000, features: [], permissions: [], status: "active",
  });
  t.plans.push({
    _id: "plan-B", tenantId: s.ids.tResB, name: "Plan B", kind: "volume",
    price: 20_000, features: [], permissions: [], status: "active",
  });

  t.subscriptions.push({
    _id: "sub-A1", tenantId: s.ids.tResA, userId: s.ids.uA1, planId: "plan-A",
    kind: "volume", status: "active", provisioningState: "provisioned", trafficUsedGb: 0,
  });
  t.subscriptions.push({
    _id: "sub-B1", tenantId: s.ids.tResB, userId: s.ids.uB1, planId: "plan-B",
    kind: "volume", status: "active", provisioningState: "provisioned", trafficUsedGb: 0,
  });

  t.paymentMethods.push({ _id: "pm-card", key: "card_to_card", globallyEnabled: true });
  t.paymentMethods.push({ _id: "pm-manual", key: "admin_manual", globallyEnabled: true });
  t.paymentCards.push({
    _id: "card-B", tenantId: s.ids.tResB, number: "****1234", numberLast4: "1234",
    ownerName: "B Owner", enabled: true, order: 1,
  });
  t.providers.push({
    _id: "prov-B", tenantId: s.ids.tResB, kind: "rest-panel", name: "B upstream",
    baseUrl: "https://upstream.example.com", credentialsEncrypted: "env-B", capabilities: ["connect"], status: "active",
  });
  t.servers.push({
    _id: "srv-B", tenantId: s.ids.tResB, providerId: "prov-B", name: "B server",
    remoteRef: "sub-B-remote", status: "active",
  });
  t.botConfigs.push({
    _id: "botcfg-B", tenantId: s.ids.tResB, tokenEncrypted: "enc-B",
    displayName: "B Bot", webhookSecret: "whsec-B", enabled: true, adminTelegramUserId: 42,
  });
  t.customDomains.push({
    _id: "dom-B", tenantId: s.ids.tResB, domain: "b.example.com",
    verificationToken: "vtok-B", verified: false, sslStatus: "none", isWildcard: false,
  });
  t.appCustomizations.push({
    _id: "app-B", tenantId: s.ids.tResB, appKind: "mainapp", appName: "B App",
    version: "is0.1.0", buildNumber: 1, primaryColor: "#000000", secondaryColor: "#111111",
    accentColor: "#222222", backgroundColor: "#333333", themeMode: "dark", featureFlags: [],
  });
  t.apiKeys.push({
    _id: "key-B", tenantId: s.ids.tResB, createdBy: s.ids.uResB, name: "B key",
    prefix: "ga_bprefix", keyHash: "hash-B", scopes: ["View"], status: "active",
  });
  t.referralRules.push({ _id: "rule-A", tenantId: s.ids.tResA, enabled: true, commissionPct: 5 });
  t.clientDevices.push({
    _id: "dev-B", tenantId: s.ids.tResB, userId: s.ids.uB1, deviceKey: "device-b-0001",
    name: "B phone", platform: "android", status: "active", lastSeenAt: Date.now(), createdAt: Date.now(),
  });
  t.auditLogs.push({
    _id: "audit-B", tenantId: s.ids.tResB, actorUserId: s.ids.uResB,
    action: "seed.action", entityType: "test", createdAt: Date.now(),
  });
}

// ————— 1) Identity & session layer —————

describe("isolation · identity/session layer", () => {
  test("whoami never leaks the other tenant's name or users", async () => {
    const s = buildScenario();
    seedEconomy(s);
    const me = await call(s.ctx, auth.whoami as never, { token: s.tokens.resA });
    expect(me.tenantId).toBe(s.ids.tResA);
    expect(me.tenantName).toBe("resA");
    expect(JSON.stringify(me)).not.toContain("resB");
  });

  test("a token always resolves to its own actor's tenant (no identity-redirection parameter exists)", async () => {
    const s = buildScenario();
    seedEconomy(s);
    // b1's token must resolve to B, s1's to subA — regardless of arguments passed.
    const meB = await call(s.ctx, auth.whoami as never, { token: s.tokens.b1 });
    expect(meB.tenantId).toBe(s.ids.tResB);
    const meS = await call(s.ctx, auth.whoami as never, { token: s.tokens.s1 });
    expect(meS.tenantId).toBe(s.ids.tSubA);
    // Garbage extra args are ignored — identity comes only from the token.
    const meB2 = await call(s.ctx, auth.whoami as never, { token: s.tokens.b1, tenantId: s.ids.tResA, userId: s.ids.uA1 } as never);
    expect(meB2.tenantId).toBe(s.ids.tResB);
  });
});

// ————— 2) User management —————

describe("isolation · user management", () => {
  test("userList returns only own-tree users (no cross-tenant rows)", async () => {
    const s = buildScenario();
    seedEconomy(s);
    const list = await call(s.ctx, users.userList as never, { token: s.tokens.resA });
    const ids = list.map((u: any) => u._id);
    expect(ids).toContain(s.ids.uA1);
    expect(ids).not.toContain(s.ids.uB1);
    expect(ids).not.toContain(s.ids.uResB);
    // JSON never contains B-side usernames
    expect(JSON.stringify(list)).not.toContain("b1");
    expect(JSON.stringify(list)).not.toContain("resB");
  });

  test("reseller A cannot suspend reseller B's user (cross-tenant write)", async () => {
    const s = buildScenario();
    seedEconomy(s);
    await expectThrows(
      () => call(s.ctx, users.userSetStatus as never, { token: s.tokens.resA, userId: s.ids.uB1, status: "suspended" }),
      FORBIDDEN,
    );
    // target untouched
    expect(s.db.tables.users.find((u) => u._id === s.ids.uB1)!.status).toBe("active");
  });

  test("reseller A cannot suspend the sibling reseller B account itself", async () => {
    const s = buildScenario();
    seedEconomy(s);
    await expectThrows(
      () => call(s.ctx, users.userSetStatus as never, { token: s.tokens.resA, userId: s.ids.uResB, status: "blocked" }),
      FORBIDDEN,
    );
  });

  test("user A1 (no ManageUsers) cannot suspend anyone at all", async () => {
    const s = buildScenario();
    seedEconomy(s);
    await expectThrows(
      () => call(s.ctx, users.userSetStatus as never, { token: s.tokens.a1, userId: s.ids.uB1, status: "suspended" }),
      FORBIDDEN,
    );
    await expectThrows(
      () => call(s.ctx, users.userSetStatus as never, { token: s.tokens.a1, userId: s.ids.uResA, status: "suspended" }),
      FORBIDDEN,
    );
  });

  test("reseller A may manage users inside its own tree (positive control)", async () => {
    const s = buildScenario();
    seedEconomy(s);
    const r = await call(s.ctx, users.userSetStatus as never, { token: s.tokens.resA, userId: s.ids.uS1, status: "suspended" });
    expect(r.ok).toBe(true);
    expect(s.db.tables.users.find((u) => u._id === s.ids.uS1)!.status).toBe("suspended");
  });
});

// ————— 3) Wallet & ledger —————

describe("isolation · wallet & ledger", () => {
  test("walletGet returns only the caller's own wallet", async () => {
    const s = buildScenario();
    seedEconomy(s);
    const w = await call(s.ctx, wallet.walletGet as never, { token: s.tokens.b1 });
    expect(w).not.toBeNull();
    expect(w._id).toBe("w-b1");
    expect(w.tenantId).toBe(s.ids.tResB);
    // The query is keyed by the actor's userId; there is no wallet of A visible.
    const allWallets = s.db.tables.wallets.map((x) => x._id);
    expect(JSON.stringify(w)).not.toContain("w-a1");
    expect(JSON.stringify(w)).not.toContain("w-resA");
    expect(allWallets).toContain("w-a1"); // exists in db but not visible
  });

  test("manual credit requires ManageWallet AND same-tenant target (B admin → A user denied)", async () => {
    const s = buildScenario();
    seedEconomy(s);
    // resB has no ManageUsers over A's tenant → tenant scope fires first
    await expectThrows(
      () =>
        call(s.ctx, wallet.adminManualCredit as never, {
          token: s.tokens.resB,
          targetUserId: s.ids.uA1,
          amount: 1000,
          reason: "cross-try",
          idempotencyKey: "iso-manual-1",
        }),
      FORBIDDEN,
    );
    expect(s.db.tables.wallets.find((w) => w._id === "w-a1")!.balance).toBe(100_000);
  });

  test("even super_admin manual credit is scoped by requireTenantScope only through core — sibling isolated (negative + positive)", async () => {
    const s = buildScenario();
    seedEconomy(s);
    // core admin crediting B's user is allowed (core sees everything)…
    const ok = await call(s.ctx, wallet.adminManualCredit as never, {
      token: s.tokens.core,
      targetUserId: s.ids.uB1,
      amount: 1000,
      reason: "platform grant",
      idempotencyKey: "iso-manual-2",
    });
    expect(ok.balanceAfter).toBe(101_000);
    // …but the ledger entry records B's tenant, not core's
    const entry = s.db.tables.ledgerEntries.at(-1)!;
    expect(entry.tenantId).toBe(s.ids.tResB);
  });

  test("ledger is append-only per wallet and idempotency prevents replay — cross-wallet fails safe", async () => {
    const s = buildScenario();
    seedEconomy(s);
    const args = {
      walletId: "w-b1", type: "deposit", amount: 500, direction: "credit" as const,
      reason: "t", idempotencyKey: "iso-dup-1",
    };
    const first = await call(s.ctx, wallet.ledgerApply as never, args);
    expect(first.deduped).toBe(false);
    const replay = await call(s.ctx, wallet.ledgerApply as never, args);
    expect(replay.deduped).toBe(true);
    expect(replay.balanceAfter).toBe(first.balanceAfter); // no double credit
    // Same idempotency key on a DIFFERENT wallet also dedupes (global index,
    // fail-safe direction): A's wallet is NOT credited under B's key.
    const other = await call(s.ctx, wallet.ledgerApply as never, {
      ...args, walletId: "w-a1", idempotencyKey: "iso-dup-1",
    });
    expect(other.deduped).toBe(true);
    expect(other.balanceAfter).toBe(first.balanceAfter);
    expect(s.db.tables.wallets.find((w) => w._id === "w-a1")!.balance).toBe(100_000);
  });

  test("debit below zero is impossible in any tenant", async () => {
    const s = buildScenario();
    seedEconomy(s);
    await expectThrows(
      () =>
        call(s.ctx, wallet.ledgerApply as never, {
          walletId: "w-b1", type: "purchase", amount: 999_999_999, direction: "debit",
          reason: "overdraft", idempotencyKey: "iso-overdraft",
        }),
      "موجودی",
    );
  });
});

// ————— 4) Plans & purchases —————

describe("isolation · plans & purchases", () => {
  test("planList only shows own-tenant plans", async () => {
    const s = buildScenario();
    seedEconomy(s);
    const list = await call(s.ctx, billing.planList as never, { token: s.tokens.resA });
    expect(list.map((p: any) => p._id)).toEqual(["plan-A"]);
    expect(JSON.stringify(list)).not.toContain("plan-B");
  });

  test("user of A cannot buy B's plan (cross-tenant purchase)", async () => {
    const s = buildScenario();
    seedEconomy(s);
    await expectThrows(
      () =>
        call(s.ctx, billing.purchasePlan as never, {
          token: s.tokens.a1, planId: "plan-B", idempotencyKey: "iso-buy-1",
        }),
      FORBIDDEN,
    );
    expect(s.db.tables.wallets.find((w) => w._id === "w-a1")!.balance).toBe(100_000);
    expect(s.db.tables.subscriptions.filter((x) => x.userId === s.ids.uA1)).toHaveLength(1);
  });

  test("B's user CAN buy B's plan with sufficient balance (positive control)", async () => {
    const s = buildScenario();
    seedEconomy(s);
    const r = await call(s.ctx, billing.purchasePlan as never, {
      token: s.tokens.b1, planId: "plan-B", idempotencyKey: "iso-buy-2",
    });
    expect(r.subscriptionId).not.toBeNull();
    expect(s.db.tables.wallets.find((w) => w._id === "w-b1")!.balance).toBe(100_000 - 20_000);
    const sub = s.db.tables.subscriptions.find((x) => x._id === r.subscriptionId)!;
    expect(sub.tenantId).toBe(s.ids.tResB);
  });

  test("subscriptionCancel on the other tree's subscription is forbidden", async () => {
    const s = buildScenario();
    seedEconomy(s);
    await expectThrows(
      () =>
        call(s.ctx, billing.subscriptionCancel as never, {
          token: s.tokens.resA, subscriptionId: "sub-B1",
        }),
      FORBIDDEN,
    );
    expect(s.db.tables.subscriptions.find((x) => x._id === "sub-B1")!.status).toBe("active");
  });

  test("subscriptionList is keyed by caller userId only", async () => {
    const s = buildScenario();
    seedEconomy(s);
    const list = await call(s.ctx, billing.subscriptionList as never, { token: s.tokens.a1 });
    expect(list.map((x: any) => x._id)).toEqual(["sub-A1"]);
    expect(JSON.stringify(list)).not.toContain("sub-B1");
  });
});

// ————— 5) Payments & cards —————

describe("isolation · payments & cards", () => {
  test("cardList hides other tenants' cards", async () => {
    const s = buildScenario();
    seedEconomy(s);
    const list = await call(s.ctx, payments.cardList as never, { token: s.tokens.resB });
    expect(list.map((c: any) => c._id)).toContain("card-B");
    const listA = await call(s.ctx, payments.cardList as never, { token: s.tokens.resA });
    expect(JSON.stringify(listA)).not.toContain("card-B");
  });

  test("card review of another tenant's payment is forbidden", async () => {
    const s = buildScenario();
    seedEconomy(s);
    s.db.tables.payments.push({
      _id: "pay-B1", tenantId: s.ids.tResB, userId: s.ids.uB1, method: "card_to_card",
      amount: 5000, status: "pending_review", cardId: "card-B", attemptCount: 0, createdAt: Date.now(),
    });
    await expectThrows(
      () =>
        call(s.ctx, payments.cardReview as never, {
          token: s.tokens.resA, paymentId: "pay-B1", decision: "approve",
        }),
      FORBIDDEN,
    );
    expect(s.db.tables.payments.find((p) => p._id === "pay-B1")!.status).toBe("pending_review");
    expect(s.db.tables.wallets.find((w) => w._id === "w-b1")!.balance).toBe(100_000);
  });

  test("approving own-tenant card payment credits the payer, records reviewer (positive control)", async () => {
    const s = buildScenario();
    seedEconomy(s);
    s.db.tables.payments.push({
      _id: "pay-B2", tenantId: s.ids.tResB, userId: s.ids.uB1, method: "card_to_card",
      amount: 5000, status: "pending_review", cardId: "card-B", attemptCount: 0, createdAt: Date.now(),
    });
    const r = await call(s.ctx, payments.cardReview as never, {
      token: s.tokens.resB, paymentId: "pay-B2", decision: "approve",
    });
    expect(r.ok).toBe(true);
    expect(s.db.tables.wallets.find((w) => w._id === "w-b1")!.balance).toBe(105_000);
    const pay = s.db.tables.payments.find((p) => p._id === "pay-B2")!;
    expect(pay.status).toBe("paid");
    expect(pay.reviewedBy).toBe(s.ids.uResB);
  });

  test("pendingPayments never lists other tenants' queue", async () => {
    const s = buildScenario();
    seedEconomy(s);
    s.db.tables.payments.push({
      _id: "pay-B3", tenantId: s.ids.tResB, userId: s.ids.uB1, method: "card_to_card",
      amount: 1000, status: "pending_review", attemptCount: 0, createdAt: Date.now(),
    });
    const rows = await call(s.ctx, payments.pendingPayments as never, { token: s.tokens.resA });
    expect(JSON.stringify(rows)).not.toContain("pay-B3");
    const rowsB = await call(s.ctx, payments.pendingPayments as never, { token: s.tokens.resB });
    expect(rowsB.map((p: any) => p._id)).toContain("pay-B3");
  });

  test("provider payment acceptance is idempotent and tenant-attributed", async () => {
    const s = buildScenario();
    seedEconomy(s);
    s.db.tables.payments.push({
      _id: "pay-B4", tenantId: s.ids.tResB, userId: s.ids.uB1, method: "cubepay",
      amount: 7000, status: "awaiting_verify", providerPaymentId: "pp-1", attemptCount: 0, createdAt: Date.now(),
    });
    const first = await call(s.ctx, payments.acceptProviderPayment as never, {
      paymentId: "pay-B4", expectedAmount: 7000, providerPaymentId: "pp-1",
    });
    expect(first.ok).toBe(true);
    const again = await call(s.ctx, payments.acceptProviderPayment as never, {
      paymentId: "pay-B4", expectedAmount: 7000, providerPaymentId: "pp-1",
    });
    expect(again.alreadyPaid).toBe(true);
    // amount mismatch rejected — the classic webhook replay attack
    s.db.tables.payments.push({
      _id: "pay-B5", tenantId: s.ids.tResB, userId: s.ids.uB1, method: "cubepay",
      amount: 7000, status: "awaiting_verify", providerPaymentId: "pp-2", attemptCount: 0, createdAt: Date.now(),
    });
    const bad = await call(s.ctx, payments.acceptProviderPayment as never, {
      paymentId: "pay-B5", expectedAmount: 7_000_000, providerPaymentId: "pp-2",
    });
    expect(bad.ok).toBe(false);
    expect(s.db.tables.wallets.find((w) => w._id === "w-b1")!.balance).toBe(107_000); // exactly one credit
  });
});

// ————— 6) Providers & servers —————

describe("isolation · providers & servers", () => {
  test("providerList only shows own-tenant upstreams", async () => {
    const s = buildScenario();
    seedEconomy(s);
    const listB = await call(s.ctx, providersMod.providerList as never, { token: s.tokens.resB });
    expect(listB.map((p: any) => p._id)).toEqual(["prov-B"]);
    const listA = await call(s.ctx, providersMod.providerList as never, { token: s.tokens.resA });
    expect(JSON.stringify(listA)).not.toContain("prov-B");
  });

  test("serverUpsert cannot attach a server to another tenant's provider", async () => {
    const s = buildScenario();
    seedEconomy(s);
    await expectThrows(
      () =>
        call(s.ctx, providersMod.serverUpsert as never, {
          token: s.tokens.resA, providerId: "prov-B", name: "hijack", remoteRef: "x",
        }),
      FORBIDDEN,
    );
    expect(s.db.tables.servers.filter((x) => x.tenantId === s.ids.tResA)).toHaveLength(0);
  });

  test("credentials are never returned to any client (hash/token discipline)", async () => {
    const s = buildScenario();
    seedEconomy(s);
    // providerList is tenant-scoped, so the OWNER sees its own provider metadata —
    // but never the encrypted credential material.
    const list = await call(s.ctx, providersMod.providerList as never, { token: s.tokens.resB });
    expect(list.map((p: any) => p._id)).toEqual(["prov-B"]);
    expect(JSON.stringify(list)).not.toContain("env-B"); // credentialsEncrypted masked
    expect(list[0].hasCredentials).toBe(true);
  });

  test("clientHome and connectProfile never expose another tenant's servers", async () => {
    const s = buildScenario();
    seedEconomy(s);
    const home = await call(s.ctx, clientApi.clientHome as never, { token: s.tokens.b1 });
    expect(home.servers.map((x: any) => x.id)).toEqual(["srv-B"]);
    const homeA = await call(s.ctx, clientApi.clientHome as never, { token: s.tokens.a1 });
    expect(JSON.stringify(homeA)).not.toContain("srv-B");
    // explicit foreign serverId is rejected by scope
    await expectThrows(
      () => call(s.ctx, clientApi.connectProfile as never, { token: s.tokens.a1, serverId: "srv-B" }),
      FORBIDDEN,
    );
  });

  test("deviceRevoke on another tenant's device is forbidden", async () => {
    const s = buildScenario();
    seedEconomy(s);
    await expectThrows(
      () => call(s.ctx, clientApi.deviceRevoke as never, { token: s.tokens.a1, deviceId: "dev-B" }),
      FORBIDDEN,
    );
    expect(s.db.tables.clientDevices.find((d) => d._id === "dev-B")!.status).toBe("active");
  });
});

// ————— 7) Telegram bot & linking —————

describe("isolation · telegram bot & linking", () => {
  test("botConfigGet returns only own-tenant bot config", async () => {
    const s = buildScenario();
    seedEconomy(s);
    const cfg = await call(s.ctx, telegram.botConfigGet as never, { token: s.tokens.resB });
    expect(cfg.botConfigId).toBe("botcfg-B");
    expect(JSON.stringify(cfg)).not.toContain("tokenEncrypted");
    const cfgA = await call(s.ctx, telegram.botConfigGet as never, { token: s.tokens.resA });
    expect(cfgA).toBeNull();
  });

  test("bot admin linking cannot bind a user from another tenant (botUserLinkAction chain)", async () => {
    const s = buildScenario();
    seedEconomy(s);
    // Direct internal-mutation attempt: link A's user into B's bot
    const { botAdminLinkInternal } = telegram as any;
    await expectThrows(
      () =>
        call(s.ctx, botAdminLinkInternal as never, {
          botConfigId: "botcfg-B", telegramUserId: 555, username: "a1",
        }),
      "متعلق به این bot نیست",
    );
    expect(s.db.tables.botUsers.filter((b) => b.telegramUserId === 555)).toHaveLength(0);
  });

  test("webhook secret is per-tenant; a wrong tenant's secret is rejected", async () => {
    const s = buildScenario();
    seedEconomy(s);
    const check = async (secret: string) =>
      call(s.ctx, (telegram as any).verifyWebhookSecret as never, { botConfigId: "botcfg-B", secret });
    expect((await check("whsec-B")).ok).toBe(true);
    expect((await check("whsec-A")).ok).toBe(false);
  });

  test("miniApp auth/register cannot cross tenants (register ties user to bot's tenant)", async () => {
    const s = buildScenario();
    seedEconomy(s);
    // register with a username that exists in ANOTHER tenant → conflict, never cross-link
    await expectThrows(
      () =>
        call(s.ctx, (telegram as any).miniAppRegisterInternal as never, {
          botConfigId: "botcfg-B", telegramUserId: 777, username: "a1", passwordEnvelope: "env",
        }),
      "تکراری",
    );
  });
});

// ————— 8) Apps / builds / domains / api keys / backups / audit —————

describe("isolation · app builder, domains, api keys, backups, audit", () => {
  test("buildEnqueue cannot build another tenant's app customization", async () => {
    const s = buildScenario();
    seedEconomy(s);
    await expectThrows(
      () =>
        call(s.ctx, apps.buildEnqueue as never, {
          token: s.tokens.resA, appCustomizationId: "app-B", platform: "android",
        }),
      FORBIDDEN,
    );
    expect(s.db.tables.builds.filter((b) => b.tenantId === s.ids.tResA)).toHaveLength(0);
  });

  test("buildList only shows own builds", async () => {
    const s = buildScenario();
    seedEconomy(s);
    s.db.tables.builds.push({
      _id: "build-B", tenantId: s.ids.tResB, appCustomizationId: "app-B",
      status: "queued", platform: "android", version: "is0.1.0", buildNumber: 2, startedAt: Date.now(),
    });
    const list = await call(s.ctx, apps.buildList as never, { token: s.tokens.resA });
    expect(JSON.stringify(list)).not.toContain("build-B");
  });

  test("domainVerify cannot verify another tenant's domain", async () => {
    const s = buildScenario();
    seedEconomy(s);
    await expectThrows(
      () => call(s.ctx, infra.domainVerify as never, { token: s.tokens.resA, domainId: "dom-B" }),
      FORBIDDEN,
    );
    expect(s.db.tables.customDomains.find((d) => d._id === "dom-B")!.verified).toBe(false);
  });

  test("tenant cannot claim the platform's main domain", async () => {
    const s = buildScenario();
    seedEconomy(s);
    s.db.tables.systemSettings.push({ _id: "set-md", key: "main_domain", value: "core.example.com" });
    await expectThrows(
      () =>
        call(s.ctx, infra.domainAdd as never, {
          token: s.tokens.resB, domain: "core.example.com", isWildcard: false,
        }),
      FORBIDDEN,
    );
  });

  test("apiKeyRevoke cannot revoke another tenant's API key", async () => {
    const s = buildScenario();
    seedEconomy(s);
    await expectThrows(
      () => call(s.ctx, infra.apiKeyRevoke as never, { token: s.tokens.resA, apiKeyId: "key-B" }),
      FORBIDDEN,
    );
    expect(s.db.tables.apiKeys.find((k) => k._id === "key-B")!.status).toBe("active");
  });

  test("apiKeyList returns no key hashes cross-tenant", async () => {
    const s = buildScenario();
    seedEconomy(s);
    const list = await call(s.ctx, infra.apiKeyList as never, { token: s.tokens.resA });
    expect(JSON.stringify(list)).not.toContain("key-B");
    expect(JSON.stringify(list)).not.toContain("hash-B");
  });

  test("backupList: tenant admin sees only own-tenant backups, never core/system rows", async () => {
    const s = buildScenario();
    seedEconomy(s);
    // backupList requires admin/super_admin — add an admin inside B's tree.
    s.db.tables.users.push({
      _id: "u-adminB", username: "adminB", role: "admin", tenantId: s.ids.tResB,
      status: "active", passwordHash: "x", failedLogins: 0,
    });
    s.db.tables.sessions.push({
      _id: "sess-tok-adminB", userId: "u-adminB", tokenHash: stableTokenHash("tok-adminB"),
      refreshTokenHash: stableTokenHash("tok-adminB-r"), status: "active", expiresAt: Date.now() + 86400_000,
    });
    s.db.tables.backups.push({
      _id: "bak-B", kind: "manual", scope: "tenant", tenantId: s.ids.tResB,
      storageId: "st-1", checksum: "c", encrypted: true, status: "created", createdAt: Date.now(),
    });
    s.db.tables.backups.push({
      _id: "bak-core", kind: "manual", scope: "system",
      storageId: "st-2", checksum: "c2", encrypted: true, status: "created", createdAt: Date.now(),
    });
    const listB = await call(s.ctx, infra.backupList as never, { token: "tok-adminB" });
    expect(listB.map((b: any) => b._id)).toEqual(["bak-B"]);
    // and a reseller (below admin rank) is denied outright
    await expectThrows(() => call(s.ctx, infra.backupList as never, { token: s.tokens.resB }), FORBIDDEN);
  });

  test("audit log: reseller cannot read another tree's audit entries", async () => {
    const s = buildScenario();
    seedEconomy(s);
    const rows = await call(s.ctx, audit.list as never, { token: s.tokens.resA });
    expect(JSON.stringify(rows)).not.toContain("seed.action"); // B's seeded audit entry
    const rowsB = await call(s.ctx, audit.list as never, { token: s.tokens.resB });
    expect(rowsB.map((r: any) => r._id)).toContain("audit-B");
  });

  test("audit log: explicit foreign tenantId argument is rejected by scope", async () => {
    const s = buildScenario();
    seedEconomy(s);
    await expectThrows(
      () =>
        call(s.ctx, audit.list as never, {
          token: s.tokens.resA, tenantId: s.ids.tResB,
        }),
      FORBIDDEN,
    );
  });

  test("revenue report aggregates ONLY own-tenant ledger entries (q.and regression)", async () => {
    const s = buildScenario();
    const t = s.db.tables;
    const now = Date.now();
    // A-tree credits: 3000 total. B-tree credits: 7000 total.
    t.ledgerEntries.push({
      _id: "le-A1", walletId: "w-a1", tenantId: s.ids.tResA, seq: 1,
      type: "deposit", amount: 3000, direction: "credit", balanceAfter: 3000,
      reason: "A topup", createdAt: now - 1000,
    });
    t.ledgerEntries.push({
      _id: "le-B1", walletId: "w-b1", tenantId: s.ids.tResB, seq: 1,
      type: "deposit", amount: 7000, direction: "credit", balanceAfter: 7000,
      reason: "B topup", createdAt: now,
    });
    const rep = await call(s.ctx, infra.reportGenerate as never, {
      token: s.tokens.resA, kind: "revenue",
      periodStart: now - 60_000, periodEnd: now + 60_000,
    });
    // Before the q.and fix, JS `&&` dropped the tenantId constraint and this
    // summed B's 7000 too. Strict isolation: reseller A sees only its own 3000.
    expect(rep.data.credits).toBe(3000);
    expect(rep.data.debits).toBe(0);
    expect(rep.data.entryCount).toBe(1);
  });
});

// ————— 9) Referrals —————

describe("isolation · referrals", () => {
  test("referralAttach cannot attach a user from another tenant", async () => {
    const s = buildScenario();
    seedEconomy(s);
    await expectThrows(
      () =>
        call(s.ctx, referrals.referralAttach as never, {
          token: s.tokens.resA, referredUserId: s.ids.uB1,
        }),
      FORBIDDEN,
    );
    expect(s.db.tables.referrals).toHaveLength(0);
  });

  test("self-referral is rejected", async () => {
    const s = buildScenario();
    seedEconomy(s);
    await expectThrows(
      () =>
        call(s.ctx, referrals.referralAttach as never, {
          token: s.tokens.resA, referredUserId: s.ids.uResA,
        }),
      "خودارجاعی",
    );
  });
});

// ————— 10) System settings & feature flags —————

describe("isolation · system-level settings", () => {
  test("non-super-admin cannot change global settings", async () => {
    const s = buildScenario();
    seedEconomy(s);
    await expectThrows(
      () =>
        call(s.ctx, tenantsMod.systemSettingsSet as never, {
          token: s.tokens.resB, key: "maintenance_mode", value: true,
        }),
      FORBIDDEN,
    );
  });

  test("core identity setting is immutable even for super admin", async () => {
    const s = buildScenario();
    seedEconomy(s);
    await expectThrows(
      () =>
        call(s.ctx, tenantsMod.systemSettingsSet as never, {
          token: s.tokens.core, key: "identity", value: { product: "Evil" },
        }),
      FORBIDDEN,
    );
  });

  test("feature flag change by non-super-admin is rejected", async () => {
    const s = buildScenario();
    seedEconomy(s);
    await expectThrows(
      () =>
        call(s.ctx, tenantsMod.featureFlagsSet as never, {
          token: s.tokens.resB, key: "WebApp", globallyEnabled: true,
        }),
      FORBIDDEN,
    );
  });
});

// ————— 11) Deep ownership-tree property tests —————

describe("isolation · ownership tree properties (pure logic, exhaustive)", () => {
  test("every non-core actor is denied every tenant outside its own subtree", async () => {
    const s = buildScenario();
    const { tenantScopeWalk } = await import("../src/core/tenantScope");
    const get = (id: string) => s.db.tables.tenants.find((t) => t._id === id) ?? null;
    const all = [s.ids.tCore, s.ids.tResA, s.ids.tSubA, s.ids.tResB];
    const actors: Array<[string, string[]]> = [
      [s.ids.tResA, [s.ids.tResA, s.ids.tSubA]], // allowed set
      [s.ids.tSubA, [s.ids.tSubA]],
      [s.ids.tResB, [s.ids.tResB]],
    ];
    for (const [actor, allowed] of actors) {
      for (const target of all) {
        const r = tenantScopeWalk(actor, target, get);
        expect(r.ok).toBe(allowed.includes(target));
      }
    }
    // core reaches everywhere
    for (const target of all) {
      expect(tenantScopeWalk(s.ids.tCore, target, get).ok).toBe(true);
    }
  });

  test("tenant parent cycle: walk terminates, follows only real parent edges, async agrees", async () => {
    const { tenantScopeWalk, tenantScopeWalkAsync } = await import("../src/core/tenantScope");
    // att.parent = vic AND vic.parent = att: each node is genuinely the other's
    // parent, so access via the parent chain is granted in both directions —
    // the cycle creates NO access that the parent edges do not already imply.
    // The security properties: the walk terminates (bounded at 32), a tenant
    // outside the cycle is still unreachable, and sync/async agree.
    const tenants = [
      { _id: "att", parentTenantId: "vic" },
      { _id: "vic", parentTenantId: "att" },
      { _id: "out", status: "active" }, // unrelated tenant, no parent edge
    ];
    const get = (id: string) => tenants.find((t) => t._id === id) ?? null;
    expect(tenantScopeWalk("att", "vic", get).ok).toBe(true);
    expect(tenantScopeWalk("vic", "att", get).ok).toBe(true);
    // unrelated tenant unreachable from either side of the cycle
    expect(tenantScopeWalk("att", "out", get).ok).toBe(false);
    expect(tenantScopeWalk("vic", "out", get).ok).toBe(false);
    expect(tenantScopeWalk("out", "att", get).ok).toBe(false);
    expect(tenantScopeWalk("out", "vic", get).ok).toBe(false);
    // async variant agrees on every pair
    for (const a of ["att", "vic", "out"]) {
      for (const b of ["att", "vic", "out"]) {
        const sync = tenantScopeWalk(a, b, get);
        const asyncR = await tenantScopeWalkAsync(a, b, async (id) => get(id));
        expect(asyncR.ok).toBe(sync.ok);
      }
    }
  });

  test("parent chain deeper than the walk bound (32) fails closed", async () => {
    const { tenantScopeWalk } = await import("../src/core/tenantScope");
    // 40-deep chain: deep40 <- deep39 <- ... <- deep1. Walking up from deep40
    // must terminate without ever reaching deep1's ancestor position — access
    // is bounded, never unbounded recursion.
    const tenants: Array<{ _id: string; parentTenantId?: string }> = [];
    for (let i = 1; i <= 40; i++) {
      tenants.push({ _id: `deep${i}`, parentTenantId: i > 1 ? `deep${i - 1}` : undefined });
    }
    const get = (id: string) => tenants.find((t) => t._id === id) ?? null;
    // direct child still works
    expect(tenantScopeWalk("deep1", "deep2", get).ok).toBe(true);
    // beyond the bound: denied, and terminates
    expect(tenantScopeWalk("deep1", "deep40", get).ok).toBe(false);
  });

  test("missing tenant records fail closed", async () => {
    const { tenantScopeWalk } = await import("../src/core/tenantScope");
    expect(tenantScopeWalk("ghost", "ghost", () => null).ok).toBe(true); // same id short-circuit only for identical ghosts
    expect(tenantScopeWalk("ghost", "real", () => null).ok).toBe(false);
    expect(tenantScopeWalk("real", "ghost", () => null).ok).toBe(false);
  });
});

// ————— 12) The comprehensive JSON-leak property check —————

describe("isolation · no cross-tenant data leakage in any read (property sweep)", () => {
  test("every read available to b1 (tenant B user) contains zero A-tree identifiers", async () => {
    const s = buildScenario();
    seedEconomy(s);
    const A_MARKERS = ["resA", "a1", "plan-A", "sub-A1", "w-a1", "w-resA", "u-resA", "t-resA", "t-subA", "s1"];
    const reads: Array<[string, () => Promise<unknown>]> = [
      ["whoami", () => call(s.ctx, auth.whoami as never, { token: s.tokens.b1 })],
      ["walletGet", () => call(s.ctx, wallet.walletGet as never, { token: s.tokens.b1 })],
      ["walletHistory", () => call(s.ctx, wallet.walletHistory as never, { token: s.tokens.b1 })],
      ["planList", () => call(s.ctx, billing.planList as never, { token: s.tokens.b1 })],
      ["subscriptionList", () => call(s.ctx, billing.subscriptionList as never, { token: s.tokens.b1 })],
      ["myPayments", () => call(s.ctx, payments.myPayments as never, { token: s.tokens.b1 })],
      ["providerList", () => call(s.ctx, providersMod.providerList as never, { token: s.tokens.b1 })],
      ["serverList", () => call(s.ctx, providersMod.serverList as never, { token: s.tokens.b1 })],
      ["botConfigGet", () => call(s.ctx, telegram.botConfigGet as never, { token: s.tokens.b1 })],
      ["domainList", () => call(s.ctx, infra.domainList as never, { token: s.tokens.b1 })],
      ["apiKeyList", () => call(s.ctx, infra.apiKeyList as never, { token: s.tokens.b1 })],
      ["buildList", () => call(s.ctx, apps.buildList as never, { token: s.tokens.b1 })],
      ["appGet", () => call(s.ctx, apps.appGet as never, { token: s.tokens.b1, appKind: "mainapp" })],
      ["referralList", () => call(s.ctx, referrals.referralList as never, { token: s.tokens.b1 })],
      ["referralRuleGet", () => call(s.ctx, referrals.referralRuleGet as never, { token: s.tokens.b1 })],
      ["clientHome", () => call(s.ctx, clientApi.clientHome as never, { token: s.tokens.b1 })],
      ["userList(no perm)", () => call(s.ctx, users.userList as never, { token: s.tokens.b1 })],
    ];
    for (const [name, fn] of reads) {
      let payload: unknown;
      try {
        payload = await fn();
      } catch (e) {
        // permission denials are fine — nothing leaked
        const msg = String((e as Error).message ?? e);
        expect(msg).not.toContain("resA");
        continue;
      }
      const text = JSON.stringify(payload) ?? "";
      for (const marker of A_MARKERS) {
        // NB: plain substring search has a known false positive ("expiresAt"
        // contains "resA"); markers are word-bounded to avoid it.
        const re = new RegExp(`(^|[^a-zA-Z])${marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-zA-Z]|$)`);
        expect(re.test(text), `${name} leaked marker '${marker}': ${text.slice(0, 200)}`).toBe(false);
      }
    }
  });  test("every cross-tenant WRITE attempt from resA against B-tree fails closed", async () => {
    const s = buildScenario();
    seedEconomy(s);
    // A real pending B payment so cardReview reaches the scope check (not NOT_FOUND).
    // Seeded BEFORE the snapshot so only denied writes can change state.
    s.db.tables.payments.push({
      _id: "pay-BX", tenantId: s.ids.tResB, userId: s.ids.uB1, method: "card_to_card",
      amount: 1000, status: "pending_review", cardId: "card-B", attemptCount: 0, createdAt: Date.now(),
    });
    const snapshot = () => JSON.stringify(s.db.tables);
    const before = snapshot();

    const writes: Array<[string, () => Promise<unknown>]> = [
      ["suspend B user", () => call(s.ctx, users.userSetStatus as never, { token: s.tokens.resA, userId: s.ids.uB1, status: "suspended" })],
      ["suspend B reseller", () => call(s.ctx, users.userSetStatus as never, { token: s.tokens.resA, userId: s.ids.uResB, status: "suspended" })],
      ["credit B user wallet", () => call(s.ctx, wallet.adminManualCredit as never, { token: s.tokens.resA, targetUserId: s.ids.uB1, amount: 1, reason: "x", idempotencyKey: "w1" })],
      ["buy B plan", () => call(s.ctx, billing.purchasePlan as never, { token: s.tokens.resA, planId: "plan-B", idempotencyKey: "w2" })],
      ["cancel B subscription", () => call(s.ctx, billing.subscriptionCancel as never, { token: s.tokens.resA, subscriptionId: "sub-B1" })],
      ["review B payment", () => call(s.ctx, payments.cardReview as never, { token: s.tokens.resA, paymentId: "pay-BX", decision: "approve" })],
      ["toggle B card", () => call(s.ctx, payments.cardToggle as never, { token: s.tokens.resA, cardId: "card-B", enabled: false })],
      ["server into B provider", () => call(s.ctx, providersMod.serverUpsert as never, { token: s.tokens.resA, providerId: "prov-B", name: "x", remoteRef: "x" })],
      ["verify B domain", () => call(s.ctx, infra.domainVerify as never, { token: s.tokens.resA, domainId: "dom-B" })],
      ["revoke B key", () => call(s.ctx, infra.apiKeyRevoke as never, { token: s.tokens.resA, apiKeyId: "key-B" })],
      ["build B app", () => call(s.ctx, apps.buildEnqueue as never, { token: s.tokens.resA, appCustomizationId: "app-B", platform: "android" })],
      ["revoke B device", () => call(s.ctx, clientApi.deviceRevoke as never, { token: s.tokens.resA, deviceId: "dev-B" })],
      ["foreign audit read", () => call(s.ctx, audit.list as never, { token: s.tokens.resA, tenantId: s.ids.tResB })],
      ["attach B referral", () => call(s.ctx, referrals.referralAttach as never, { token: s.tokens.resA, referredUserId: s.ids.uB1 })],
    ];
    for (const [name, fn] of writes) {
      await expectThrows(fn, FORBIDDEN);
    }
    expect(snapshot()).toBe(before); // database byte-for-byte unchanged
  });
});

// ————— 13) Negative authentication control —————

describe("isolation · unauthenticated and forged access", () => {
  test("no token → every surface rejects", async () => {
    const s = buildScenario();
    seedEconomy(s);
    for (const fn of [auth.whoami, users.userList, wallet.walletGet, billing.planList, payments.myPayments]) {
      await expectThrows(() => call(s.ctx, fn as never, { token: "" }), "UNAUTHENTICATED");
    }
  });

  test("forged token string cannot collide with a real session hash", async () => {
    const s = buildScenario();
    seedEconomy(s);
    await expectThrows(
      () => call(s.ctx, auth.whoami as never, { token: s.tokens.resA + "x" }),
      "UNAUTHENTICATED",
    );
    await expectThrows(
      () => call(s.ctx, auth.whoami as never, { token: "tok-ResA" }),
      "UNAUTHENTICATED",
    );
  });
});
