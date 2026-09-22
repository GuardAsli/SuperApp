/** GuardAsli — زیرساخت: Monitoring، Jobs، Backup، Domains، API Keys، Rate Limit، Reports. */
import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireActor, requirePermission, requireTenantScope } from "./auth";
import { randomToken } from "./runtime";
import { stableTokenHash } from "./auth";

export const healthRecord = internalMutation({
  args: {
    target: v.string(),
    state: v.string(),
    latencyMs: v.optional(v.number()),
    targetId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("healthChecks", {
      target: args.target,
      state: args.state,
      ...(args.latencyMs !== undefined ? { latencyMs: args.latencyMs } : {}),
      ...(args.targetId !== undefined ? { targetId: args.targetId } : {}),
      checkedAt: Date.now(),
    });
  },
});

export const healthLatest = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx, args.token);
    if (!["super_admin", "admin"].includes(actor.role)) {
      throw new Error("FORBIDDEN: دسترسی monitoring مجاز نیست");
    }
    const targets = [
      "api", "database", "workers", "providers", "telegram", "ssl", "disk", "payment_webhooks", "build",
    ];
    const out: Array<{ target: string; state: string; checkedAt: number }> = [];
    for (const t of targets) {
      const rows = await ctx.db
        .query("healthChecks")
        .withIndex("by_target_time", (q) => q.eq("target", t))
        .order("desc")
        .take(1);
      out.push(rows[0] ? { target: t, state: rows[0].state, checkedAt: rows[0].checkedAt } : { target: t, state: "unknown", checkedAt: 0 });
    }
    return out;
  },
});

export const jobEnqueue = internalMutation({
  args: {
    kind: v.string(),
    tenantId: v.optional(v.id("tenants")),
    payload: v.optional(v.any()),
    maxAttempts: v.optional(v.number()),
    delayMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("jobs", {
      kind: args.kind,
      ...(args.tenantId !== undefined ? { tenantId: args.tenantId } : {}),
      ...(args.payload !== undefined ? { payload: args.payload } : {}),
      status: "queued",
      attempts: 0,
      maxAttempts: args.maxAttempts ?? 5,
      nextRunAt: Date.now() + (args.delayMs ?? 0),
    });
    return id;
  },
});

export const jobPickDue = internalMutation({
  args: { limit: v.number() },
  handler: async (ctx, args) => {
    const now = Date.now();
    const due = await ctx.db
      .query("jobs")
      .withIndex("by_status_next", (q) => q.eq("status", "queued"))
      .filter((q) => q.lte(q.field("nextRunAt"), now))
      .take(args.limit);
    for (const j of due) {
      await ctx.db.patch(j._id, { status: "running" });
    }
    return due.map((j) => ({ id: j._id, kind: j.kind, payload: j.payload ?? null, tenantId: j.tenantId ?? null, attempts: j.attempts, maxAttempts: j.maxAttempts }));
  },
});

export const jobFinish = internalMutation({
  args: { jobId: v.id("jobs"), success: v.boolean(), error: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) return { ok: false };
    if (args.success) {
      await ctx.db.patch(args.jobId, { status: "done" });
      return { ok: true };
    }
    const attempts = job.attempts + 1;
    const dead = attempts >= job.maxAttempts;
    await ctx.db.patch(args.jobId, {
      status: dead ? "dead" : "queued",
      attempts,
      nextRunAt: Date.now() + Math.min(30_000 * 2 ** attempts, 3600_000),
      ...(args.error !== undefined ? { lastError: args.error } : {}),
    });
    return { ok: true, dead };
  },
});

export const backupRecord = mutation({
  args: {
    token: v.string(),
    scope: v.string(),
    storageId: v.id("_storage"),
    checksum: v.string(),
    encrypted: v.boolean(),
    tenantId: v.optional(v.id("tenants")),
  },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx, args.token);
    requirePermission(actor, "Manage");
    if (args.scope === "tenant") {
      if (!args.tenantId) throw new Error("VALIDATION_ERROR: tenantId لازم است");
      await requireTenantScope(ctx, actor, args.tenantId);
    } else if (actor.role !== "super_admin") {
      throw new Error("FORBIDDEN: فقط Super Admin");
    }
    if (!args.encrypted) {
      throw new Error("VALIDATION_ERROR: backup باید رمزنگاری‌شده باشد — secrets plaintext ممنوع");
    }
    const id = await ctx.db.insert("backups", {
      kind: "manual",
      scope: args.scope,
      storageId: args.storageId,
      checksum: args.checksum,
      encrypted: true,
      ...(args.tenantId !== undefined ? { tenantId: args.tenantId } : {}),
      status: "created",
      createdAt: Date.now(),
    });
    await ctx.runMutation(internal.audit.log, {
      actorUserId: actor.userId,
      action: "backup.create",
      entityType: "backups",
      entityId: id,
      metadata: { scope: args.scope },
    });
    return { backupId: id };
  },
});

