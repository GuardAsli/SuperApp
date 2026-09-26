/**
 * GuardAsli — احراز کلید API روی مسیرهای REST /api/v1/panel/*.
 *
 * اثبات خواسته‌شده (ایتم P0 حسابرسی):
 *  ۱) کلید معتبر → 200 و داده‌های همان tenant
 *  ۲) کلید غایب → 401
 *  ۳) کلید نامعتبر (بدنه غلط با prefix درست / prefix ناشناخته) → 401
 *  ۴) کلید ابطال‌شده → 403
 *  ۵) کلید منقضی → 403
 *  ۶) سکوپ ناکافی → 403
 *  ۷) lastUsedAt به‌روز می‌شود و tenant دیگر داده نمی‌بیند (ایزوله tenant)
 *
 * کل http routing واقعی از طریق http.run (همان هندلری که Convex نصب می‌کند) اجرا می‌شود.
 */
import { describe, expect, test } from "bun:test";
import { call, makeCtx, makeDb } from "./tenantIsolation";
import * as infra from "../src/convex/infra";
import * as httpApi from "../src/convex/httpApi";
import { randomToken } from "../src/convex/runtime";
import { stableTokenHash } from "../src/core/sessionToken";

function seedScene() {
  const db = makeDb({
    tenants: [], users: [], apiKeys: [], subscriptions: [], auditLogs: [],
  });
  const ctx = makeCtx(db);
  const t = db.tables as Record<string, any[]>;
  t.tenants.push({ _id: "t-1", name: "acme", status: "active", config: { core: true } });
  t.tenants.push({ _id: "t-2", name: "other", status: "active", parentTenantId: "t-1" });
  t.users.push({ _id: "u-1", username: "admin", role: "super_admin", tenantId: "t-1", status: "active", passwordHash: "x" });
  t.users.push({ _id: "u-2", username: "buyer", role: "user", tenantId: "t-1", status: "active", passwordHash: "x" });
  t.users.push({ _id: "u-other", username: "other", role: "user", tenantId: "t-2", status: "active", passwordHash: "x" });
  t.subscriptions.push({
    _id: "sub-1", tenantId: "t-1", userId: "u-2", kind: "traffic",
    status: "active", provisioningState: "provisioned", trafficUsedGb: 3,
  });
  return { db, ctx, t };
}

/** ساخت کلید مستقیم در DB با همان قرارداد apiKeyCreate (hash-only). */
function insertKey(
  scene: ReturnType<typeof seedScene>,
  opts: { scopes?: string[]; status?: string; expiresInDays?: number; tenantId?: string } = {},
): string {
  const raw = `ga_${randomToken(24)}`;
  (scene.t.apiKeys as any[]).push({
    _id: `key-${Math.random().toString(36).slice(2, 8)}`,
    tenantId: opts.tenantId ?? "t-1",
    createdBy: "u-1",
    name: "test key",
    prefix: raw.slice(0, 10),
    keyHash: stableTokenHash(raw),
    scopes: opts.scopes ?? ["panel:read"],
    status: opts.status ?? "active",
    ...(opts.expiresInDays !== undefined
      ? { expiresAt: Date.now() + opts.expiresInDays * 86400_000 }
      : {}),
  });
  return raw;
}

/** فراخوانی HTTP واقعی از طریق هندلر نصب‌شده‌ی Convex. */
async function req(
  scene: ReturnType<typeof seedScene>,
  path: string,
  headers: Record<string, string> = {},
): Promise<Response> {
  const r = new Request(`https://panel.example.com${path}`, { headers });
  const httpFn = (httpApi as any).http;
  return (await httpFn._handler(scene.ctx, r)) as Response;
}

/** helper: فراخوانی مستقیم handler واقعی httpAction با ctx هارنس. */
async function callHttp(
  scene: ReturnType<typeof seedScene>,
  path: string,
  headers: Record<string, string> = {},
): Promise<{ status: number; body: any }> {
  const r = new Request(`https://panel.example.com${path}`, { headers });
  const httpFn = (httpApi as any).http;
  // handler خود httpAction: (ctx, request) => Response — همان چیزی که Convex به http.ts می‌دهد
  const res = (await httpFn._handler(scene.ctx, r)) as Response;
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body };
}

