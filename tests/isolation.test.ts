/** GuardAsli — تست‌های RBAC و جداسازی مفهومی tenant. */
import { describe, expect, test } from "bun:test";
import { canManageActor, hasPermission, ROLES } from "../src/core/rbac";
import { evaluateFeatureAccess } from "../src/core/features";
import { canTransition, isTerminalPaid } from "../src/core/payments/states";
import { GUARDASLI, COMPONENT_VERSIONS, COMPONENTS } from "../src/core/identity";

describe("RBAC hierarchy", () => {
  test("reseller cannot manage admin", () => {
    expect(canManageActor("reseller", "admin")).toBe(false);
  });
  test("user has no ManagePayments", () => {
    expect(hasPermission("user", "ManagePayments")).toBe(false);
  });
  test("all roles exist", () => {
    expect(ROLES).toHaveLength(5);
  });
});

describe("Feature chain", () => {
  test("quota failure blocks", () => {
    expect(
      evaluateFeatureAccess({
        globalEnabled: true,
        planEnabled: true,
        rolePermissions: ["Purchase"],
        roleRequired: "Purchase",
        tenantActive: true,
        ownershipOk: true,
        quotaOk: false,
      }),
    ).toBe(false);
  });
});

describe("Payment terminal states", () => {
  test("cannot re-approve paid", () => {
    expect(canTransition("paid", "paid")).toBe(false);
    expect(isTerminalPaid("paid")).toBe(true);
  });
});

describe("Identity immutable", () => {
  test("product and developer fixed", () => {
    expect(GUARDASLI.product).toBe("GuardAsli");
    expect(GUARDASLI.developer).toBe("AsliCode");
  });
  test("independent component versions", () => {
    for (const c of COMPONENTS) {
      expect(COMPONENT_VERSIONS[c]).toMatch(/^is\d+\.\d+\.\d+$/);
    }
  });
});
