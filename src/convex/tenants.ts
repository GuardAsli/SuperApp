/** GuardAsli — Bootstrap سیستم و مالکیت Super Admin. */
import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { DEFAULT_ROLE_PERMISSIONS } from "../core/rbac";
import { requireActor, requireSuperAdmin } from "./auth";

const DEFAULT_FEATURES = [
  "DedicatedApp", "TelegramBot", "TelegramMiniApp", "WebApp", "CustomDomain",
  "SSL", "WhiteLabel", "API", "OwnServer", "SubReseller", "CustomBranding",
  "CustomPurchase", "AdvancedReports", "Referral", "Notifications", "QR",
  "ConfigImport", "MultiDevice",
];

export const systemSettingsGet = query({
  args: { token: v.string(), key: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx, args.token);
    // تنظیمات عمومی فقط برای نقش‌های مدیریتی
    if (!["super_admin", "admin"].includes(actor.role)) {
      throw new Error("FORBIDDEN: دسترسی تنظیمات سیستم مجاز نیست");
    }
    const doc = await ctx.db
      .query("systemSettings")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique();
    return doc?.value ?? null;
  },
});

export const systemSettingsSet = mutation({
  args: { token: v.string(), key: v.string(), value: v.any() },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx, args.token);
    requireSuperAdmin(actor);
    // جلوگیری از تغییر هویت Core از طریق settings
    if (args.key === "identity") {
      throw new Error("FORBIDDEN: هویت Core قابل تغییر نیست");
    }
    const doc = await ctx.db
      .query("systemSettings")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique();
    if (doc) {
      await ctx.db.patch(doc._id, { value: args.value });
    } else {
      await ctx.db.insert("systemSettings", { key: args.key, value: args.value });
    }
  },
});

export const featureFlagsSet = mutation({
  args: {
    token: v.string(),
    key: v.string(),
    globallyEnabled: v.optional(v.boolean()),
    canPurchaseSeparately: v.optional(v.boolean()),
    canResell: v.optional(v.boolean()),
    internalCost: v.optional(v.number()),
    defaultPrice: v.optional(v.number()),
    minimumPrice: v.optional(v.number()),
    maximumPrice: v.optional(v.number()),
    resellerPrice: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx, args.token);
    requireSuperAdmin(actor);
    const doc = await ctx.db
      .query("featureFlags")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique();
    const patch: Record<string, unknown> = {};
    for (const k of [
      "globallyEnabled", "canPurchaseSeparately", "canResell", "internalCost",
      "defaultPrice", "minimumPrice", "maximumPrice", "resellerPrice",
    ] as const) {
      if (args[k] !== undefined) patch[k] = args[k];
    }
    if (doc) {
      await ctx.db.patch(doc._id, patch);
    } else {
      await ctx.db.insert("featureFlags", {
        key: args.key,
        globallyEnabled: args.globallyEnabled ?? false,
        canPurchaseSeparately: args.canPurchaseSeparately ?? false,
        canResell: args.canResell ?? false,
        internalCost: args.internalCost ?? 0,
        defaultPrice: args.defaultPrice ?? 0,
        minimumPrice: args.minimumPrice ?? 0,
        ...(args.maximumPrice !== undefined ? { maximumPrice: args.maximumPrice } : {}),
        ...(args.resellerPrice !== undefined ? { resellerPrice: args.resellerPrice } : {}),
      });
    }
  },
});

export const featureFlagsList = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    await requireActor(ctx, args.token);
    return await ctx.db.query("featureFlags").collect();
  },
});

/** ایجاد tenant سیستم و اولین Super Admin — یک‌بار و idempotent. */
export const bootstrapSystem = internalMutation({
  args: {
    username: v.string(),
    passwordHash: v.string(),
    passwordSalt: v.string(),
  },
  handler: async (ctx, args) => {
    const existingTenant = await ctx.db
      .query("tenants")
      .withIndex("by_parent", (q) => q.eq("parentTenantId", undefined))
      .first();
    if (existingTenant) {
      return { tenantId: existingTenant._id, created: false };
    }
    const tenantId = await ctx.db.insert("tenants", {
      name: "GuardAsli",
      status: "active",
      config: { core: true },
    });
    await ctx.db.insert("branding", {
      tenantId,
      displayName: "GuardAsli",
      primaryColor: "#14b8a6",
      secondaryColor: "#0ea5e9",
      accentColor: "#f59e0b",
      backgroundColor: "#0b1220",
      theme: "dark",
      whiteLabel: false,
    });
    await ctx.db.insert("users", {
      username: args.username,
      passwordHash: args.passwordHash,
      passwordSalt: args.passwordSalt,
      role: "super_admin",
      tenantId,
      status: "active",
      failedLogins: 0,
    });
    for (const f of DEFAULT_FEATURES) {
      await ctx.db.insert("featureFlags", {
        key: f,
        globallyEnabled: false,
        canPurchaseSeparately: false,
        canResell: false,
        internalCost: 0,
        defaultPrice: 0,
        minimumPrice: 0,
      });
    }
    for (const pm of ["admin_manual", "card_to_card", "cubepay", "tetraminator"]) {
      await ctx.db.insert("paymentMethods", { key: pm, globallyEnabled: false });
    }
    await ctx.db.insert("systemSettings", {
      key: "identity",
      value: { product: "GuardAsli", developer: "AsliCode", version: "is0.0.1" },
    });
    return { tenantId, created: true };
  },
});
