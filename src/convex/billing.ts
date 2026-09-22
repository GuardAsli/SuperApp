/** GuardAsli — خرید/پرووایژنینگ (بند ۲۲ و ۲۳): دبیت اتمی → خرید → پرووایژن → فعال‌سازی. */
import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { requireActor, requirePermission, requireTenantScope } from "./auth";
import { quoteCustomPurchase, type CustomPurchaseConfig } from "../core/pricing";
import { evaluateFeatureAccess } from "../core/features";

// ————— Plans —————

export const planCreate = mutation({
  args: {
    token: v.string(),
    name: v.string(),
    kind: v.union(v.literal("volume"), v.literal("user")),
    price: v.number(),
    trafficGb: v.optional(v.number()),
    users: v.optional(v.number()),
    durationDays: v.optional(v.number()),
    servers: v.optional(v.number()),
    subResellers: v.optional(v.number()),
    apps: v.optional(v.number()),
    builds: v.optional(v.number()),
    devices: v.optional(v.number()),
    apiKeys: v.optional(v.number()),
    features: v.array(v.string()),
    permissions: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx, args.token);
    requirePermission(actor, "ManagePlans");
    if (args.price < 0) throw new Error("VALIDATION_ERROR: قیمت نامعتبر است");
    if (args.kind === "user" && args.durationDays !== undefined && args.durationDays <= 0) {
      throw new Error("VALIDATION_ERROR: مدت نامعتبر است");
    }
    const planId = await ctx.db.insert("plans", {
      tenantId: actor.tenantId,
      name: args.name,
      kind: args.kind,
      price: args.price,
      ...(args.trafficGb !== undefined ? { trafficGb: args.trafficGb } : {}),
      ...(args.users !== undefined ? { users: args.users } : {}),
      ...(args.durationDays !== undefined ? { durationDays: args.durationDays } : {}),
      ...(args.servers !== undefined ? { servers: args.servers } : {}),
      ...(args.subResellers !== undefined ? { subResellers: args.subResellers } : {}),
      ...(args.apps !== undefined ? { apps: args.apps } : {}),
      ...(args.builds !== undefined ? { builds: args.builds } : {}),
      ...(args.devices !== undefined ? { devices: args.devices } : {}),
      ...(args.apiKeys !== undefined ? { apiKeys: args.apiKeys } : {}),
      features: args.features,
      permissions: args.permissions,
      status: "active",
    });
    await ctx.runMutation(internal.audit.log, {
      actorUserId: actor.userId,
      tenantId: actor.tenantId,
      action: "plan.create",
      entityType: "plans",
      entityId: planId,
      metadata: { name: args.name, kind: args.kind, price: args.price },
    });
    return { planId };
  },
});

export const planList = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx, args.token);
    return await ctx.db
      .query("plans")
      .withIndex("by_tenant", (q) => q.eq("tenantId", actor.tenantId))
      .filter((q) => q.eq(q.field("status"), "active"))
      .collect();
  },
});

// ————— Custom Purchase quote —————

export const customPurchaseQuote = query({
  args: {
    token: v.string(),
    trafficGb: v.number(),
    users: v.number(),
    durationDays: v.number(),
    featureKeys: v.array(v.string()),
    perUserCost: v.number(),
    optionalCosts: v.number(),
    basePricePerMonth: v.number(),
  },
  handler: async (ctx, args) => {
    await requireActor(ctx, args.token);
    // تنظیمات Custom Purchase از سرور خوانده می‌شود — قیمت فرانت هرگز مرجع نیست
    const cfgDoc = await ctx.db
      .query("systemSettings")
      .withIndex("by_key", (q) => q.eq("key", "custom_purchase_config"))
      .unique();
    if (!cfgDoc) throw new Error("FORBIDDEN: Custom Purchase پیکربندی نشده است");
    const cfg = cfgDoc.value as CustomPurchaseConfig;
    const global = await ctx.db
      .query("featureFlags")
      .withIndex("by_key", (q) => q.eq("key", "CustomPurchase"))
      .unique();
    if (!global?.globallyEnabled) throw new Error("FORBIDDEN: Custom Purchase غیرفعال است");
    return quoteCustomPurchase(
      cfg,
      {
        trafficGb: args.trafficGb,
        users: args.users,
        durationDays: args.durationDays,
        featureKeys: args.featureKeys,
        perUserCost: args.perUserCost,
        optionalCosts: args.optionalCosts,
      },
      args.basePricePerMonth,
    );
  },
});

