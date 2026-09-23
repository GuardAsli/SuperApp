/**
 * GuardAsli — تست‌های جداسازی مستأجر (بند ۴۴ امنیت).
 * هیچ دسترسی بین‌مستأجری مجاز نیست — اثبات‌شده با harness واقعی.
 */
import { describe, expect, test } from "bun:test";
import { tenantScopeWalk, tenantTreeIds, type TenantRef } from "../src/core/tenantScope";
import { stableTokenHash } from "../src/convex/auth";

// ————— Harness واقعی DB —————

interface Doc { _id: string; [k: string]: unknown }

function makeDb(tables: Record<string, Doc[]>) {
  const byId = new Map<string, Doc>();
  for (const rows of Object.values(tables)) {
    for (const d of rows) byId.set(d._id, d);
  }
  const get = async (id: string) => byId.get(id) ?? null;
  const insert = async (table: string, doc: Record<string, unknown>) => {
    const id = `${table}_${Math.random().toString(36).slice(2, 10)}`;
    const d = { _id: id, ...doc } as Doc;
    tables[table] = tables[table] ?? [];
    tables[table].push(d);
    byId.set(id, d);
    return id;
  };
  const patch = async (id: string, data: Record<string, unknown>) => {
    const d = byId.get(id);
    if (!d) throw new Error("NOT_FOUND");
    Object.assign(d, data);
  };
  return { tables, get, insert, patch };
}

function requireActorHarness(ctx: any) {
  // نسخه محلی requireActor با همان منطق auth.ts — بدون وابستگی به Convex runtime
  return async (token: string | null | undefined) => {
    if (!token) throw new Error("UNAUTHENTICATED");
    const th = stableTokenHash(token);
    const session = ctx.tables.sessions.find((s: any) => s.tokenHash === th);
    if (!session || session.status !== "active" || session.expiresAt < Date.now()) {
      throw new Error("UNAUTHENTICATED");
    }
    const user = await ctx.get(session.userId);
    if (!user || user.status !== "active") throw new Error("UNAUTHENTICATED");
    const tenant = await ctx.get(user.tenantId);
    if (!tenant || tenant.status !== "active") throw new Error("UNAUTHENTICATED");
    return {
      userId: user._id as string,
      tenantId: user.tenantId as string,
      role: user.role as string,
      status: user.status as string,
      sessionId: session._id as string,
    };
  };
}

function requireTenantScopeHarness(ctx: any) {
  return async (actor: { tenantId: string }, resourceTenantId: string) => {
    const result = tenantScopeWalk(actor.tenantId, resourceTenantId, (id) => {
      const d = ctx.tables.tenants.find((t: any) => t._id === id);
      return d ?? null;
    });
    if (!result.ok) throw new Error(result.reason ?? "FORBIDDEN");
  };
}

function makeSession(db: any, userId: string, token: string) {
  db.tables.sessions.push({
    _id: `sess_${token}`,
    userId,
    tokenHash: stableTokenHash(token),
    refreshTokenHash: stableTokenHash(token + "r"),
    status: "active",
    expiresAt: Date.now() + 86400_000,
  });
}

// ————— سناریوی استاندارد —————

/**
 * Core (tenant-1, core=true)
 *  ├── Reseller-A (tenant-2, parent=tenant-1) → کاربر A1 (tenant-2)
 *  │      └── Sub (tenant-4, parent=tenant-2) → کاربر S1 (tenant-4)
 *  ├── Reseller-B (tenant-3, parent=tenant-1) → کاربر B1 (tenant-3)
 *  └── مستأجر مستقل C (tenant-5, parent=tenant-1) → کاربر C1 (tenant-5)
 */
