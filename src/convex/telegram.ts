/** GuardAsli — Telegram Bot و Mini App (بند ۲۴ و ۲۵): webhook، محافظت token، auth امن. */
import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireActor, requirePermission, requireTenantScope } from "./auth";
import { generateSecureCredentialRuntime, randomToken } from "./runtime";

/** بازیابی پیکربندی bot برای اکشن node — هرگز به کلاینت باز نمی‌گردد. */
export const getBotConfigInternal = internalQuery({
  args: { botConfigId: v.id("botConfigs") },
  handler: async (ctx, args) => {
    const cfg = await ctx.db.get(args.botConfigId);
    if (!cfg) return null;
    return {
      _id: cfg._id,
      tenantId: cfg.tenantId,
      tokenEncrypted: cfg.tokenEncrypted,
      enabled: cfg.enabled,
      webhookSecret: cfg.webhookSecret,
      displayName: cfg.displayName,
      username: cfg.username ?? null,
    };
  },
});

/** اثبات masterSecret — تنها اکشن node آن را می‌داند. */
export const verifyMasterSecretProof = internalQuery({
  args: { masterSecret: v.string() },
  handler: async (_ctx, args) => {
    const expected = process.env.GUARDASLI_MASTER_SECRET ?? "";
    return { ok: expected.length > 0 && args.masterSecret === expected };
  },
});

// ————— Bot Config —————

/**
 * ثبت/به‌روزرسانی پیکربندی bot هر tenant.
 * token تلگرام باید قبلاً در اکشن node رمزنگاری شده باشد (botConfigSaveAction).
 * webhookSecret هم توسط همان اکشن تولید می‌شود؛ کلاینت حق فرستادن مقدار دلخواه را ندارد.
 */
export const botConfigSave = mutation({
  args: {
    token: v.string(),
    botTokenEncrypted: v.string(),
    displayName: v.string(),
    username: v.optional(v.string()),
    description: v.optional(v.string()),
    enabled: v.boolean(),
    webhookSecret: v.string(),
    proof: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx, args.token);
    requirePermission(actor, "ManageTelegramBot");
    const proof = await ctx.runQuery(internal.telegram.verifyMasterSecretProof, {
      masterSecret: args.proof,
    });
    if (!proof.ok) {
      throw new Error("FORBIDDEN: ثبت پیکربندی bot فقط از طریق اکشن سرور مجاز است");
    }
    const existing = await ctx.db
      .query("botConfigs")
      .withIndex("by_tenant", (q) => q.eq("tenantId", actor.tenantId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        tokenEncrypted: args.botTokenEncrypted,
        displayName: args.displayName,
        ...(args.username !== undefined ? { username: args.username } : {}),
        ...(args.description !== undefined ? { description: args.description } : {}),
        enabled: args.enabled,
        webhookSecret: args.webhookSecret,
      });
      await ctx.runMutation(internal.audit.log, {
        actorUserId: actor.userId,
        tenantId: actor.tenantId,
        action: "bot.config_update",
        entityType: "botConfigs",
        entityId: existing._id,
      });
      return { botConfigId: existing._id, webhookSecret: args.webhookSecret };
    }
    const id = await ctx.db.insert("botConfigs", {
      tenantId: actor.tenantId,
      tokenEncrypted: args.botTokenEncrypted,
      displayName: args.displayName,
      ...(args.username !== undefined ? { username: args.username } : {}),
      ...(args.description !== undefined ? { description: args.description } : {}),
      enabled: args.enabled,
      webhookSecret: args.webhookSecret,
    });
    await ctx.runMutation(internal.audit.log, {
      actorUserId: actor.userId,
      tenantId: actor.tenantId,
      action: "bot.config_create",
      entityType: "botConfigs",
      entityId: id,
    });
    return { botConfigId: id, webhookSecret: args.webhookSecret };
  },
});

export const botConfigGet = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx, args.token);
    const cfg = await ctx.db
      .query("botConfigs")
      .withIndex("by_tenant", (q) => q.eq("tenantId", actor.tenantId))
      .unique();
    if (!cfg) return null;
    // token رمزنگاری‌شده هرگز به کلاینت برنمی‌گردد
    return {
      botConfigId: cfg._id,
      displayName: cfg.displayName,
      username: cfg.username ?? null,
      description: cfg.description ?? null,
      enabled: cfg.enabled,
      hasToken: cfg.tokenEncrypted.length > 0,
    };
  },
});

/** اعتبارسنجی امضای webhook — مقایسه با webhookSecret هر tenant. */
export const verifyWebhookSecret = internalQuery({
  args: { botConfigId: v.id("botConfigs"), secret: v.string() },
  handler: async (ctx, args) => {
    const cfg = await ctx.db.get(args.botConfigId);
    if (!cfg || !cfg.enabled) return { ok: false };
    return { ok: cfg.webhookSecret === args.secret, tenantId: cfg.tenantId };
  },
});

// ————— Mini App Auth —————

/**
 * احراز هویت Mini App — فقط internal. initData باید قبلاً در اکشن node
 * (telegramActions.verifyInitDataAction) با bot token واقعی تأیید شده باشد.
 * هیچ مسیر عمومی‌ای وجود ندارد که initDataVerified را جعل کند.
 */
