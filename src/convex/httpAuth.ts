/** GuardAsli — REST auth/health برای /api/v1: health با پروب واقعی DB، register، login، refresh. */
import { internal, api } from "./_generated/api";
import { internalQuery } from "./_generated/server";

type Headers = Record<string, string>;

/** پروب واقعی دیتابیس — در ctx یک internalQuery اجرا می‌شود (نه httpAction). */
const dbProbe = internalQuery({
  args: {},
  handler: async (ctx) => {
    const settings = await ctx.db
      .query("systemSettings")
      .withIndex("by_key", (q) => q.eq("key", "cors_origins"))
      .first();
    void settings;
    return true;
  },
});

/** ساخت پاسخ JSON استاندارد با requestId و هدرهای امنیتی. */
function jsonResponse(requestId: string, status: number, body: unknown, headers: Headers): Response {
  return new Response(JSON.stringify({ ...(body as object), requestId }), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

function errorResponse(requestId: string, status: number, code: string, message: string, headers: Headers): Response {
  return jsonResponse(requestId, status, { code, message, requestId }, headers);
}

/** نگاشت خطا به کد/وضعیت استاندارد — بدون افشای جزئیات داخلی. */
function mapError(requestId: string, err: unknown, headers: Headers): Response {
  const msg = err instanceof Error ? err.message : String(err);
  const known: Array<[string, number]> = [
    ["UNAUTHENTICATED", 401], ["FORBIDDEN", 403], ["NOT_FOUND", 404], ["CONFLICT", 409],
    ["VALIDATION_ERROR", 400], ["QUOTA_EXCEEDED", 402], ["RATE_LIMITED", 429],
  ];
  for (const [code, status] of known) {
    if (msg.startsWith(code)) {
      return errorResponse(requestId, status, code, msg.replace(`${code}: `, ""), headers);
    }
  }
  return errorResponse(requestId, 500, "INTERNAL_ERROR", "خطای داخلی سرور", headers);
}

export const healthHandler = async (ctx: {
  runQuery: (ref: unknown, args?: Record<string, unknown>) => Promise<unknown>;
}, requestId: string, headers: Headers): Promise<Response> => {
  const startedAt = Date.now();
  try {
    await ctx.runQuery(dbProbe, {});
    return jsonResponse(requestId, 200, {
      code: "OK",
      product: "GuardAsli",
      developer: "AsliCode",
      checks: { api: "ok", database: "ok" },
      latencyMs: Date.now() - startedAt,
    }, headers);
  } catch {
    return errorResponse(requestId, 503, "SERVICE_UNAVAILABLE", "دیتابیس در دسترس نیست", headers);
  }
};

async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = (await req.json()) as unknown;
    return typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** POST /api/v1/auth/register — همان زنجیره registerAction (rate-limit + scrypt + persistUser). */
export const registerHandler = async (ctx: {
  runAction: (ref: unknown, args: Record<string, unknown>) => Promise<{ userId: string; tenantId: string }>;
}, req: Request, requestId: string, headers: Headers): Promise<Response> => {
  try {
    const body = await readJson(req);
    const username = typeof body.username === "string" ? body.username : "";
    const password = typeof body.password === "string" ? body.password : "";
    const parentUsername = typeof body.parentUsername === "string" ? body.parentUsername : undefined;
    if (!username || !password) {
      return errorResponse(requestId, 400, "VALIDATION_ERROR", "username و password الزامی است", headers);
    }
    const res = (await ctx.runAction(api.authActions.registerAction, {
      username,
      password,
      ...(parentUsername ? { parentUsername } : {}),
    })) as { userId: string; tenantId: string };
    return jsonResponse(requestId, 201, { userId: res.userId, tenantId: res.tenantId }, headers);
  } catch (err) {
    return mapError(requestId, err, headers);
  }
};

/** POST /api/v1/auth/login — همان زنجیره loginAction (side-channel safe، قفل حساب، نشست ۷ روزه). */
export const loginHandler = async (ctx: {
  runAction: (ref: unknown, args: Record<string, unknown>) => Promise<unknown>;
}, req: Request, requestId: string, headers: Headers): Promise<Response> => {
  try {
    const body = await readJson(req);
    const username = typeof body.username === "string" ? body.username : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!username || !password) {
      return errorResponse(requestId, 400, "VALIDATION_ERROR", "username و password الزامی است", headers);
    }
    const res = (await ctx.runAction(api.authActions.loginAction, { username, password })) as {
      accessToken: string;
      refreshToken: string;
      role: string;
      tenantId: string;
    };
    return jsonResponse(requestId, 200, res, headers);
  } catch (err) {
    return mapError(requestId, err, headers);
  }
};

/** POST /api/v1/auth/refresh — چرخش نشست با refresh token (hash-only). */
export const refreshHandler = async (ctx: {
  runAction: (ref: unknown, args: Record<string, unknown>) => Promise<unknown>;
}, req: Request, requestId: string, headers: Headers): Promise<Response> => {
  try {
    const body = await readJson(req);
    const refreshToken = typeof body.refreshToken === "string" ? body.refreshToken : "";
    if (!refreshToken) {
      return errorResponse(requestId, 400, "VALIDATION_ERROR", "refreshToken الزامی است", headers);
    }
    const res = await ctx.runAction(api.authActions.refreshAction, { refreshToken });
    return jsonResponse(requestId, 200, res, headers);
  } catch (err) {
    return mapError(requestId, err, headers);
  }
};
