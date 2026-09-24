/** GuardAsli — احراز هویت: مرزهای مجوز، نشست‌ها و ماندگاری کاربر (بدون Node API). */
import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { generateSecureCredentialRuntime } from "./runtime";
import { DEFAULT_ROLE_PERMISSIONS, isRole } from "../core/rbac";
import { tenantScopeWalkAsync } from "../core/tenantScope";
import { stableTokenHash } from "../core/sessionToken";
import type { Id } from "./_generated/dataModel";

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 روز
const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MS = 1000 * 60 * 15;

// هش توکن نشست از core — همان پیاده‌سازی در تست‌ها و runtime.
export { stableTokenHash };

export interface ActorContext {
  userId: Id<"users">;
  tenantId: Id<"tenants">;
  role: string;
  status: string;
  sessionId: Id<"sessions">;
}

/** حل هویت بازیگر از توکن نشست — پایه تمام مجوزدهی‌ها. */
export async function requireActor(
  ctx: { db: any },
  token: string | undefined | null,
): Promise<ActorContext> {
  if (!token) throw new Error("UNAUTHENTICATED: نشست ارائه نشده است");
  const th = stableTokenHash(token);
  const session = await ctx.db
    .query("sessions")
    .withIndex("by_token", (q: any) => q.eq("tokenHash", th))
    .unique();
  if (!session || session.status !== "active" || session.expiresAt < Date.now()) {
    throw new Error("UNAUTHENTICATED: نشست نامعتبر یا منقضی است");
  }
  const user = await ctx.db.get(session.userId);
  if (!user || user.status !== "active") {
    throw new Error("UNAUTHENTICATED: کاربر غیرفعال است");
  }
  const tenant = await ctx.db.get(user.tenantId);
  if (!tenant || tenant.status !== "active") {
    throw new Error("UNAUTHENTICATED: مستأجر غیرفعال است");
  }
  return {
    userId: user._id,
    tenantId: user.tenantId,
    role: user.role,
    status: user.status,
    sessionId: session._id,
  };
}

/** اعمال مجوز granular در سمت سرور (بند ۵). */
export function requirePermission(
  actor: ActorContext,
  permission: string,
  extra?: readonly string[],
): void {
  const perms =
    extra ?? DEFAULT_ROLE_PERMISSIONS[actor.role as keyof typeof DEFAULT_ROLE_PERMISSIONS] ?? [];
  if (!perms.includes(permission as never)) {
    throw new Error(`FORBIDDEN: مجوز ${permission} لازم است`);
  }
}

/** بررسی scope مستأجر برای اکشن‌های node — بدون دسترسی مستقیم db. */
export const checkTenantScope = internalQuery({
  args: { actorTenantId: v.id("tenants"), resourceTenantId: v.id("tenants") },
  handler: async (ctx, args) => {
    const actor: ActorContext = {
      userId: ("" as never) as Id<"users">, // در این query فقط tenantId استفاده می‌شود
      tenantId: args.actorTenantId,
      role: "user",
      status: "active",
      sessionId: ("" as never) as Id<"sessions">,
    };
    try {
      await requireTenantScope(ctx, actor, args.resourceTenantId);
      return { ok: true };
    } catch {
      return { ok: false };
    }
  },
});

/** اعمال مرز مستأجر — منطق در src/core/tenantScope.ts (قابل تست مستقیم). */
export async function requireTenantScope(
  ctx: { db: any },
  actor: ActorContext,
  resourceTenantId: Id<"tenants">,
): Promise<void> {
  // db.get async است — باید منتظر doc بمانیم وگرنه walk با Promise مقایسه می‌کند
  // tenantScopeWalkAsync خودش db.get (Promise) را await می‌کند — walk همیشه doc واقعی می‌بیند
  const result = await tenantScopeWalkAsync(
    actor.tenantId,
    resourceTenantId,
    (id) => ctx.db.get(id),
  );
  if (!result.ok) {
    throw new Error(result.reason ?? "FORBIDDEN: دسترسی بین‌مستأجری مجاز نیست");
  }
}

// ————— Queries —————

export const whoami = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx, args.token);
    const user = await ctx.db.get(actor.userId);
    const tenant = await ctx.db.get(actor.tenantId);
    return {
      userId: actor.userId,
      username: user?.username,
      role: actor.role,
      tenantId: actor.tenantId,
      tenantName: tenant?.name,
    };
  },
});

// ————— Session mutations —————

export const createSession = internalMutation({
  args: {
    userId: v.id("users"),
    accessToken: v.string(),
    refreshToken: v.string(),
    userAgent: v.optional(v.string()),
    ip: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("sessions", {
      userId: args.userId,
      tokenHash: stableTokenHash(args.accessToken),
      refreshTokenHash: stableTokenHash(args.refreshToken),
      status: "active",
      ...(args.userAgent !== undefined ? { userAgent: args.userAgent } : {}),
      ...(args.ip !== undefined ? { ip: args.ip } : {}),
      expiresAt: Date.now() + SESSION_TTL_MS,
    });
  },
});