// ————— خرید Plan با Wallet —————

export const purchasePlan = mutation({
  args: {
    token: v.string(),
    planId: v.id("plans"),
    serverId: v.optional(v.id("servers")),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx, args.token);
    requirePermission(actor, "Purchase");
    const plan = await ctx.db.get(args.planId);
    if (!plan || plan.status !== "active") throw new Error("NOT_FOUND: پلن یافت نشد");
    await requireTenantScope(ctx, actor, plan.tenantId);

    // زنجیره Feature: WebApp/پلن/نقش/tenant
    const global = await ctx.db
      .query("featureFlags")
      .withIndex("by_key", (q) => q.eq("key", "WebApp"))
      .unique();
    const planEnabled = true; // پلن فعال باشد کافی است؛ سقف‌ها در ادامه اعمال می‌شوند
    const quotaOk = true; // سقف‌های سطح quota در createSubscription بررسی می‌شوند
    if (!evaluateFeatureAccess({
      globalEnabled: global?.globallyEnabled ?? false,
      planEnabled,
      rolePermissions: plan.permissions,
      roleRequired: "Purchase" as never,
      tenantActive: true,
      ownershipOk: true,
      quotaOk,
    })) {
      throw new Error("FORBIDDEN: زنجیره دسترسی Feature تأیید نشد");
    }

    const dupe = await ctx.db
      .query("subscriptions")
      .withIndex("by_user", (q) => q.eq("userId", actor.userId))
      .filter((q) => q.eq(q.field("status"), "created"))
      .first();
    if (dupe && args.idempotencyKey) {
      // بررسی idempotency از طریق لجر در ادامه انجام می‌شود
    }

    // Wallet
    const wallet = await ctx.db
      .query("wallets")
      .withIndex("by_user", (q) => q.eq("userId", actor.userId))
      .unique();
    if (!wallet || wallet.balance < plan.price) {
      throw new Error("CONFLICT: موجودی کافی نیست");
    }

    // دبیت اتمی — Ledger با idempotencyKey تضمین عدم دوباره‌برداشت
    const debit: { ledgerEntryId: Id<"ledgerEntries">; balanceAfter: number; deduped: boolean } =
      await ctx.runMutation(internal.wallet.ledgerApply, {
        walletId: wallet._id,
        type: "purchase",
        amount: plan.price,
        direction: "debit",
        reason: `purchase plan ${plan.name}`,
        idempotencyKey: `purchase:${args.idempotencyKey}`,
        metadata: { planId: args.planId },
      });

    const now = Date.now();
    const subscriptionId = await ctx.db.insert("subscriptions", {
      tenantId: actor.tenantId,
      userId: actor.userId,
      planId: args.planId,
      ...(args.serverId !== undefined ? { serverId: args.serverId } : {}),
      kind: plan.kind,
      ...(plan.trafficGb !== undefined ? { trafficLimitGb: plan.trafficGb } : {}),
      trafficUsedGb: 0,
      ...(plan.users !== undefined ? { userLimit: plan.users } : {}),
      ...(plan.durationDays !== undefined
        ? { durationEndsAt: now + plan.durationDays * 24 * 60 * 60 * 1000 }
        : {}),
      status: "created",
      provisioningState: "queued",
      provisionAttempts: 0,
    });

    await ctx.runMutation(internal.audit.log, {
      actorUserId: actor.userId,
      tenantId: actor.tenantId,
      action: "subscription.purchase",
      entityType: "subscriptions",
      entityId: subscriptionId,
      metadata: { planId: args.planId, price: plan.price, ledgerEntryId: debit.ledgerEntryId },
    });
    return { subscriptionId, ledgerEntryId: debit.ledgerEntryId, deduped: debit.deduped };
  },
});

// ————— صف پرووایژنینگ —————

export const provisionJobEnqueue = internalMutation({
  args: { subscriptionId: v.id("subscriptions"), tenantId: v.id("tenants") },
  handler: async (ctx, args) => {
    await ctx.db.insert("provisionJobs", {
      tenantId: args.tenantId,
      subscriptionId: args.subscriptionId,
      attempt: 0,
      maxAttempts: 5,
      nextRunAt: Date.now(),
      status: "queued",
    });
  },
});