export const backupList = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx, args.token);
    if (!["super_admin", "admin"].includes(actor.role)) {
      throw new Error("FORBIDDEN: دسترسی backup مجاز نیست");
    }
    return await ctx.db.query("backups").withIndex("by_time").order("desc").take(100);
  },
});

const DOMAIN_RE = /^(\*\.)?([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/;

export const domainAdd = mutation({
  args: { token: v.string(), domain: v.string(), isWildcard: v.boolean() },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx, args.token);
    requirePermission(actor, "ManageDomains");
    const d = args.domain.toLowerCase().trim();
    if (!DOMAIN_RE.test(d)) throw new Error("VALIDATION_ERROR: فرمت دامنه نامعتبر است");
    const settings = await ctx.db
      .query("systemSettings")
      .withIndex("by_key", (q) => q.eq("key", "main_domain"))
      .unique();
    if (settings && d === String(settings.value)) {
      throw new Error("FORBIDDEN: دامنه اصلی پلتفرم قابل تغییر توسط tenant نیست");
    }
    const dupe = await ctx.db
      .query("customDomains")
      .withIndex("by_domain", (q) => q.eq("domain", d))
      .unique();
    if (dupe) throw new Error("CONFLICT: این دامنه ثبت شده است");
    const verificationToken = randomToken(16);
    const id = await ctx.db.insert("customDomains", {
      tenantId: actor.tenantId,
      domain: d,
      verificationToken,
      verified: false,
      sslStatus: "none",
      isWildcard: args.isWildcard,
    });
    await ctx.runMutation(internal.audit.log, {
      actorUserId: actor.userId,
      tenantId: actor.tenantId,
      action: "domain.add",
      entityType: "customDomains",
      entityId: id,
      metadata: { domain: d, isWildcard: args.isWildcard },
    });
    return { domainId: id, verificationToken };
  },
});

/** درخواست تأیید دامنه — verified فقط بعد از تأیید DNS توسط worker/Node action. */
export const domainVerify = mutation({
  args: { token: v.string(), domainId: v.id("customDomains") },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx, args.token);
    const dom = await ctx.db.get(args.domainId);
    if (!dom) throw new Error("NOT_FOUND: دامنه یافت نشد");
    await requireTenantScope(ctx, actor, dom.tenantId);
    requirePermission(actor, "ManageDomains");
    // هرگز verified=true بدون DNS واقعی — فقط صف بررسی
    await ctx.db.patch(args.domainId, { sslStatus: "pending" });
    await ctx.db.insert("jobs", {
      kind: "domain_dns_verify",
      tenantId: dom.tenantId,
      payload: { domainId: args.domainId, domain: dom.domain, token: dom.verificationToken },
      status: "queued",
      attempts: 0,
      maxAttempts: 5,
      nextRunAt: Date.now(),
    });
    await ctx.runMutation(internal.audit.log, {
      actorUserId: actor.userId,
      tenantId: dom.tenantId,
      action: "domain.verify_requested",
      entityType: "customDomains",
      entityId: args.domainId,
    });
    return { ok: true, pending: true };
  },
});

/** تکمیل تأیید DNS — فقط internal پس از بررسی واقعی. */
export const domainMarkVerified = internalMutation({
  args: { domainId: v.id("customDomains"), ok: v.boolean() },
  handler: async (ctx, args) => {
    if (args.ok) {
      await ctx.db.patch(args.domainId, { verified: true, sslStatus: "pending" });
    } else {
      await ctx.db.patch(args.domainId, { verified: false, sslStatus: "failed" });
    }
    return { ok: true };
  },
});

export const domainList = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx, args.token);
    return await ctx.db
      .query("customDomains")
      .withIndex("by_tenant", (q) => q.eq("tenantId", actor.tenantId))
      .collect();
  },
});

export const apiKeyCreate = mutation({
  args: { token: v.string(), name: v.string(), scopes: v.array(v.string()), expiresInDays: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx, args.token);
    requirePermission(actor, "Manage");
    const raw = `ga_${randomToken(24)}`;
    const prefix = raw.slice(0, 10);
    const keyHash = await stableTokenHash(raw);
    const id = await ctx.db.insert("apiKeys", {
      tenantId: actor.tenantId,
      createdBy: actor.userId,
      name: args.name,
      prefix,
      keyHash,
      scopes: args.scopes,
      status: "active",
      ...(args.expiresInDays !== undefined
        ? { expiresAt: Date.now() + args.expiresInDays * 24 * 60 * 60 * 1000 }
        : {}),
    });
    await ctx.runMutation(internal.audit.log, {
      actorUserId: actor.userId,
      tenantId: actor.tenantId,
      action: "api_key.create",
      entityType: "apiKeys",
      entityId: id,
      metadata: { name: args.name, scopes: args.scopes },
    });
    return { apiKey: raw, apiKeyId: id, prefix };
  },
});

