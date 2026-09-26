/** GuardAsli — HTTP API /api/v1 (بند ۳۹): فرمت خطای استاندارد، webhook ها، OpenAPI، احراز کلید API. */
import { v } from "convex/values";
import { httpAction, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { newRequestId, safeInternalMessage } from "../core/errors";
import { GUARDASLI, INITIAL_VERSIONS } from "../core/identity";
import { healthHandler, registerHandler, loginHandler, refreshHandler } from "./httpAuth";

/**
 * احراز کلید API برای مسیرهای /api/v1/panel/*.
 * کلید از هدر Authorization: Bearer ga_… خوانده و با apiKeyAuthorize اعتبارسنجی می‌شود
 * (prefix → hash → status → expiry → scope). پاسخ خطا همیشه با قرارداد استاندارد است.
 * در صورت موفقیت، lastUsedAt کلید به‌روز می‌شود و handler با tenant کلید اجرا می‌شود.
 */
async function authorizeApiKey(
  ctx: any,
  req: Request,
  requestId: string,
  headers: Record<string, string>,
  requiredScope?: string,
): Promise<{ ok: true; apiKeyId: string; tenantId: string; scopes: string[] } | Response> {
  const auth = req.headers.get("authorization") ?? "";
  const verdict = (await ctx.runQuery(internal.infra.apiKeyAuthorize, {
    authorization: auth,
    ...(requiredScope !== undefined ? { requiredScope } : {}),
  })) as
    | { ok: true; apiKeyId: string; tenantId: string; scopes: string[] }
    | { ok: false; code: string; message: string };
  if (!verdict.ok) {
    const status = verdict.code === "FORBIDDEN" ? 403 : 401;
    return errorResponse(requestId, status, verdict.code, verdict.message, headers);
  }
  await ctx
    .runMutation(internal.infra.apiKeyTouch, { apiKeyId: verdict.apiKeyId as never })
    .catch(() => undefined); // غیرمسدودکننده
  return verdict;
}

/**
 * CORS با allowlist از systemSettings (کلید cors_origins) — بدون wildcard.
 * پیش‌فرض: هیچ مبدایی مجاز نیست؛ origins باید صریحاً تنظیم شوند.
 * کلید cors_origins فقط توسط Super Admin قابل تنظیم است (tenants.systemSettingsSet).
 */
async function buildCorsHeaders(ctx: any, req: Request): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": "default-src 'none'",
  };
  const origin = req.headers.get("origin");
  if (origin) {
    const settings = await ctx.db
      .query("systemSettings")
      .withIndex("by_key", (q: any) => q.eq("key", "cors_origins"))
      .unique();
    const allowed = Array.isArray(settings?.value) ? (settings.value as string[]) : [];
    if (allowed.includes(origin)) {
      headers["Access-Control-Allow-Origin"] = origin;
      headers["Vary"] = "Origin";
      headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS";
      headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-Request-Id";
    }
  }
  return headers;
}

