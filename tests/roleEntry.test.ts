/**
 * GuardAsli — تست‌های پورت ورود نقش‌ها و اعمال نقش سمت سرور.
 *
 * هر نقش صفحه‌ی ورود اختصاصی دارد: 616 سوپر ادمین، 105 نماینده،
 * و بدون پورت برای کاربر عادی. محدودیت باید هم سمت کلاینت (نگاشت پورت)
 * و هم سمت سرور (expectRole در loginAction) اعمال شود.
 */
import { describe, expect, test } from "bun:test";
import {
  entryContext,
  roleAllowed,
  roleMismatchMessage,
  roleEntryUrl,
  RESELLER_PORT,
  SUPER_ADMIN_PORT,
} from "../src/web/entryPorts";

describe("role entry ports", () => {
  test("the documented ports are the defaults", () => {
    expect(SUPER_ADMIN_PORT).toBe(616);
    expect(RESELLER_PORT).toBe(105);
  });

  test("port 616 is the super-admin entry", () => {
    const e = entryContext("616");
    expect(e.role).toBe("super_admin");
    expect(e.scoped).toBe(true);
    expect(e.label).toBe("سوپر ادمین");
  });

  test("port 105 is the reseller entry", () => {
    const e = entryContext("105");
    expect(e.role).toBe("reseller");
    expect(e.scoped).toBe(true);
    expect(e.label).toBe("نماینده");
  });

  test("no port is the open entry for normal users", () => {
    for (const port of ["", "4173", "8080"]) {
      const e = entryContext(port);
      expect(e.role).toBeNull();
      expect(e.scoped).toBe(false);
      expect(e.label).toBe("کاربر");
    }
  });

  test("an unknown port does not unlock a role", () => {
    expect(entryContext("9999").role).toBeNull();
  });
});

describe("role entry permissions", () => {
  const superPage = entryContext("616");
  const resellerPage = entryContext("105");
  const userPage = entryContext("");

  test("the super-admin page accepts only super admins", () => {
    expect(roleAllowed(superPage, "super_admin")).toBe(true);
    expect(roleAllowed(superPage, "admin")).toBe(false);
    expect(roleAllowed(superPage, "reseller")).toBe(false);
    expect(roleAllowed(superPage, "user")).toBe(false);
  });

  test("the reseller page accepts resellers and the chain above them", () => {
    expect(roleAllowed(resellerPage, "reseller")).toBe(true);
    expect(roleAllowed(resellerPage, "admin")).toBe(true);
    expect(roleAllowed(resellerPage, "super_admin")).toBe(true);
    expect(roleAllowed(resellerPage, "user")).toBe(false);
  });

  test("the open page accepts every role", () => {
    for (const role of ["user", "reseller", "admin", "super_admin"]) {
      expect(roleAllowed(userPage, role)).toBe(true);
    }
  });

  test("the mismatch message names both the page and the account role", () => {
    const msg = roleMismatchMessage(superPage, "user");
    expect(msg).toContain("سوپر ادمین");
    expect(msg).toContain("کاربر عادی");
  });

  test("entry URLs carry the right port", () => {
    expect(roleEntryUrl("super_admin", "https://x.test")).toBe("https://x.test:616");
    expect(roleEntryUrl("reseller", "https://x.test")).toBe("https://x.test:105");
  });
});

describe("server-side role enforcement", () => {
  test("loginAction rejects a role that does not fit the entry", async () => {
    const { call } = await import("./tenantIsolation");
    const { makeWebhookHarness, seedAdmin } = await import("./telegramWebhookHarness");
    const authActions = await import("../src/convex/authActions");
    const { stableTokenHash } = await import("../src/core/sessionToken");

    const h = makeWebhookHarness();
    try {
      const { token, tenantId, userId } = seedAdmin(h.ctx, h.db);
      const t = h.db.tables as Record<string, any[]>;
      // A plain user in the same tenant.
      t.users.push({
        _id: "u-plain",
        username: "plainuser",
        role: "user",
        tenantId,
        status: "active",
        passwordHash: "x",
        failedLogins: 0,
      });
      t.sessions.push({
        _id: "sess-plain",
        userId: "u-plain",
        tokenHash: stableTokenHash("tok-plain"),
        refreshTokenHash: stableTokenHash("tok-plain-r"),
        status: "active",
        expiresAt: Date.now() + 86400_000,
      });
      void token;
      void userId;

      // A reseller tries the SUPER-ADMIN page → refused.
      // (the reverse is allowed by design: admins may use the reseller page)
      const { scryptHashSync } = await import("../src/core/password");
      const { hash } = scryptHashSync("SuperSecret123");
      const admin = t.users.find((u) => u._id === "u-1")!;
      admin.passwordHash = hash;
      const plain = t.users.find((u) => u._id === "u-plain")!;
      plain.passwordHash = hash;
      // the harness indexes rows lazily — touch the db so later patches resolve
      await h.db.db.get("u-1");

      let err = "";
      try {
        await call(h.ctx, authActions.loginAction, {
          username: "admin",
          password: "SuperSecret123",
          expectRole: "user",
        });
      } catch (e) {
        err = String((e as Error).message);
      }
      // "user" is not a scoped entry at all — the server never accepts it.
      expect(err).toContain("FORBIDDEN");

      // A normal user on the reseller page → refused.
      let err2 = "";
      try {
        await call(h.ctx, authActions.loginAction, {
          username: "plainuser",
          password: "SuperSecret123",
          expectRole: "reseller",
        });
      } catch (e) {
        err2 = String((e as Error).message);
      }
      expect(err2).toContain("FORBIDDEN");

      // A normal user on the super-admin page → refused.
      let err3 = "";
      try {
        await call(h.ctx, authActions.loginAction, {
          username: "plainuser",
          password: "SuperSecret123",
          expectRole: "super_admin",
        });
      } catch (e) {
        err3 = String((e as Error).message);
      }
      expect(err3).toContain("FORBIDDEN");

      // The correct page works.
      const okRes = await call(h.ctx, authActions.loginAction, {
        username: "admin",
        password: "SuperSecret123",
        expectRole: "super_admin",
      });
      expect(okRes.role).toBe("super_admin");

      // An admin may also use the reseller page (the chain above it).
      const resChain = await call(h.ctx, authActions.loginAction, {
        username: "admin",
        password: "SuperSecret123",
        expectRole: "reseller",
      });
      expect(resChain.role).toBe("super_admin");

      // And the open page accepts the same admin.
      const openRes = await call(h.ctx, authActions.loginAction, {
        username: "plainuser",
        password: "SuperSecret123",
      });
      expect(openRes.role).toBe("user");
    } finally {
      h.cleanup();
    }
  }, 20_000);
});
