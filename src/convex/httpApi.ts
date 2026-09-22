/** GuardAsli — HTTP API با CORS محدود و rate-limit webhook. */
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { newRequestId, safeInternalMessage } from "../core/errors";
import { getVersionSnapshot, GUARDASLI } from "../core/identity";

function allowedOrigins(): string[] {
  try {
    const raw =
      typeof process !== "undefined"
        ? (process as { env?: Record<string, string> }).env?.GUARDASLI_CORS_ORIGINS
        : undefined;
    if (raw && raw.trim()) {
      return raw.split(",").map((s) => s.trim()).filter(Boolean);
    }
  } catch {
    /* */
  }
  // پیش‌فرض امن: فقط localhost توسعه؛ production باید env ست کند
  return ["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:4173"];
}

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const allow = allowedOrigins();
  const matched = allow.includes("*") ? "*" : allow.includes(origin) ? origin : allow[0] ?? "";
  const base: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Request-Id, X-Webhook-Secret",
    "Access-Control-Max-Age": "86400",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": "default-src 'none'",
    "X-Frame-Options": "DENY",
    "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
  };
  if (matched) base["Access-Control-Allow-Origin"] = matched;
  return base;
}

function jsonResponse(req: Request, requestId: string, status: number, body: unknown): Response {
  return new Response(JSON.stringify({ ...(body as object), requestId }), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

function errorResponse(req: Request, requestId: string, status: number, code: string, message: string): Response {
  return jsonResponse(req, requestId, status, { code, message, requestId });
}

function mapError(req: Request, requestId: string, err: unknown): Response {
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
      return errorResponse(req, requestId, status[code], code, msg.replace(`${code}: `, ""));
    }
  }
  return errorResponse(req, requestId, 500, "INTERNAL_ERROR", safeInternalMessage(requestId));
}

type RouteHandler = (ctx: any, req: Request, requestId: string) => Promise<Response>;
interface RouteDef { prefix?: string; path?: string; method: string; handler: RouteHandler }

async function rateWebhook(ctx: any, key: string): Promise<boolean> {
  const rl = await ctx.runMutation(internal.infra.rateLimitCheck, {
    bucketKey: key,
    windowMs: 60_000,
    maxPerWindow: 60,
  });
  return rl.allowed;
}

async function enqueueTetra(ctx: any, req: Request, requestId: string): Promise<Response> {
  if (!(await rateWebhook(ctx, "webhook:tetraminator"))) {
    return errorResponse(req, requestId, 429, "RATE_LIMITED", "webhook rate limit");
  }
  const url = new URL(req.url);
  const paymentId = url.searchParams.get("order_id") ?? "";
  let payId = url.searchParams.get("pay_id") ?? "";
  if (req.method === "POST") {
    const body = (await req.json().catch(() => ({}))) as { pay_id?: string };
    if (body.pay_id) payId = body.pay_id;
  }
  if (!paymentId) {
    return errorResponse(req, requestId, 400, "VALIDATION_ERROR", "order_id لازم است");
  }
  const payment = await ctx.runQuery(internal.payments.getPaymentInternal, {
    paymentId: paymentId as never,
  });
  const providerPaymentId = payId || payment?.providerPaymentId || "";
  if (!providerPaymentId) {
    return errorResponse(req, requestId, 400, "VALIDATION_ERROR", "pay_id لازم است");
  }
  await ctx.runMutation(internal.jobs.enqueuePaymentVerify, {
    paymentId: paymentId as never,
    provider: "tetraminator",
    providerPaymentId,
  });
  return jsonResponse(req, requestId, 200, { ok: true });
}

async function enqueueCube(ctx: any, req: Request, requestId: string): Promise<Response> {
  if (!(await rateWebhook(ctx, "webhook:cubepay"))) {
    return errorResponse(req, requestId, 429, "RATE_LIMITED", "webhook rate limit");
  }
  const url = new URL(req.url);
  const paymentId = url.searchParams.get("order_id") ?? "";
  let authority = url.searchParams.get("authority") ?? "";
  if (req.method === "POST") {
    const body = (await req.json().catch(() => ({}))) as { authority?: string };
    if (body.authority) authority = body.authority;
  }
  if (!paymentId) {
    return errorResponse(req, requestId, 400, "VALIDATION_ERROR", "order_id لازم است");
  }
  const payment = await ctx.runQuery(internal.payments.getPaymentInternal, {
    paymentId: paymentId as never,
  });
  const providerPaymentId = authority || payment?.providerPaymentId || "";
  if (!providerPaymentId) {
    return errorResponse(req, requestId, 400, "VALIDATION_ERROR", "authority لازم است");
  }
  await ctx.runMutation(internal.jobs.enqueuePaymentVerify, {
    paymentId: paymentId as never,
    provider: "cubepay",
    providerPaymentId,
  });
  return jsonResponse(req, requestId, 200, { ok: true });
}

