/** GuardAsli — HTTP API /api/v1: فرمت خطای استاندارد، webhook ها، OpenAPI. */
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { newRequestId, safeInternalMessage } from "../core/errors";
import { getVersionSnapshot, GUARDASLI } from "../core/identity";

const corsHeaders: Record<string, string> = {
  // در production دامنهٔ اصلی را جایگزین * کنید
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Request-Id, X-Webhook-Secret",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Content-Security-Policy": "default-src 'none'",
};

function jsonResponse(requestId: string, status: number, body: unknown): Response {
  return new Response(JSON.stringify({ ...(body as object), requestId }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errorResponse(requestId: string, status: number, code: string, message: string, details?: unknown): Response {
  return jsonResponse(requestId, status, {
    code,
    message,
    ...(details !== undefined ? { details } : {}),
    requestId,
  });
}

function mapError(requestId: string, err: unknown): Response {
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
      return errorResponse(requestId, status[code], code, msg.replace(`${code}: `, ""));
    }
  }
  return errorResponse(requestId, 500, "INTERNAL_ERROR", safeInternalMessage(requestId));
}

type RouteHandler = (ctx: any, req: Request, requestId: string) => Promise<Response>;

interface RouteDef {
  prefix?: string;
  path?: string;
  method: string;
  handler: RouteHandler;
}

const routes: RouteDef[] = [
  {
    path: "/api/v1/ping",
    method: "GET",
    handler: async (_ctx, _req, requestId) =>
      jsonResponse(requestId, 200, {
        code: "OK",
        message: `${GUARDASLI.product} API`,
        version: getVersionSnapshot().components.api,
      }),
  },
  {
    path: "/api/v1/version",
    method: "GET",
    handler: async (_ctx, _req, requestId) => {
      const snap = getVersionSnapshot();
      return jsonResponse(requestId, 200, {
        product: snap.product,
        developer: snap.developer,
        version: snap.components.core,
        format: snap.format,
        components: snap.components,
      });
    },
  },
  {
    path: "/api/v1/openapi.json",
    method: "GET",
    handler: async (_ctx, _req, requestId) => jsonResponse(requestId, 200, buildOpenApiSpec()),
  },
  {
    prefix: "/api/v1/telegram/webhook/",
    method: "POST",
    handler: async (ctx, req, requestId) => {
      const url = new URL(req.url);
      const botConfigId = url.pathname.split("/").pop() ?? "";
      const secret = req.headers.get("x-telegram-bot-api-secret-token") ?? "";
      const body = (await req.json().catch(() => ({}))) as {
        message?: { chat?: { id?: number | string }; text?: string };
        callback_query?: { from?: { id?: number } };
      };
      const verification = await ctx.runQuery(internal.telegram.verifyWebhookSecret, {
        botConfigId: botConfigId as never,
        secret,
      });
      if (!verification.ok) {
        return errorResponse(requestId, 401, "UNAUTHENTICATED", "امضای webhook نامعتبر است");
      }
      const text = body.message?.text ?? "";
      const chatId = String(body.message?.chat?.id ?? body.callback_query?.from?.id ?? "");
      await ctx.runMutation(internal.jobs.dispatchBotCommand, { botConfigId, chatId, text });
      return jsonResponse(requestId, 200, { ok: true });
    },
  },
  {
    prefix: "/api/v1/payments/tetraminator/webhook",
    method: "POST",
    handler: async (ctx, req, requestId) => {
      // فقط صف verify — credit مستقیم ممنوع. امضای provider در worker بررسی می‌شود.
      const url = new URL(req.url);
      const paymentId = url.searchParams.get("order_id") ?? "";
      const body = (await req.json().catch(() => ({}))) as { pay_id?: string };
      if (!paymentId || !body.pay_id) {
        return errorResponse(requestId, 400, "VALIDATION_ERROR", "پارامترهای webhook ناقص است");
      }
      // شناسهٔ پرداخت باید در DB وجود داشته و در awaiting_verify باشد (enqueuePaymentVerify چک می‌کند)
      await ctx.runMutation(internal.jobs.enqueuePaymentVerify, {
        paymentId: paymentId as never,
        provider: "tetraminator",
        providerPaymentId: body.pay_id,
      });
      return jsonResponse(requestId, 200, { ok: true });
    },
  },
  {
    prefix: "/api/v1/payments/cubepay/callback",
    method: "POST",
    handler: async (ctx, req, requestId) => {
      const url = new URL(req.url);
      const paymentId = url.searchParams.get("order_id") ?? "";
      const body = (await req.json().catch(() => ({}))) as { authority?: string };
      if (!paymentId || !body.authority) {
        return errorResponse(requestId, 400, "VALIDATION_ERROR", "پارامترهای callback ناقص است");
      }
      await ctx.runMutation(internal.jobs.enqueuePaymentVerify, {
        paymentId: paymentId as never,
        provider: "cubepay",
        providerPaymentId: body.authority,
      });
      return jsonResponse(requestId, 200, { ok: true });
    },
  },
];

export const http = httpAction(async (ctx, req) => {
  const requestId = newRequestId();
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  const path = new URL(req.url).pathname;
  for (const r of routes) {
    if (r.path === path && r.method === req.method) {
      try {
        return await r.handler(ctx, req, requestId);
      } catch (err) {
        return mapError(requestId, err);
      }
    }
    if (r.prefix && path.startsWith(r.prefix) && r.method === req.method) {
      try {
        return await r.handler(ctx, req, requestId);
      } catch (err) {
        return mapError(requestId, err);
      }
    }
  }
  return errorResponse(requestId, 404, "NOT_FOUND", "مسیر یافت نشد");
});

function buildOpenApiSpec(): Record<string, unknown> {
  const snap = getVersionSnapshot();
  return {
    openapi: "3.1.0",
    info: {
      title: `${GUARDASLI.product} API`,
      version: snap.components.api,
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
      "/api/v1/ping": { get: { summary: "سلام", responses: { "200": { description: "OK" } } } },
      "/api/v1/version": {
        get: {
          summary: "نسخه مستقل هر جزء با قالب isMAJOR.MINOR.PATCH",
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
