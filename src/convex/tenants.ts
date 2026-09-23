/** GuardAsli — Bootstrap سیستم و کنترل تنظیمات سراسری (فقط Super Admin). */
import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireActor, requirePermission } from "./auth";
import { GUARDASLI } from "../core/identity";

const DEFAULT_FEATURES = [
  "DedicatedApp", "TelegramBot", "TelegramMiniApp", "WebApp", "CustomDomain",
  "SSL", "WhiteLabel", "API", "OwnServer", "SubReseller", "CustomBranding",
  "CustomPurchase", "AdvancedReports", "Referral", "Notifications", "QR",
  "ConfigImport", "MultiDevice",
];

/** کلیدهایی که هرگز نباید از طریق API عمومی بازنویسی شوند — هویت Core ثابت است. */
const PROTECTED_SETTINGS_KEYS = new Set(["identity"]);

/** کلیدهای مجاز تنظیمات سراسری — هر کلید دیگر رد می‌شود (allowlist). */
const ALLOWED_SETTINGS_KEYS = new Set([
  "identity", "main_domain", "cors_origins", "custom_purchase_config",
  "acme_email", "backup_schedule", "maintenance_mode",
]);

// ————— System Settings (فقط Super Admin) —————

export const systemSettingsGet = query({
  args: { token: v.string(), key: v.string() },
  handler: async (ctx, args) => {
    await requireActor(ctx, args.token);
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
    if (actor.role !== "super_admin") {
      throw new Error("FORBIDDEN: تنظیمات سراسری فقط توسط Super Admin قابل تغییر است");
    }
    if (!ALLOWED_SETTINGS_KEYS.has(args.key)) {
      throw new Error("VALIDATION_ERROR: کلید تنظیمات مجاز نیست");
    }
    if (PROTECTED_SETTINGS_KEYS.has(args.key)) {
      // هویت مرکزی GuardAsli/AsliCode غیرقابل تغییر است (اصل هویت مرکزی)
      throw new Error("FORBIDDEN: هویت مرکزی پلتفرم غیرقابل تغییر است");
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
    await ctx.runMutation(internal.audit.log, {
      actorUserId: actor.userId,
      action: "system_settings.set",
      entityType: "systemSettings",
      entityId: args.key,
    });
    return { ok: true };
  },
});

// ————— Feature Flags (فقط Super Admin) —————

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
    requirePermission(actor, "ManageFeatures");
    if (actor.role !== "super_admin") {
      throw new Error("FORBIDDEN: feature flags سراسری فقط توسط Super Admin قابل تغییر است");
    }
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
    await ctx.runMutation(internal.audit.log, {
      actorUserId: actor.userId,
      action: "feature_flags.set",
      entityType: "featureFlags",
      entityId: args.key,
      metadata: { patch },
    });
    return { ok: true };
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
      name: GUARDASLI.product,
      status: "active",
      config: { core: true },
    });
    await ctx.db.insert("branding", {
      tenantId,
      displayName: GUARDASLI.product,
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
    // هویت مرکزی — ثبت در settings؛ این رکورد از طریق API قابل تغییر نیست
    await ctx.db.insert("systemSettings", {
      key: "identity",
      value: {
        product: GUARDASLI.product,
        developer: GUARDASLI.developer,
        version: GUARDASLI.initialVersion,
      },
    });
    return { tenantId, created: true };
  },
});
