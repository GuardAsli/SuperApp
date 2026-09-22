/** GuardAsli — سیستم Feature: زنجیره دسترسی اجباری شش‌حلقه‌ای (بند ۹). */

export const FEATURE_KEYS = [
  "DedicatedApp",
  "TelegramBot",
  "TelegramMiniApp",
  "WebApp",
  "CustomDomain",
  "SSL",
  "WhiteLabel",
  "API",
  "OwnServer",
  "SubReseller",
  "CustomBranding",
  "CustomPurchase",
  "AdvancedReports",
  "Referral",
  "Notifications",
  "QR",
  "ConfigImport",
  "MultiDevice",
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];

export interface FeatureAccessInput {
  globalEnabled: boolean;
  planEnabled: boolean;
  rolePermissions: readonly string[];
  roleRequired: string;
  tenantActive: boolean;
  ownershipOk: boolean;
  quotaOk: boolean;
}

/**
 * زنجیره نهایی بررسی دسترسی — هیچ flag فرانت‌اندی نمی‌تواند از آن عبور کند.
 * Global Feature AND Plan Capability AND Role Permission AND Tenant Scope
 * AND Resource Ownership AND Quota
 */
export function evaluateFeatureAccess(input: FeatureAccessInput): boolean {
  return (
    input.globalEnabled === true &&
    input.planEnabled === true &&
    input.rolePermissions.includes(input.roleRequired) === true &&
    input.tenantActive === true &&
    input.ownershipOk === true &&
    input.quotaOk === true
  );
}

/** وضعیت یک Feature در مدل داده. */
export interface FeatureRecord {
  key: FeatureKey;
  globallyEnabled: boolean;
  canPurchaseSeparately: boolean;
  canResell: boolean;
  internalCost: number;
  defaultPrice: number;
  minimumPrice: number;
  maximumPrice: number | null;
  resellerPrice: number | null;
}

/** قیمت نهایی با احترام به کف و سقف مجاز. */
export function clampPrice(price: number, minimumPrice: number, maximumPrice: number | null): number {
  let p = Math.max(price, minimumPrice);
  if (maximumPrice !== null) p = Math.min(p, maximumPrice);
  return p;
}