export const miniAppAuthInternal = internalMutation({
  args: {
    botConfigId: v.id("botConfigs"),
    telegramUserId: v.number(),
  },
  handler: async (ctx, args) => {
    const cfg = await ctx.db.get(args.botConfigId);
    if (!cfg || !cfg.enabled) throw new Error("FORBIDDEN: bot فعال نیست");
    const existing = await ctx.db
      .query("botUsers")
      .withIndex("by_bot_user", (q) =>
        q.eq("botConfigId", args.botConfigId).eq("telegramUserId", args.telegramUserId),
      )
      .unique();
    if (existing?.platformUserId) {
      const user = await ctx.db.get(existing.platformUserId);
      if (user && user.status === "active") {
        const accessToken = randomToken(24);
        const refreshToken = randomToken(24);
        await ctx.runMutation(internal.auth.createSession, {
          userId: user._id,
          accessToken,
          refreshToken,
        });
        return { accessToken, refreshToken, role: user.role, userId: user._id };
      }
    }
    return { needsRegister: true, telegramUserId: args.telegramUserId };
  },
});

/**
 * ثبت‌نام کاربر Mini App پس از verify واقعی initData — فقط از اکشن node.
 * کاربر جدید در tenant صاحب bot ساخته می‌شود؛ کاربر موجود با مطابقت
 * telegramUserId در همان tenant بازیابی می‌شود (بدون cross-tenant).
 */
export const miniAppRegisterInternal = internalMutation({
  args: {
    botConfigId: v.id("botConfigs"),
    telegramUserId: v.number(),
    username: v.string(),
    passwordEnvelope: v.string(),
  },
  handler: async (ctx, args) => {
    const cfg = await ctx.db.get(args.botConfigId);
    if (!cfg || !cfg.enabled) throw new Error("FORBIDDEN: bot فعال نیست");
    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", args.username))
      .unique();
    if (existingUser) {
      if (existingUser.tenantId !== cfg.tenantId) {
        throw new Error("CONFLICT: نام کاربری در این پلتفرم تکراری است");
      }
      if (existingUser.telegramUserId === args.telegramUserId) {
        return { userId: existingUser._id, tenantId: existingUser.tenantId, linked: true };
      }
      throw new Error("CONFLICT: نام کاربری تکراری است");
    }
    const userId = await ctx.db.insert("users", {
      username: args.username,
      passwordHash: args.passwordEnvelope,
      passwordSalt: "",
      role: "user",
      tenantId: cfg.tenantId,
      telegramUserId: args.telegramUserId,
      status: "active",
      failedLogins: 0,
    });
    await ctx.db.insert("botUsers", {
      botConfigId: args.botConfigId,
      telegramUserId: args.telegramUserId,
      platformUserId: userId,
      state: "registered",
    });
    await ctx.runMutation(internal.audit.log, {
      actorUserId: userId,
      tenantId: cfg.tenantId,
      action: "miniapp.register",
      entityType: "users",
      entityId: userId,
    });
    return { userId, tenantId: cfg.tenantId, linked: false };
  },
});

// ————— Bot User Linking —————

/**
 * اتصال کاربر پلتفرم به bot — ادمینِ همان tenant فقط با ارائه رمز عبور
 * کاربر (verify واقعی scrypt در اکشن node). بدون رمز درست، هیچ اتصالی
 * انجام نمی‌شود. این internal mutation از botUserLinkAction صدا زده می‌شود.
 */
export const botUserLinkInternal = internalMutation({
  args: {
    botConfigId: v.id("botConfigs"),
    telegramUserId: v.number(),
    platformUserId: v.id("users"),
    actorUserId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const cfg = await ctx.db.get(args.botConfigId);
    if (!cfg) throw new Error("NOT_FOUND: bot یافت نشد");
    const target = await ctx.db.get(args.platformUserId);
    if (!target) throw new Error("NOT_FOUND: کاربر پلتفرم یافت نشد");
    if (target.tenantId !== cfg.tenantId) {
      throw new Error("FORBIDDEN: کاربر متعلق به این bot نیست");
    }
    if (target.status !== "active") {
      throw new Error("FORBIDDEN: کاربر غیرفعال است");
    }
    const existing = await ctx.db
      .query("botUsers")
      .withIndex("by_bot_user", (q) =>
        q.eq("botConfigId", args.botConfigId).eq("telegramUserId", args.telegramUserId),
      )
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { platformUserId: target._id, state: "linked" });
      return { botUserId: existing._id };
    }
    const id = await ctx.db.insert("botUsers", {
      botConfigId: args.botConfigId,
      telegramUserId: args.telegramUserId,
      platformUserId: target._id,
      state: "linked",
    });
    await ctx.runMutation(internal.audit.log, {
      actorUserId: args.actorUserId,
      tenantId: cfg.tenantId,
      action: "bot.user_link",
      entityType: "botUsers",
      entityId: id,
      metadata: { telegramUserId: args.telegramUserId },
    });
    return { botUserId: id };
  },
});

// ————— Webhook secret چرخش —————

/** چرخش webhookSecret bot — با اثبات masterSecret از اکشن node. */
export const botWebhookRotate = mutation({
  args: { token: v.string(), proof: v.string(), webhookSecret: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx, args.token);
    requirePermission(actor, "ManageTelegramBot");
    const proof = await ctx.runQuery(internal.telegram.verifyMasterSecretProof, {
      masterSecret: args.proof,
    });
    if (!proof.ok) {
      throw new Error("FORBIDDEN: چرخش secret فقط از طریق اکشن سرور مجاز است");
    }
    const cfg = await ctx.db
      .query("botConfigs")
      .withIndex("by_tenant", (q) => q.eq("tenantId", actor.tenantId))
      .unique();
    if (!cfg) throw new Error("NOT_FOUND: bot یافت نشد");
    await ctx.db.patch(cfg._id, { webhookSecret: args.webhookSecret });
    return { ok: true };
  },
});

export { generateSecureCredentialRuntime };
