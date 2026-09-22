/** GuardAsli — Telegram Bot و Mini App (بند ۲۴ و ۲۵): webhook، محافظت token، auth امن. */
import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireActor, requirePermission, requireTenantScope } from "./auth";
import { generateSecureCredentialRuntime, randomToken } from "./runtime";
import { verifyTelegramInitData } from "../core/telegram";

/** ثبت/به‌روزرسانی پیکربندی bot هر tenant — token رمزنگاری‌شده ذخیره می‌شود. */
export const botConfigSave = mutation({
  args: {
    token: v.string(),
    tokenEncrypted: v.string(),
    displayName: v.string(),
    username: v.optional(v.string()),
    description: v.optional(v.string()),
    enabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx, args.token);
    requirePermission(actor, "ManageTelegramBot");
    const existing = await ctx.db
      .query("botConfigs")
      .withIndex("by_tenant", (q) => q.eq("tenantId", actor.tenantId))
      .unique();
    const webhookSecret = generateSecureCredentialRuntime(32);
    if (existing) {
      await ctx.db.patch(existing._id, {
        tokenEncrypted: args.tokenEncrypted,
        displayName: args.displayName,
        ...(args.username !== undefined ? { username: args.username } : {}),
        ...(args.description !== undefined ? { description: args.description } : {}),
        enabled: args.enabled,
        webhookSecret,
      });
      await ctx.runMutation(internal.audit.log, {
        actorUserId: actor.userId,
        tenantId: actor.tenantId,
        action: "bot.config_update",
        entityType: "botConfigs",
        entityId: existing._id,
      });
      return { botConfigId: existing._id, webhookSecret };
    }
    const id = await ctx.db.insert("botConfigs", {
      tenantId: actor.tenantId,
      tokenEncrypted: args.tokenEncrypted,
      displayName: args.displayName,
      ...(args.username !== undefined ? { username: args.username } : {}),
      ...(args.description !== undefined ? { description: args.description } : {}),
      enabled: args.enabled,
      webhookSecret,
    });
    await ctx.runMutation(internal.audit.log, {
      actorUserId: actor.userId,
      tenantId: actor.tenantId,
      action: "bot.config_create",
      entityType: "botConfigs",
      entityId: id,
    });
    return { botConfigId: id, webhookSecret };
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

/** احراز هویت Mini App: initData تلگرام + bot token — کاربر platform mapping. */
export const miniAppAuth = mutation({
  args: {
    botConfigId: v.id("botConfigs"),
    initData: v.string(),
    initDataVerified: v.boolean(), // فقط نتیجه verify سمت node — اینجا اتمام‌کار
    telegramUserId: v.number(),
  },
  handler: async (ctx, args) => {
    if (!args.initDataVerified) {
      throw new Error("UNAUTHENTICATED: امضای initData نامعتبر است");
    }
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

export const botUserLink = mutation({
  args: {
    token: v.string(),
    botConfigId: v.id("botConfigs"),
    telegramUserId: v.number(),
    platformUsername: v.string(),
    password: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx, args.token);
    requirePermission(actor, "ManageTelegramBot");
    const cfg = await ctx.db.get(args.botConfigId);
    if (!cfg) throw new Error("NOT_FOUND: bot یافت نشد");
    await requireTenantScope(ctx, actor, cfg.tenantId);
    const existing = await ctx.db
      .query("botUsers")
      .withIndex("by_bot_user", (q) =>
        q.eq("botConfigId", args.botConfigId).eq("telegramUserId", args.telegramUserId),
      )
      .unique();
    if (existing) return { botUserId: existing._id };
    const id = await ctx.db.insert("botUsers", {
      botConfigId: args.botConfigId,
      telegramUserId: args.telegramUserId,
      state: "linked",
    });
    return { botUserId: id };
  },
});
