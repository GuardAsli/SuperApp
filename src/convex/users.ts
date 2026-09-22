/** GuardAsli — مدیریت کاربران با RBAC و ایزوله tenant. */
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireActor, requirePermission, requireTenantScope } from "./auth";
import { canManageActor, type Role } from "../core/rbac";

export const userList = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx, args.token);
    requirePermission(actor, "ManageUsers");
    const users = await ctx.db
      .query("users")
      .withIndex("by_tenant", (q) => q.eq("tenantId", actor.tenantId))
      .collect();
    return users.map((u) => ({
      _id: u._id,
      username: u.username,
      role: u.role,
      status: u.status,
      parentUserId: u.parentUserId ?? null,
    }));
  },
});

export const userSetStatus = mutation({
  args: {
    token: v.string(),
    userId: v.id("users"),
    status: v.union(v.literal("active"), v.literal("suspended"), v.literal("blocked")),
  },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx, args.token);
    requirePermission(actor, "ManageUsers");
    const target = await ctx.db.get(args.userId);
    if (!target) throw new Error("NOT_FOUND");
    await requireTenantScope(ctx, actor, target.tenantId);
    if (!canManageActor(actor.role as Role, target.role as Role)) {
      throw new Error("FORBIDDEN: نمی‌توانید این نقش را مدیریت کنید");
    }
    await ctx.db.patch(args.userId, { status: args.status });
    await ctx.runMutation(internal.audit.log, {
      actorUserId: actor.userId,
      tenantId: target.tenantId,
      action: "user.status",
      entityType: "users",
      entityId: args.userId,
      metadata: { status: args.status },
    });
    return { ok: true };
  },
});