export const recordFailedLogin = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) return;
    const fails = (user.failedLogins ?? 0) + 1;
    const patch: Record<string, unknown> = { failedLogins: fails };
    if (fails >= MAX_FAILED_LOGINS) {
      patch.blockedUntil = Date.now() + LOCKOUT_MS;
      patch.failedLogins = 0;
    }
    await ctx.db.patch(args.userId, patch);
  },
});

export const clearFailedLogins = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, { failedLogins: 0 });
  },
});

export const rotateSession = internalMutation({
  args: { refreshToken: v.string() },
  handler: async (ctx, args) => {
    const rh = stableTokenHash(args.refreshToken);
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_refresh", (q: any) => q.eq("refreshTokenHash", rh))
      .unique();
    if (!session || session.status !== "active" || session.expiresAt < Date.now()) {
      return null;
    }
    const accessToken = generateSecureCredentialRuntime(40);
    const refreshToken = generateSecureCredentialRuntime(40);
    const expiresAt = Date.now() + SESSION_TTL_MS;
    await ctx.db.patch(session._id, {
      tokenHash: stableTokenHash(accessToken),
      refreshTokenHash: stableTokenHash(refreshToken),
      expiresAt,
    });
    return { accessToken, refreshToken, userId: session.userId, expiresAt };
  },
});

export const revokeSession = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx, args.token);
    await ctx.db.patch(actor.sessionId, { status: "revoked" });
    return { ok: true };
  },
});

export const revokeAllSessions = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx, args.token);
    const sessions = await ctx.db
      .query("sessions")
      .withIndex("by_user", (q: any) => q.eq("userId", actor.userId))
      .collect();
    for (const s of sessions) {
      if (s.status === "active") await ctx.db.patch(s._id, { status: "revoked" });
    }
    return { revoked: sessions.length };
  },
});

/** اعتبارسنجی بازیگر برای اکشن‌های node — تنها راه ورود به زنجیره‌های حساس. */
export const assertActor = internalQuery({
  args: { token: v.string(), permission: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx, args.token);
    if (args.permission) requirePermission(actor, args.permission);
    return actor;
  },
});

/** بازیابی پاکت رمز عبور کاربر برای verify سمت node — هرگز به کلاینت نمی‌رود. */
export const getUserCredentialsById = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const u = await ctx.db.get(args.userId);
    if (!u) return null;
    return { passwordHash: u.passwordHash, tenantId: u.tenantId, status: u.status };
  },
});

export const getUserByUsername = internalQuery({
  args: { username: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", args.username))
      .unique();
  },
});

export const persistUser = internalMutation({
  args: {
    username: v.string(),
    passwordEnvelope: v.string(),
    role: v.string(),
    parentUsername: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (!isRole(args.role)) {
      throw new Error("VALIDATION_ERROR: نقش نامعتبر است");
    }
    if (args.role === "super_admin") {
      // Super Admin تنها از مسیر bootstrapSystem ایجاد می‌شود — نه ثبت‌نام عمومی.
      throw new Error("FORBIDDEN: ایجاد Super Admin تنها از مسیر bootstrap مجاز است");
    }
    const existing = await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", args.username))
      .unique();
    if (existing) throw new Error("CONFLICT: نام کاربری تکراری است");
    let tenantId: Id<"tenants">;
    let parentUserId: Id<"users"> | undefined;
    if (args.parentUsername) {
      const parent = await ctx.db
        .query("users")
        .withIndex("by_username", (q) => q.eq("username", args.parentUsername!))
        .unique();
      if (!parent) throw new Error("NOT_FOUND: والد یافت نشد");
      if (parent.status !== "active") throw new Error("FORBIDDEN: والد غیرفعال است");
      tenantId = parent.tenantId;
      parentUserId = parent._id;
    } else {
      const core = await ctx.db
        .query("tenants")
        .withIndex("by_parent", (q) => q.eq("parentTenantId", undefined))
        .first();
      if (!core) throw new Error("INTERNAL_ERROR: سیستم bootstrap نشده است");
      tenantId = core._id;
    }
    const userId = await ctx.db.insert("users", {
      username: args.username,
      passwordHash: args.passwordEnvelope,
      passwordSalt: "", // salt داخل پاکت scrypt است
      role: args.role,
      tenantId,
      ...(parentUserId !== undefined ? { parentUserId } : {}),
      status: "active",
      failedLogins: 0,
    });
    return { userId, tenantId };
  },
});
