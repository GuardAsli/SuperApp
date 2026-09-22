"use node";
/** GuardAsli — login/register با rate-limit و سیاست رمز. */
import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { assertStrongPassword, scryptHashSync, scryptVerifySync } from "../core/password";
import type { Doc } from "./_generated/dataModel";

export const registerAction = action({
  args: {
    username: v.string(),
    password: v.string(),
    role: v.optional(v.string()),
    parentUsername: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const rl = await ctx.runMutation(internal.infra.rateLimitCheck, {
      bucketKey: `register:${args.username.toLowerCase()}`,
      windowMs: 60_000,
      maxPerWindow: 5,
    });
    if (!rl.allowed) throw new Error("RATE_LIMITED: ثبت‌نام موقتاً محدود است");

    if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(args.username)) {
      throw new Error("VALIDATION_ERROR: نام کاربری نامعتبر است");
    }
    // همه کاربران: حداقل ۸ + mixed + digit
    assertStrongPassword(args.password, 8);
    const role = "user";
    const { hash } = scryptHashSync(args.password);
    return await ctx.runMutation(internal.auth.persistUser, {
      username: args.username,
      passwordEnvelope: hash,
      role,
      parentUsername: args.parentUsername,
    });
  },
});

interface LoginResult {
  accessToken: string;
  refreshToken: string;
  role: string;
  tenantId: string;
}

export const loginAction = action({
  args: { username: v.string(), password: v.string() },
  handler: async (ctx, args): Promise<LoginResult> => {
    const rl = await ctx.runMutation(internal.infra.rateLimitCheck, {
      bucketKey: `login:${args.username.toLowerCase()}`,
      windowMs: 60_000,
      maxPerWindow: 10,
    });
    if (!rl.allowed) throw new Error("RATE_LIMITED: ورود موقتاً محدود است");

    const user: Doc<"users"> | null = await ctx.runQuery(internal.auth.getUserByUsername, {
      username: args.username,
    });
    // پیام یکسان — جلوگیری از user enumeration
    if (!user) throw new Error("UNAUTHENTICATED: نام کاربری یا رمز عبور نادرست است");
    const now = Date.now();
    if (user.blockedUntil && user.blockedUntil > now) {
      throw new Error("FORBIDDEN: حساب موقتاً قفل است");
    }
    if (user.status !== "active") {
      throw new Error("FORBIDDEN: حساب غیرفعال است");
    }
    const ok = scryptVerifySync(args.password, user.passwordHash);
    if (!ok) {
      await ctx.runMutation(internal.auth.recordFailedLogin, { userId: user._id });
      throw new Error("UNAUTHENTICATED: نام کاربری یا رمز عبور نادرست است");
    }
    await ctx.runMutation(internal.auth.clearFailedLogins, { userId: user._id });
    const accessToken = randomHex(32);
    const refreshToken = randomHex(32);
    await ctx.runMutation(internal.auth.createSession, {
      userId: user._id,
      accessToken,
      refreshToken,
    });
    return { accessToken, refreshToken, role: user.role, tenantId: user.tenantId };
  },
});

export const refreshAction = action({
  args: { refreshToken: v.string() },
  handler: async (ctx, args) => {
    const rl = await ctx.runMutation(internal.infra.rateLimitCheck, {
      bucketKey: `refresh:${args.refreshToken.slice(0, 16)}`,
      windowMs: 60_000,
      maxPerWindow: 30,
    });
    if (!rl.allowed) throw new Error("RATE_LIMITED: refresh محدود است");
    const res = await ctx.runMutation(internal.auth.rotateSession, {
      refreshToken: args.refreshToken,
    });
    if (!res) throw new Error("UNAUTHENTICATED: refresh token نامعتبر است");
    return res;
  },
});

export const bootstrapAdminAction = action({
  args: {
    username: v.string(),
    password: v.string(),
  },
  handler: async (ctx, args) => {
    if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(args.username)) {
      throw new Error("VALIDATION_ERROR: نام کاربری نامعتبر است");
    }
    assertStrongPassword(args.password, 12);
    const { hash } = scryptHashSync(args.password);
    return await ctx.runMutation(internal.tenants.bootstrapSystem, {
      username: args.username,
      passwordHash: hash,
      passwordSalt: "",
    });
  },
});

function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  let out = "";
  for (const b of arr) out += b.toString(16).padStart(2, "0");
  return out;
}