function openApiDoc() {
  const snap = getVersionSnapshot();
  return {
    openapi: "3.1.0",
    info: {
      title: GUARDASLI.product,
      description: `Control-plane API by ${GUARDASLI.developer}`,
      version: snap.components.api,
    },
    paths: {
      "/api/v1/ping": { get: { summary: "Health", responses: { "200": { description: "OK" } } } },
      "/api/v1/version": { get: { summary: "Versions", responses: { "200": { description: "OK" } } } },
      "/api/v1/openapi.json": { get: { summary: "OpenAPI", responses: { "200": { description: "OK" } } } },
      "/api/v1/telegram/webhook/{botConfigId}": {
        post: { summary: "Telegram webhook", responses: { "200": { description: "OK" }, "401": { description: "Bad secret" } } },
      },
      "/api/v1/payments/tetraminator/webhook": {
        get: { summary: "Tetra webhook", responses: { "200": { description: "Queued" } } },
        post: { summary: "Tetra webhook POST", responses: { "200": { description: "Queued" } } },
      },
      "/api/v1/payments/cubepay/callback": {
        get: { summary: "CubePay callback", responses: { "200": { description: "Queued" } } },
        post: { summary: "CubePay callback POST", responses: { "200": { description: "Queued" } } },
      },
    },
  };
}

const routes: RouteDef[] = [
  {
    path: "/api/v1/ping",
    method: "GET",
    handler: async (_ctx, req, requestId) =>
      jsonResponse(req, requestId, 200, {
        code: "OK",
        message: `${GUARDASLI.product} API`,
        version: getVersionSnapshot().components.api,
      }),
  },
  {
    path: "/api/v1/version",
    method: "GET",
    handler: async (_ctx, req, requestId) => {
      const snap = getVersionSnapshot();
      return jsonResponse(req, requestId, 200, {
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
    handler: async (_ctx, req, requestId) => jsonResponse(req, requestId, 200, openApiDoc()),
  },
  {
    prefix: "/api/v1/telegram/webhook/",
    method: "POST",
    handler: async (ctx, req, requestId) => {
      if (!(await rateWebhook(ctx, "webhook:telegram"))) {
        return errorResponse(req, requestId, 429, "RATE_LIMITED", "webhook rate limit");
      }
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
        return errorResponse(req, requestId, 401, "UNAUTHENTICATED", "امضای webhook نامعتبر است");
      }
      const text = body.message?.text ?? "";
      const chatId = String(body.message?.chat?.id ?? body.callback_query?.from?.id ?? "");
      await ctx.runMutation(internal.jobs.dispatchBotCommand, { botConfigId, chatId, text });
      return jsonResponse(req, requestId, 200, { ok: true });
    },
  },
  { prefix: "/api/v1/payments/tetraminator/webhook", method: "GET", handler: enqueueTetra },
  { prefix: "/api/v1/payments/tetraminator/webhook", method: "POST", handler: enqueueTetra },
  { prefix: "/api/v1/payments/cubepay/callback", method: "GET", handler: enqueueCube },
  { prefix: "/api/v1/payments/cubepay/callback", method: "POST", handler: enqueueCube },
];

export const http = httpAction(async (ctx, req) => {
  const requestId = newRequestId();
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }
  const path = new URL(req.url).pathname;
  for (const r of routes) {
    if (r.path === path && r.method === req.method) {
      try {
        return await r.handler(ctx, req, requestId);
      } catch (err) {
        return mapError(req, requestId, err);
      }
    }
    if (r.prefix && path.startsWith(r.prefix) && r.method === req.method) {
      try {
        return await r.handler(ctx, req, requestId);
      } catch (err) {
        return mapError(req, requestId, err);
      }
    }
  }
  return errorResponse(req, requestId, 404, "NOT_FOUND", "مسیر یافت نشد");
});