export const apiKeyRevoke = mutation({
  args: { token: v.string(), apiKeyId: v.id("apiKeys") },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx, args.token);
    const key = await ctx.db.get(args.apiKeyId);
    if (!key) throw new Error("NOT_FOUND: کلید یافت نشد");
    await requireTenantScope(ctx, actor, key.tenantId);
    requirePermission(actor, "Manage");
    await ctx.db.patch(args.apiKeyId, { status: "revoked" });
    await ctx.runMutation(internal.audit.log, {
      actorUserId: actor.userId,
      tenantId: key.tenantId,
      action: "api_key.revoke",
      entityType: "apiKeys",
      entityId: args.apiKeyId,
    });
    return { ok: true };
  },
});

export const apiKeyList = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx, args.token);
    const keys = await ctx.db
      .query("apiKeys")
      .withIndex("by_tenant", (q) => q.eq("tenantId", actor.tenantId))
      .collect();
    return keys.map((k) => ({
      apiKeyId: k._id,
      name: k.name,
      prefix: k.prefix,
      scopes: k.scopes,
      status: k.status,
      expiresAt: k.expiresAt ?? null,
      lastUsedAt: k.lastUsedAt ?? null,
    }));
  },
});

export const rateLimitCheck = internalMutation({
  args: { bucketKey: v.string(), windowMs: v.number(), maxPerWindow: v.number() },
  handler: async (ctx, args) => {
    const now = Date.now();
    const bucket = await ctx.db
      .query("rateLimits")
      .withIndex("by_bucket", (q) => q.eq("bucketKey", args.bucketKey))
      .unique();
    if (!bucket || bucket.windowStart + args.windowMs < now) {
      if (bucket) {
        await ctx.db.patch(bucket._id, { windowStart: now, count: 1 });
      } else {
        await ctx.db.insert("rateLimits", { bucketKey: args.bucketKey, windowStart: now, count: 1 });
      }
      return { allowed: true, remaining: args.maxPerWindow - 1 };
    }
    if (bucket.count >= args.maxPerWindow) {
      return { allowed: false, remaining: 0 };
    }
    await ctx.db.patch(bucket._id, { count: bucket.count + 1 });
    return { allowed: true, remaining: args.maxPerWindow - bucket.count - 1 };
  },
});

export const reportGenerate = query({
  args: { token: v.string(), kind: v.string(), periodStart: v.number(), periodEnd: v.number() },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx, args.token);
    requirePermission(actor, "View");
    const data: Record<string, unknown> = {};
    if (args.kind === "users") {
      const users = await ctx.db
        .query("users")
        .withIndex("by_tenant", (q) => q.eq("tenantId", actor.tenantId))
        .collect();
      data.totalUsers = users.length;
      data.byStatus = users.reduce<Record<string, number>>((acc, u) => {
        acc[u.status] = (acc[u.status] ?? 0) + 1;
        return acc;
      }, {});
    } else if (args.kind === "wallet" || args.kind === "revenue") {
      const entries = await ctx.db
        .query("ledgerEntries")
        .filter((q) =>
          q.and(
            q.eq(q.field("tenantId"), actor.tenantId),
            q.gte(q.field("createdAt"), args.periodStart),
            q.lte(q.field("createdAt"), args.periodEnd),
          ),
        )
        .collect();
      data.credits = entries.filter((e) => e.direction === "credit").reduce((s, e) => s + e.amount, 0);
      data.debits = entries.filter((e) => e.direction === "debit").reduce((s, e) => s + e.amount, 0);
      data.entryCount = entries.length;
    } else if (args.kind === "subscriptions") {
      const subs = await ctx.db
        .query("subscriptions")
        .withIndex("by_tenant", (q) => q.eq("tenantId", actor.tenantId))
        .collect();
      data.total = subs.length;
      data.byStatus = subs.reduce<Record<string, number>>((acc, s) => {
        acc[s.status] = (acc[s.status] ?? 0) + 1;
        return acc;
      }, {});
    } else {
      throw new Error("VALIDATION_ERROR: نوع گزارش پشتیبانی نمی‌شود");
    }
    return { kind: args.kind, periodStart: args.periodStart, periodEnd: args.periodEnd, data };
  },
});
