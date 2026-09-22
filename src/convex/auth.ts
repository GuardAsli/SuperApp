/** GuardAsli — احراز هویت: مرزهای مجوز، نشست‌ها و ماندگاری کاربر (بدون Node API). */
import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { generateSecureCredentialRuntime } from "./runtime";
import { DEFAULT_ROLE_PERMISSIONS } from "../core/rbac";
import type { Id } from "./_generated/dataModel";

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 روز
const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MS = 1000 * 60 * 15;

/** هش پایدار و سریع برای جستجوی توکن نشست (بدون نیاز به crypto در mutation). */
export function stableTokenHash(input: string): string {
  let h1 = 0xdeadbeef ^ input.length;
  let h2 = 0x41c6ce57 ^ input.length;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const out = (h2 >>> 0) * 4294967296 + (h1 >>> 0);
  return out.toString(36) + "." + input.length.toString(36);
}

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
  if (!perms.includes(permission)) {
    throw new Error(`FORBIDDEN: مجوز ${permission} لازم است`);
  }
}

/** اعمال مرز مستأجر: بازیگر فقط به منابع درخت مستأجر خودش دسترسی دارد. */
export async function requireTenantScope(
  ctx: { db: any },
  actor: ActorContext,
  resourceTenantId: Id<"tenants">,
): Promise<void> {
  if (actor.tenantId === resourceTenantId) return;
  const actorTenant = await ctx.db.get(actor.tenantId);
  if (actorTenant?.config?.core === true) return; // tenant Core همه‌جا دیده می‌کند
  let cur = await ctx.db.get(resourceTenantId);
  let depth = 0;
  while (cur && depth < 32) {
    if (cur._id === actor.tenantId) return;
    if (!cur.parentTenantId) break;
    cur = await ctx.db.get(cur.parentTenantId);
    depth++;
  }
  throw new Error("FORBIDDEN: دسترسی بین‌مستأجری مجاز نیست");
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
