/** GuardAsli — RBAC مرکزی. مجوزها فقط در backend اعمال می‌شوند؛ UI صرفاً بازتابی از آن است. */
import { compareVersions, isValidVersion } from "./version";

export type Role = "super_admin" | "admin" | "reseller" | "sub_reseller" | "user";

export const ROLE_RANK: Record<Role, number> = {
  super_admin: 50,
  admin: 40,
  reseller: 30,
  sub_reseller: 25,
  user: 10,
};

export const ROLES: readonly Role[] = [
  "super_admin",
  "admin",
  "reseller",
  "sub_reseller",
  "user",
];

/** مجوزهای granular الزام‌شده در بند ۵. */
export const PERMISSIONS = [
  "View",
  "Create",
  "Update",
  "Delete",
  "Manage",
  "Purchase",
  "Resell",
  "Configure",
  "Build",
  "Release",
  "Refund",
  "ManageUsers",
  "ManageServers",
  "ManagePlans",
  "ManageFeatures",
  "ManageWallet",
  "ManagePayments",
  "ManageApps",
  "ManageBots",
  "ManageDomains",
  "ManageBranding",
  "ManageTheme",
  "ManageTelegramBot",
  "ManageAssets",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export type RolePermissions = Record<Role, readonly Permission[]>;

const ALL = PERMISSIONS as unknown as Permission[];

export const DEFAULT_ROLE_PERMISSIONS: RolePermissions = {
  super_admin: ALL,
  admin: [
    "View", "Create", "Update", "Delete", "Manage", "Purchase", "Configure",
    "ManageUsers", "ManageServers", "ManagePlans", "ManageFeatures",
    "ManageWallet", "ManagePayments", "ManageApps", "ManageBots",
    "ManageDomains", "ManageBranding", "ManageTheme", "ManageTelegramBot", "ManageAssets",
  ],
  reseller: [
    "View", "Create", "Update", "Purchase", "Resell", "Configure",
    "ManageUsers", "ManageServers", "ManagePlans", "ManageFeatures",
    "ManageWallet", "ManagePayments", "ManageApps", "ManageBots",
    "ManageBranding", "ManageTheme", "ManageTelegramBot", "ManageAssets",
  ],
  sub_reseller: [
    "View", "Create", "Update", "Purchase", "Resell", "Configure", "ManageUsers",
  ],
  user: ["View", "Purchase"],
};

export function hasPermission(role: Role, permission: Permission, extra?: readonly Permission[]): boolean {
  const set = extra ?? DEFAULT_ROLE_PERMISSIONS[role];
  return set.includes(permission);
}

/** سلسله‌مراتب مالکیت: parent باید بالاتر از child باشد (sub_reseller و reseller هم‌تراز رتبه‌اند اما زیرمجموعه‌ی مالکیت جدا هستند). */
export function canManageActor(managerRole: Role, targetRole: Role): boolean {
  if (managerRole === "super_admin") return true;
  if (managerRole === "admin") return targetRole !== "super_admin";
  if (managerRole === "reseller") {
    return targetRole === "sub_reseller" || targetRole === "user";
  }
  if (managerRole === "sub_reseller") return targetRole === "user";
  return false;
}

/** اعتبارسنجی ورودی‌های عددی مشترک. */
export function requirePositiveInt(value: unknown, name: string): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`${name} باید عدد صحیح مثبت باشد`);
  }
  return n;
}

/** اعتبارسنجی نقش — نقش باید یکی از نقش‌های معتبر سیستم باشد. */
export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

/**
 * اعتبارسنجی مجوزها — از تزریق مجوزهای ساختگی در ثبت‌نام جلوگیری می‌کند.
 * هر مجوز باید یکی از مجوزهای معتبر سیستم باشد.
 */
export function areValidPermissions(value: unknown): value is readonly Permission[] {
  if (!Array.isArray(value)) return false;
  return value.every((p) => (PERMISSIONS as readonly string[]).includes(p));
}