function jsonResponse(requestId: string, status: number, body: unknown, headers: Record<string, string>): Response {
  return new Response(JSON.stringify({ ...(body as object), requestId }), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

function errorResponse(requestId: string, status: number, code: string, message: string, headers: Record<string, string>, details?: unknown): Response {
  return jsonResponse(requestId, status, {
    code,
    message,
    ...(details !== undefined ? { details } : {}),
    requestId,
  }, headers);
}

function mapError(requestId: string, err: unknown, headers: Record<string, string>): Response {
  const msg = err instanceof Error ? err.message : String(err);
  for (const code of [
    "UNAUTHENTICATED", "FORBIDDEN", "NOT_FOUND", "CONFLICT", "VALIDATION_ERROR",
    "QUOTA_EXCEEDED", "RATE_LIMITED",
  ]) {
    if (msg.startsWith(code)) {
      const status: Record<string, number> = {
        UNAUTHENTICATED: 401, FORBIDDEN: 403, NOT_FOUND: 404, CONFLICT: 409,
        VALIDATION_ERROR: 400, QUOTA_EXCEEDED: 402, RATE_LIMITED: 429,
      };
      return errorResponse(requestId, status[code], code, msg.replace(`${code}: `, ""), headers);
    }
  }
  return errorResponse(requestId, 500, "INTERNAL_ERROR", safeInternalMessage(requestId), headers);
}

type RouteHandler = (ctx: any, req: Request, requestId: string, headers: Record<string, string>) => Promise<Response>;

interface RouteDef {
  prefix?: string;
  path?: string;
  method: string;
  handler: RouteHandler;
}

const routes: RouteDef[] = [
  {
    path: "/api/v1/health",
    method: "GET",
    handler: (ctx, _req, requestId, headers) => healthHandler(ctx, requestId, headers),
  },
  {
    path: "/api/v1/auth/register",
    method: "POST",
    handler: (ctx, req, requestId, headers) => registerHandler(ctx, req, requestId, headers),
  },
  {
    path: "/api/v1/auth/login",
    method: "POST",
    handler: (ctx, req, requestId, headers) => loginHandler(ctx, req, requestId, headers),
  },
  {
    path: "/api/v1/auth/refresh",
    method: "POST",
    handler: (ctx, req, requestId, headers) => refreshHandler(ctx, req, requestId, headers),
  },
  {
    path: "/api/v1/ping",
    method: "GET",
    handler: async (_ctx, _req, requestId, headers) =>
      jsonResponse(requestId, 200, { code: "OK", message: GUARDASLI.product }, headers),
  },
  {
    path: "/api/v1/version",
    method: "GET",
    handler: async (_ctx, _req, requestId, headers) =>
      jsonResponse(requestId, 200, {
        product: GUARDASLI.product,
        developer: GUARDASLI.developer,
        version: GUARDASLI.initialVersion,
        format: GUARDASLI.versionFormat,
        components: INITIAL_VERSIONS,
      }, headers),
  },
  {
    path: "/api/v1/openapi.json",
    method: "GET",
    handler: async (_ctx, _req, requestId, headers) => jsonResponse(requestId, 200, buildOpenApiSpec(), headers),
  },
  // ————— مسیرهای پنل — احراز با کلید API (Authorization: Bearer ga_…) —————
  {
    path: "/api/v1/panel/overview",
    method: "GET",
    handler: async (ctx, req, requestId, headers) => {
      const auth = await authorizeApiKey(ctx, req, requestId, headers, "panel:read");
      if (auth instanceof Response) return auth;
      const data = await ctx.runQuery(internal.httpApi.panelOverviewInternal, {
        tenantId: auth.tenantId as never,
      });
      return jsonResponse(requestId, 200, { ...data, tenantId: auth.tenantId }, headers);
    },
  },
  {
    path: "/api/v1/panel/users",
    method: "GET",
    handler: async (ctx, req, requestId, headers) => {
      const auth = await authorizeApiKey(ctx, req, requestId, headers, "panel:read");
      if (auth instanceof Response) return auth;
      const rows = (await ctx.runQuery(internal.httpApi.panelUsersInternal, {
        tenantId: auth.tenantId as never,
      })) as Array<Record<string, unknown>>;
      // بدون hash رمز — فقط فیلدهای عمومی پنل
      const safe = rows.map((u) => ({
        userId: u._id,
        username: u.username,
        role: u.role,
        status: u.status,
      }));
      return jsonResponse(requestId, 200, { users: safe, count: safe.length }, headers);
    },
  },
  {
    path: "/api/v1/panel/subscriptions",
    method: "GET",
    handler: async (ctx, req, requestId, headers) => {
      const auth = await authorizeApiKey(ctx, req, requestId, headers, "panel:read");
      if (auth instanceof Response) return auth;
      const rows = await ctx.runQuery(internal.httpApi.panelSubscriptionsInternal, {
        tenantId: auth.tenantId as never,
      });
      return jsonResponse(requestId, 200, { subscriptions: rows }, headers);
    },
  },
  {
    prefix: "/api/v1/telegram/webhook/",
    method: "POST",
    handler: async (ctx, req, requestId, headers) => {
      const url = new URL(req.url);
      const botConfigId = url.pathname.split("/").pop() ?? "";
      const secret = req.headers.get("x-telegram-bot-api-secret-token") ?? "";
      const body = (await req.json().catch(() => ({}))) as {
        message?: { chat?: { id?: number | string }; from?: { id?: number }; text?: string };
        callback_query?: { from?: { id?: number } };
      };
      const verification = await ctx.runQuery(internal.telegram.verifyWebhookSecret, {
        botConfigId: botConfigId as never,
        secret,
      });
      if (!verification.ok) {
        return errorResponse(requestId, 401, "UNAUTHENTICATED", "امضای webhook نامعتبر است", headers);
      }
      const text = body.message?.text ?? "";
      const chatId = String(body.message?.chat?.id ?? body.callback_query?.from?.id ?? "");
      const telegramUserId = body.message?.from?.id ?? body.callback_query?.from?.id;
      await ctx.runMutation(internal.jobs.dispatchBotCommand, {
        botConfigId,
        chatId,
        text,
        telegramUserId,
      });
      return jsonResponse(requestId, 200, { ok: true }, headers);
    },
  },
  {
    prefix: "/api/v1/payments/tetraminator/webhook",
    method: "POST",
    handler: async (ctx, req, requestId, headers) => {
      const url = new URL(req.url);
      const paymentId = url.searchParams.get("order_id") ?? "";
      const body = (await req.json().catch(() => ({}))) as { pay_id?: string };
      if (!paymentId || !body.pay_id) {
        return errorResponse(requestId, 400, "VALIDATION_ERROR", "پارامترهای webhook ناقص است", headers);
      }
      await ctx.runMutation(internal.jobs.enqueuePaymentVerify, {
        paymentId: paymentId as never,
        provider: "tetraminator",
        providerPaymentId: body.pay_id,
      });
      return jsonResponse(requestId, 200, { ok: true }, headers);
    },
  },
  {
    prefix: "/api/v1/payments/cubepay/callback",
    method: "POST",
    handler: async (ctx, req, requestId, headers) => {
      const url = new URL(req.url);
      const paymentId = url.searchParams.get("order_id") ?? "";
      const body = (await req.json().catch(() => ({}))) as { authority?: string };
      if (!paymentId || !body.authority) {
        return errorResponse(requestId, 400, "VALIDATION_ERROR", "پارامترهای callback ناقص است", headers);
      }
      await ctx.runMutation(internal.jobs.enqueuePaymentVerify, {
        paymentId: paymentId as never,
        provider: "cubepay",
        providerPaymentId: body.authority,
      });
      return jsonResponse(requestId, 200, { ok: true }, headers);
    },
  },
];

/** روتینگ دستی — فایل http.ts فقط این را به Convex معرفی می‌کند. */
export const http = httpAction(async (ctx, req) => {
  const requestId = newRequestId();
  const headers = await buildCorsHeaders(ctx, req);
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }
  const path = new URL(req.url).pathname;
  for (const r of routes) {
    if ((r.path === path || (r.prefix && path.startsWith(r.prefix))) && r.method === req.method) {
      try {
        return await r.handler(ctx, req, requestId, headers);
      } catch (err) {
        return mapError(requestId, err, headers);
      }
    }
  }
  return errorResponse(requestId, 404, "NOT_FOUND", "مسیر یافت نشد", headers);
});

/** داده‌های پنل برای tenant کلید — فقط خواندنی، محدود به همان tenant (داخل query امن). */
export const panelOverviewInternal = internalQuery({
  args: { tenantId: v.id("tenants") },
  handler: async (ctx, args) => {
    const users = await ctx.db
      .query("users")
      .withIndex("by_tenant", (q: any) => q.eq("tenantId", args.tenantId))
      .collect();
    const subs = await ctx.db
      .query("subscriptions")
      .withIndex("by_tenant", (q: any) => q.eq("tenantId", args.tenantId))
      .collect();
    return {
      users: users.length,
      activeUsers: users.filter((u: any) => u.status === "active").length,
      subscriptions: subs.length,
      activeSubscriptions: subs.filter((s: any) => s.status === "active").length,
    };
  },
});

export const panelUsersInternal = internalQuery({
  args: { tenantId: v.id("tenants") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_tenant", (q: any) => q.eq("tenantId", args.tenantId))
      .collect();
  },
});

export const panelSubscriptionsInternal = internalQuery({
  args: { tenantId: v.id("tenants") },
  handler: async (ctx, args) => {
    const subs = await ctx.db
      .query("subscriptions")
      .withIndex("by_tenant", (q: any) => q.eq("tenantId", args.tenantId))
      .order("desc")
      .take(100);
    return subs.map((s: any) => ({
      subscriptionId: s._id,
      userId: s.userId,
      status: s.status,
      provisioningState: s.provisioningState,
      kind: s.kind,
      trafficLimitGb: s.trafficLimitGb ?? null,
      trafficUsedGb: s.trafficUsedGb ?? null,
      durationEndsAt: s.durationEndsAt ?? null,
    }));
  },
});

function buildOpenApiSpec(): Record<string, unknown> {
  return {
    openapi: "3.1.0",
    info: {
      title: `${GUARDASLI.product} API`,
      version: GUARDASLI.initialVersion,
      description: `API پلتفرم ${GUARDASLI.product} توسط ${GUARDASLI.developer}`,
      contact: { name: GUARDASLI.developer },
    },
    servers: [{ url: "/api/v1" }],
    components: {
      schemas: {
        Error: {
          type: "object",
          required: ["code", "message", "requestId"],
          properties: {
            code: { type: "string" },
            message: { type: "string" },
            details: {},
            requestId: { type: "string" },
          },
        },
      },
    },
    paths: {
      "/api/v1/health": {
        get: {
          summary: "بررسی سلامت API و اتصال واقعی دیتابیس",
          responses: { "200": { description: "OK" }, "503": { description: "دیتابیس در دسترس نیست" } },
        },
      },
      "/api/v1/auth/register": {
        post: {
          summary: "ثبت‌نام کاربر (rate-limit + scrypt)",
          requestBody: {
            required: true,
            content: { "application/json": { schema: { type: "object", required: ["username", "password"], properties: { username: { type: "string" }, password: { type: "string" }, parentUsername: { type: "string" } } } } },
          },
          responses: { "201": { description: "ساخته شد" }, "400": { description: "خطا" }, "409": { description: "تکراری" }, "429": { description: "محدود" } },
        },
      },
      "/api/v1/auth/login": {
        post: {
          summary: "ورود و ساخت نشست ۷ روزه",
          requestBody: {
            required: true,
            content: { "application/json": { schema: { type: "object", required: ["username", "password"], properties: { username: { type: "string" }, password: { type: "string" } } } } },
          },
          responses: { "200": { description: "OK" }, "400": { description: "خطا" }, "401": { description: "نامعتبر" }, "429": { description: "محدود" } },
        },
      },
      "/api/v1/auth/refresh": {
        post: {
          summary: "چرخش نشست با refresh token",
          requestBody: {
            required: true,
            content: { "application/json": { schema: { type: "object", required: ["refreshToken"], properties: { refreshToken: { type: "string" } } } } },
          },
          responses: { "200": { description: "OK" }, "400": { description: "خطا" }, "401": { description: "نامعتبر" } },
        },
      },
      "/api/v1/ping": { get: { summary: "سلام", responses: { "200": { description: "OK" } } } },
      "/api/v1/version": {
        get: {
          summary: `نسخه اجزا با فرمت ${GUARDASLI.versionFormat}`,
          responses: { "200": { description: "OK" } },
        },
      },
      "/api/v1/payments/tetraminator/webhook": {
        post: {
          summary: "Webhook Tetraminator — صف verify بدون credit مستقیم",
          responses: { "200": { description: "OK" }, "400": { description: "خطا" } },
        },
      },
      "/api/v1/payments/cubepay/callback": {
        post: {
          summary: "Callback CubePay — صف verify بدون credit مستقیم",
          responses: { "200": { description: "OK" }, "400": { description: "خطا" } },
        },
      },
      "/api/v1/telegram/webhook/{botConfigId}": {
        post: {
          summary: "Webhook bot هر tenant با secret token",
          parameters: [{ name: "botConfigId", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "OK" }, "401": { description: "امضای نامعتبر" } },
        },
      },
      "/api/v1/panel/overview": {
        get: {
          summary: "نمای کلی tenant — احراز با کلید API (Bearer ga_…، سکوپ panel:read)",
          security: [{ ApiKeyAuth: [] }],
          responses: {
            "200": { description: "OK" },
            "401": { description: "کلید غایب/نامعتبر" },
            "403": { description: "ابطال‌شده/منقضی/بدون سکوپ" },
          },
        },
      },
      "/api/v1/panel/users": {
        get: {
          summary: "فهرست کاربران tenant — سکوپ panel:read",
          security: [{ ApiKeyAuth: [] }],
          responses: { "200": { description: "OK" }, "401": {}, "403": {} },
        },
      },
      "/api/v1/panel/subscriptions": {
        get: {
          summary: "آخرین ۱۰۰ اشتراک tenant — سکوپ panel:read",
          security: [{ ApiKeyAuth: [] }],
          responses: { "200": { description: "OK" }, "401": {}, "403": {} },
        },
      },
    },
    securitySchemesNote: "ApiKeyAuth: Authorization: Bearer ga_…",
  };
}
