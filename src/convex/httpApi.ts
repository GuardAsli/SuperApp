/** GuardAsli — HTTP API /api/v1 (بند ۳۹): فرمت خطای استاندارد، webhook ها، OpenAPI. */
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { newRequestId, safeInternalMessage } from "../core/errors";
import { GUARDASLI, INITIAL_VERSIONS } from "../core/identity";
import { healthHandler, registerHandler, loginHandler, refreshHandler } from "./httpAuth";

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
    },
  };
}