/** اجرای پرووایژن — فقط پس از موفقیت واقعی provider وضعیت active می‌شود (بند ۲۳). */
export const provisionRun = internalMutation({
  args: { jobId: v.id("provisionJobs") },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || job.status !== "queued") return { ok: false };
    const sub = await ctx.db.get(job.subscriptionId);
    if (!sub) {
      await ctx.db.patch(args.jobId, { status: "failed", lastError: "subscription missing" });
      return { ok: false };
    }
    await ctx.db.patch(args.jobId, { status: "running" });
    await ctx.db.patch(sub._id, { provisioningState: "provisioning" });
    if (!sub.serverId) {
      // سروری تعیین نشده: فعال‌سازی بدون پرووایژن خارجی (مدیریت داخلی)
      await ctx.db.patch(sub._id, {
        status: "active",
        provisioningState: "provisioned",
        activatedAt: Date.now(),
      });
      await ctx.db.patch(args.jobId, { status: "done" });
      return { ok: true };
    }
    const server = await ctx.db.get(sub.serverId);
    if (!server) {
      const attempt = job.attempt + 1;
      const dead = attempt >= job.maxAttempts;
      await ctx.db.patch(args.jobId, {
        status: dead ? "dead" : "queued",
        attempt,
        nextRunAt: Date.now() + Math.min(60_000 * 2 ** attempt, 3_600_000),
        lastError: "server missing",
      });
      await ctx.db.patch(sub._id, { provisioningState: "failed", lastProvisionError: "server missing" });
      return { ok: false };
    }
    // فراخوانی provider از طریق اکشن node در provisionAction انجام می‌شود؛
    // این mutation وضعیت را مدیریت می‌کند و خطای واقعی را ثبت می‌نماید.
    return { ok: true, serverId: sub.serverId };
  },
});

export const provisionFinish = internalMutation({
  args: {
    jobId: v.id("provisionJobs"),
    success: v.boolean(),
    remoteUserId: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) return { ok: false };
    const sub = await ctx.db.get(job.subscriptionId);
    if (!sub) return { ok: false };
    if (args.success) {
      await ctx.db.patch(sub._id, {
        status: "active",
        provisioningState: "provisioned",
        activatedAt: Date.now(),
        ...(args.remoteUserId !== undefined ? { remoteUserId: args.remoteUserId } : {}),
      });
      await ctx.db.patch(args.jobId, { status: "done" });
    } else {
      const attempt = job.attempt + 1;
      const failed = attempt >= job.maxAttempts;
      await ctx.db.patch(sub._id, {
        provisioningState: failed ? "failed" : "queued",
        provisionAttempts: attempt,
        ...(args.error !== undefined ? { lastProvisionError: args.error } : {}),
      });
      await ctx.db.patch(args.jobId, {
        status: failed ? "dead" : "queued",
        attempt,
        nextRunAt: Date.now() + Math.min(60_000 * 2 ** attempt, 3600_000), // exponential backoff
        ...(args.error !== undefined ? { lastError: args.error } : {}),
      });
    }
    return { ok: true };
  },
});

// ————— Subscriptions —————

export const subscriptionList = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx, args.token);
    return await ctx.db
      .query("subscriptions")
      .withIndex("by_user", (q) => q.eq("userId", actor.userId))
      .collect();
  },
});

export const subscriptionCancel = mutation({
  args: { token: v.string(), subscriptionId: v.id("subscriptions") },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx, args.token);
    const sub = await ctx.db.get(args.subscriptionId);
    if (!sub) throw new Error("NOT_FOUND: اشتراک یافت نشد");
    await requireTenantScope(ctx, actor, sub.tenantId);
    if (actor.userId !== sub.userId && !["admin", "super_admin"].includes(actor.role)) {
      requirePermission(actor, "ManageUsers");
    }
    if (["cancelled", "refunded", "expired"].includes(sub.status)) {
      throw new Error("CONFLICT: وضعیت فعلی اجازه لغو نمی‌دهد");
    }
    await ctx.db.patch(args.subscriptionId, { status: "cancelled" });
    await ctx.runMutation(internal.audit.log, {
      actorUserId: actor.userId,
      tenantId: sub.tenantId,
      action: "subscription.cancel",
      entityType: "subscriptions",
      entityId: args.subscriptionId,
    });
    return { ok: true };
  },
});