describe("api key auth · valid key grants access", () => {
  test("valid key → 200 with own-tenant data on /panel/overview", async () => {
    const scene = seedScene();
    const key = insertKey(scene);
    const { status, body } = await callHttp(scene, "/api/v1/panel/overview", {
      Authorization: `Bearer ${key}`,
    });
    expect(status).toBe(200);
    expect(body.tenantId).toBe("t-1");
    expect(body.users).toBe(2);
    expect(body.activeUsers).toBe(2);
    expect(body.activeSubscriptions).toBe(1);
  });

  test("valid key → 200 on /panel/users without password hashes", async () => {
    const scene = seedScene();
    const key = insertKey(scene);
    const { status, body } = await callHttp(scene, "/api/v1/panel/users", {
      Authorization: `Bearer ${key}`,
    });
    expect(status).toBe(200);
    expect(body.count).toBe(2);
    for (const u of body.users) {
      expect(u.passwordHash).toBeUndefined();
      expect(u.passwordSalt).toBeUndefined();
      expect(u.username).toBeDefined();
    }
  });

  test("valid key → 200 on /panel/subscriptions with own rows only", async () => {
    const scene = seedScene();
    const key = insertKey(scene);
    const { status, body } = await callHttp(scene, "/api/v1/panel/subscriptions", {
      Authorization: `Bearer ${key}`,
    });
    expect(status).toBe(200);
    expect(body.subscriptions.length).toBe(1);
    expect(body.subscriptions[0].subscriptionId).toBe("sub-1");
  });

  test("lastUsedAt is stamped after a successful call", async () => {
    const scene = seedScene();
    const key = insertKey(scene);
    await callHttp(scene, "/api/v1/panel/overview", { Authorization: `Bearer ${key}` });
    const row = (scene.t.apiKeys as any[])[0];
    expect(row.lastUsedAt).toBeGreaterThan(0);
  });
});

describe("api key auth · denials", () => {
  test("missing key → 401 UNAUTHENTICATED", async () => {
    const scene = seedScene();
    const { status, body } = await callHttp(scene, "/api/v1/panel/overview");
    expect(status).toBe(401);
    expect(body.code).toBe("UNAUTHENTICATED");
  });

  test("non-Bearer header → 401", async () => {
    const scene = seedScene();
    const { status } = await callHttp(scene, "/api/v1/panel/overview", { Authorization: "Basic abc" });
    expect(status).toBe(401);
  });

  test("wrong key body with a real prefix → 401 (same message as unknown)", async () => {
    const scene = seedScene();
    const key = insertKey(scene);
    const tampered = key.slice(0, 10) + "x".repeat(key.length - 10);
    const a = await callHttp(scene, "/api/v1/panel/overview", { Authorization: `Bearer ${tampered}` });
    const b = await callHttp(scene, "/api/v1/panel/overview", { Authorization: "Bearer ga_totallyunknownkey123456" });
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    // بدون افشای اینکه prefix معتبر بوده
    expect(a.body.message).toBe(b.body.message);
  });

  test("revoked key → 403 FORBIDDEN", async () => {
    const scene = seedScene();
    const key = insertKey(scene, { status: "revoked" });
    const { status, body } = await callHttp(scene, "/api/v1/panel/overview", {
      Authorization: `Bearer ${key}`,
    });
    expect(status).toBe(403);
    expect(body.code).toBe("FORBIDDEN");
  });

  test("expired key → 403", async () => {
    const scene = seedScene();
    const key = insertKey(scene, { expiresInDays: -1 });
    const { status } = await callHttp(scene, "/api/v1/panel/overview", {
      Authorization: `Bearer ${key}`,
    });
    expect(status).toBe(403);
  });

  test("insufficient scope → 403 with the missing scope named", async () => {
    const scene = seedScene();
    const key = insertKey(scene, { scopes: ["other:scope"] });
    const { status, body } = await callHttp(scene, "/api/v1/panel/overview", {
      Authorization: `Bearer ${key}`,
    });
    expect(status).toBe(403);
    expect(body.message).toContain("panel:read");
  });
});

describe("api key auth · tenant isolation", () => {
  test("key of tenant-2 never sees tenant-1 data", async () => {
    const scene = seedScene();
    const keyOther = insertKey(scene, { tenantId: "t-2" });
    const { status, body } = await callHttp(scene, "/api/v1/panel/overview", {
      Authorization: `Bearer ${keyOther}`,
    });
    expect(status).toBe(200);
    expect(body.tenantId).toBe("t-2");
    expect(body.users).toBe(1);
    expect(body.subscriptions).toBe(0);
  });

  test("auth verdict of infra layer matches direct expectations", async () => {
    const scene = seedScene();
    const key = insertKey(scene, { scopes: ["panel:read"] });
    const verdict = (await call(scene.ctx, infra.apiKeyAuthorize, {
      authorization: `Bearer ${key}`,
      requiredScope: "panel:read",
    })) as any;
    expect(verdict.ok).toBe(true);
    expect(verdict.tenantId).toBe("t-1");
    expect(verdict.scopes).toEqual(["panel:read"]);
    expect(verdict.keyHash).toBeUndefined();
  });
});

describe("api key auth · error contract", () => {
  test("denials carry requestId and standard shape", async () => {
    const scene = seedScene();
    const { body } = await callHttp(scene, "/api/v1/panel/overview", {
      Authorization: "Bearer ga_wrongkeyvalue123456789",
    });
    expect(body.code).toBe("UNAUTHENTICATED");
    expect(typeof body.requestId).toBe("string");
    expect(body.requestId.startsWith("ga_")).toBe(true);
  });
});
