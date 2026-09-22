/** GuardAsli — قیمت‌گذاری سروری: قیمت فرانت‌اند هرگز مورد اعتماد نیست (بند ۱۰). */

export type PlanKind = "volume" | "user";

export interface PlanSpec {
  kind: PlanKind;
  price: number; // toman, integer
  trafficGb: number | null; // null = unlimited
  users: number | null; // null = unlimited
  durationDays: number | null; // null = no duration requirement (volume)
  servers: number | null;
  subResellers: number | null;
  apps: number | null;
  builds: number | null;
  devices: number | null;
  apiKeys: number | null;
  features: readonly string[];
  permissions: readonly string[];
}

export interface FeaturePriceRule {
  key: string;
  price: number;
}

export interface CustomPurchaseConfig {
  minTrafficGb: number;
  maxTrafficGb: number;
  minUsers: number;
  maxUsers: number;
  minDurationDays: number;
  maxDurationDays: number;
  allowedFeatures: readonly string[];
  featurePrices: readonly FeaturePriceRule[];
}

export interface CustomPurchaseRequest {
  trafficGb: number;
  users: number;
  durationDays: number;
  featureKeys: readonly string[];
  perUserCost: number;
  optionalCosts: number;
}

export interface PriceBreakdown {
  basePrice: number;
  trafficPrice: number;
  featurePrices: number;
  userCost: number;
  optionalCosts: number;
  total: number;
}

export function quoteCustomPurchase(
  cfg: CustomPurchaseConfig,
  req: CustomPurchaseRequest,
  basePricePerMonth: number,
): PriceBreakdown {
  if (req.trafficGb < cfg.minTrafficGb || req.trafficGb > cfg.maxTrafficGb) {
    throw new Error("ترافیک خارج از محدوده مجاز است");
  }
  if (req.users < cfg.minUsers || req.users > cfg.maxUsers) {
    throw new Error("تعداد کاربر خارج از محدوده مجاز است");
  }
  if (req.durationDays < cfg.minDurationDays || req.durationDays > cfg.maxDurationDays) {
    throw new Error("مدت خارج از محدوده مجاز است");
  }
  const months = Math.max(1, Math.ceil(req.durationDays / 30));
  const basePrice = basePricePerMonth * months;
  const trafficPrice = Math.ceil(req.trafficGb * (basePricePerMonth / 100));
  let featurePrices = 0;
  for (const fk of req.featureKeys) {
    if (!cfg.allowedFeatures.includes(fk)) {
      throw new Error(`ویژگی مجاز نیست: ${fk}`);
    }
    const rule = cfg.featurePrices.find((f) => f.key === fk);
    featurePrices += rule ? rule.price : 0;
  }
  const userCost = req.users * req.perUserCost;
  const optionalCosts = Math.max(0, req.optionalCosts);
  const total = basePrice + trafficPrice + featurePrices + userCost + optionalCosts;
  return {
    basePrice,
    trafficPrice,
    featurePrices,
    userCost,
    optionalCosts,
    total,
  };
}

/** محاسبه قیمت رند Plan با اعمال تخفیف/سربار reseller بدون عبور از سقف feature. */
export function effectivePlanPrice(plan: PlanSpec, resellerMarkupPct = 0): number {
  const pct = Math.max(0, Math.min(100, resellerMarkupPct));
  return Math.ceil(plan.price * (1 + pct / 100));
}

export function planIsUnlimitedUsers(plan: PlanSpec): boolean {
  return plan.kind === "user" && (plan.users === null || plan.users === undefined);
}