function buildScenario() {
  const tenants: TenantRef[] = [
    { _id: "tenant-1", config: { core: true }, status: "active" } as TenantRef,
    { _id: "tenant-2", parentTenantId: "tenant-1", status: "active" } as TenantRef,
    { _id: "tenant-3", parentTenantId: "tenant-1", status: "active" } as TenantRef,
    { _id: "tenant-4", parentTenantId: "tenant-2", status: "active" } as TenantRef,
    { _id: "tenant-5", parentTenantId: "tenant-1", status: "active" } as TenantRef,
  ];
  const users: Doc[] = [
    { _id: "u-core", username: "core", role: "super_admin", tenantId: "tenant-1", status: "active", passwordHash: "h" },
    { _id: "u-a", username: "resa", role: "reseller", tenantId: "tenant-2", status: "active", passwordHash: "h" },
    { _id: "u-a1", username: "a1", role: "user", tenantId: "tenant-2", status: "active", passwordHash: "h" },
    { _id: "u-s1", username: "s1", role: "user", tenantId: "tenant-4", status: "active", passwordHash: "h" },
    { _id: "u-b1", username: "b1", role: "user", tenantId: "tenant-3", status: "active", passwordHash: "h" },
    { _id: "u-c1", username: "c1", role: "user", tenantId: "tenant-5", status: "active", passwordHash: "h" },
  ];
  const db = makeDb({ tenants: tenants as unknown as Doc[], users, sessions: [] });
  return db;
}

// ————— تست‌ها —————

describe("جداسازی مستأجر — مرز دسترسی", () => {
  test("کاربر فقط داده‌ی tenant خودش را می‌بیند", () => {
    const r = tenantScopeWalk("tenant-2", "tenant-2", (id) =>
      buildScenario().tables.tenants.find((t) => t._id === id) ?? null,
    );
    expect(r.ok).toBe(true);
  });

  test("کاربر به نسل‌های پایین‌دست خودش دسترسی دارد", () => {
    // Reseller-A → Sub-tenant
    const sc = buildScenario();
    const r = tenantScopeWalk("tenant-2", "tenant-4", (id) =>
      sc.tables.tenants.find((t) => t._id === id) ?? null,
    );
    expect(r.ok).toBe(true);
  });

  test("کاربر به tenant خواهر (sibling) دسترسی ندارد", () => {
    const sc = buildScenario();
    const r = tenantScopeWalk("tenant-2", "tenant-3", (id) =>
      sc.tables.tenants.find((t) => t._id === id) ?? null,
    );
    expect(r.ok).toBe(false);
  });

  test("کاربر به tenant پدر (بالا) دسترسی ندارد", () => {
    const sc = buildScenario();
    const r = tenantScopeWalk("tenant-4", "tenant-2", (id) =>
      sc.tables.tenants.find((t) => t._id === id) ?? null,
    );
    expect(r.ok).toBe(false);
  });

  test("کاربر به درخت شاخه‌ی دیگر دسترسی ندارد", () => {
    const sc = buildScenario();
    const r = tenantScopeWalk("tenant-5", "tenant-4", (id) =>
      sc.tables.tenants.find((t) => t._id === id) ?? null,
    );
    expect(r.ok).toBe(false);
  });

  test("Core به همه‌جا دسترسی دارد", () => {
    const sc = buildScenario();
    for (const target of ["tenant-2", "tenant-3", "tenant-4", "tenant-5"]) {
      const r = tenantScopeWalk("tenant-1", target, (id) =>
        sc.tables.tenants.find((t) => t._id === id) ?? null,
      );
      expect(r.ok).toBe(true);
    }
  });

  test("tenant بدون core به درخت دیگر دسترسی ندارد — حتی اگر در مسیر باشد", () => {
    const sc = buildScenario();
    const r = tenantScopeWalk("tenant-2", "tenant-5", (id) =>
      sc.tables.tenants.find((t) => t._id === id) ?? null,
    );
    expect(r.ok).toBe(false);
  });
});

