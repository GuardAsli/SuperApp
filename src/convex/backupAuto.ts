/** GuardAsli — بکاپ خودکار رمزنگاری‌شده. */
import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireActor } from "./auth";

/**
 * هر شب از طریق cron: snapshot متادیتای سیستم (بدون secret خام) به صورت JSON
 * و ثبت رکورد backup با encrypted=true پس از ذخیره در storage توسط action.
 *
 * این mutation فقط صف job می‌سازد؛ worker محتوای رمزشده را می‌نویسد.
 */
export const enqueueNightlyBackup = internalMutation({
  args: {},
  handler: async (ctx) => {
    const id = await ctx.db.insert("jobs", {
      kind: "auto_backup",
      status: "queued",
      attempts: 0,
      maxAttempts: 3,
      nextRunAt: Date.now(),
      payload: { scope: "system", reason: "nightly" },
    });
    await ctx.runMutation(internal.infra.healthRecord, {
      target: "backup",
      state: "queued",
    });
    return { jobId: id };
  },
});

/** ثبت نتیجه بکاپ از worker (storageId از قبل آپلود شده و رمزشده). */
export const recordAutoBackup = internalMutation({
  args: {
    storageId: v.id("_storage"),
    checksum: v.string(),
    scope: v.string(),
    tenantId: v.optional(v.id("tenants")),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("backups", {
      kind: "auto",
      scope: args.scope,
      storageId: args.storageId,
      checksum: args.checksum,
      encrypted: true,
      ...(args.tenantId !== undefined ? { tenantId: args.tenantId } : {}),
      status: "created",
      createdAt: Date.now(),
    });
    await ctx.runMutation(internal.infra.healthRecord, {
      target: "backup",
      state: "ok",
    });
    return { backupId: id };
  },
});

export const backupSettingsGet = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx, args.token);
    if (actor.role !== "super_admin") throw new Error("FORBIDDEN");
    const row = await ctx.db
      .query("systemSettings")
      .withIndex("by_key", (q) => q.eq("key", "auto_backup"))
      .unique();
    return (
      row?.value ?? {
        enabled: true,
        hourUtc: 3,
        retainDays: 14,
      }
    );
  },
});

export const backupSettingsSet = internalMutation({
  args: {
    enabled: v.boolean(),
    hourUtc: v.number(),
    retainDays: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("systemSettings")
      .withIndex("by_key", (q) => q.eq("key", "auto_backup"))
      .unique();
    const value = {
      enabled: args.enabled,
      hourUtc: Math.min(23, Math.max(0, args.hourUtc)),
      retainDays: Math.min(90, Math.max(1, args.retainDays)),
    };
    if (existing) await ctx.db.patch(existing._id, { value });
    else await ctx.db.insert("systemSettings", { key: "auto_backup", value });
    return value;
  },
});