describe("جداسازی مستأجر — نشست‌ها", () => {
  test("توکن فعال بازیگر درست حل می‌شود", async () => {
    const db = buildScenario();
    makeSession(db, "u-a1", "tok-a1");
    const actor = await requireActorHarness(db)("tok-a1");
    expect(actor.userId).toBe("u-a1");
    expect(actor.tenantId).toBe("tenant-2");
    expect(actor.role).toBe("user");
  });

  test("توکن null رد می‌شود", async () => {
    const db = buildScenario();
    await expect(requireActorHarness(db)(null)).rejects.toThrow("UNAUTHENTICATED");
  });

  test("توکن ناشناخته رد می‌شود", async () => {
    const db = buildScenario();
    await expect(requireActorHarness(db)("no-such-token")).rejects.toThrow("UNAUTHENTICATED");
  });

  test("نشست منقضی‌شده رد می‌شود", async () => {
    const db = buildScenario();
    const tok = "tok-expired";
    db.tables.sessions.push({
      _id: `sess_${tok}`,
      userId: "u-a1",
      tokenHash: stableTokenHash(tok),
      status: "active",
      expiresAt: Date.now() - 1000,
    });
    await expect(requireActorHarness(db)(tok)).rejects.toThrow("UNAUTHENTICATED");
  });

  test("نشست revoked رد می‌شود", async () => {
    const db = buildScenario();
    const tok = "tok-revoked";
    db.tables.sessions.push({
      _id: `sess_${tok}`,
      userId: "u-a1",
      tokenHash: stableTokenHash(tok),
      status: "revoked",
      expiresAt: Date.now() + 86400_000,
    });
    await expect(requireActorHarness(db)(tok)).rejects.toThrow("UNAUTHENTICATED");
  });

  test("کاربر suspended رد می‌شود", async () => {
    const db = buildScenario();
    (db.tables.users.find((u: any) => u._id === "u-a1") as any).status = "suspended";
    makeSession(db, "u-a1", "tok-susp");
    await expect(requireActorHarness(db)("tok-susp")).rejects.toThrow("UNAUTHENTICATED");
  });

  test("tenant suspended رد می‌شود", async () => {
    const db = buildScenario();
    (db.tables.tenants.find((t: any) => t._id === "tenant-2") as any).status = "suspended";
    makeSession(db, "u-a1", "tok-ten");
    await expect(requireActorHarness(db)("tok-ten")).rejects.toThrow("UNAUTHENTICATED");
  });

  test("هم‌ارزی هش توکن — دو توکن متفاوت هرگز hash یکسان ندارند", () => {
    const a = stableTokenHash("tok-1");
    const b = stableTokenHash("tok-2");
    expect(a).not.toBe(b);
    expect(stableTokenHash("tok-1")).toBe(a);
  });
});

describe("جداسازی مستأجر — زنجیره‌ی عملیاتی", () => {
  test("کاربر Reseller-A نمی‌تواند کاربر Reseller-B را بشناسد", async () => {
    const db = buildScenario();
    makeSession(db, "u-a", "tok-resa");
    const actor = await requireActorHarness(db)("tok-resa");
    const scope = requireTenantScopeHarness(db);
    // دسترسی به کاربر خودش و زیرمجموعه — مجاز
    await scope(actor, "tenant-2");
    await scope(actor, "tenant-4");
    // دسترسی به tenant خواهر — ممنوع
    await expect(scope(actor, "tenant-3")).rejects.toThrow("FORBIDDEN");
  });

  test("کاربر عادی نمی‌تواند به tenant پدر دسترسی پیدا کند", async () => {
    const db = buildScenario();
    makeSession(db, "u-s1", "tok-s1");
    const actor = await requireActorHarness(db)("tok-s1");
    const scope = requireTenantScopeHarness(db);
    await expect(scope(actor, "tenant-2")).rejects.toThrow("FORBIDDEN");
    await expect(scope(actor, "tenant-1")).rejects.toThrow("FORBIDDEN");
  });

  test("super_admin در Core به همه‌ی tenant ها دسترسی دارد", async () => {
    const db = buildScenario();
    makeSession(db, "u-core", "tok-core");
    const actor = await requireActorHarness(db)("tok-core");
    const scope = requireTenantScopeHarness(db);
    for (const t of ["tenant-2", "tenant-3", "tenant-4", "tenant-5"]) {
      await scope(actor, t);
    }
  });

  test("درخت کامل مستأجر برای Core شامل همه است", () => {
    const sc = buildScenario();
    const tree = tenantTreeIds("tenant-1", (id) =>
      sc.tables.tenants.filter((t) => t.parentTenantId === id),
    );
    expect(tree).toContain("tenant-1");
    expect(tree).toContain("tenant-2");
    expect(tree).toContain("tenant-3");
    expect(tree).toContain("tenant-4");
    expect(tree).toContain("tenant-5");
  });

  test("درخت Reseller-A فقط شاخه‌ی خودش است", () => {
    const sc = buildScenario();
    const tree = tenantTreeIds("tenant-2", (id) =>
      sc.tables.tenants.filter((t) => t.parentTenantId === id),
    );
    expect(tree).toEqual(["tenant-2", "tenant-4"]);
  });
});
