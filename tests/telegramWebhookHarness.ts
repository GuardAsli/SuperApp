/**
 * GuardAsli — test harness for the Telegram webhook chain.
 *
 * Drives the REAL handler chain through the isolation harness ctx:
 *   botActions.saveBotConfigAction → telegram.botConfigSave
 *   botActions.setBotWebhookAction  → telegramActions.setBotWebhookInternal → fetch(setWebhook)
 *   telegramActions.ensureBotWebhooksInternal (daily cron) → fetch(setWebhook)
 *
 * The only thing mocked is the network edge: `globalThis.fetch` is replaced by
 * a recorder that captures every Bot API setWebhook call and replies with a
 * Telegram-shaped success/failure, so tests can assert the exact URL, the
 * `secret_token` header value, and the repair behaviour — all without touching
 * the real api.telegram.org.
 */
import { makeDb, makeCtx } from "./tenantIsolation";
import { stableTokenHash } from "../src/core/sessionToken";

export interface SetWebhookCall {
  /** آدرس Bot API که صدا زده شد، مثل https://api.telegram.org/bot<token>/setWebhook */
  url: string;
  /** آدرس webhook که در بدنه‌ی درخواست ثبت می‌شود */
  webhookUrl: string;
  secretToken: string;
  allowedUpdates?: string[];
  /** full path used for the call, e.g. /bot<token>/setWebhook */
  path: string;
}

export interface Harness {
  ctx: ReturnType<typeof makeCtx>;
  db: ReturnType<typeof makeDb>;
  calls: SetWebhookCall[];
  /** متن پیام‌هایی که ربات به کاربر فرستاده (sendMessage). */
  messages: string[];
  /** Force the next N setWebhook calls to fail with this HTTP status. */
  failNext: { status: number; body?: string; times: number };
  cleanup: () => void;
  lastCall: () => SetWebhookCall | undefined;
}

const MASTER = "t-master-secret-for-webhook-harness-0123456789";

/** A valid-looking BotFather token (the code only checks length ≥ 20). */
export function botToken(n: number): string {
  return `${"1234567890"}:AAH${String(n).padStart(30, "0")}`;
}

/**
 * Install the fetch recorder and return a harness for one test.
 * Every Bot API call is captured; anything that is NOT a setWebhook call is
 * still recorded (and allowed) so unexpected traffic is visible in failures.
 */
export function makeWebhookHarness(seed?: (ctx: Harness["ctx"], db: Harness["db"]) => void): Harness {
  const db = makeDb({
    tenants: [],
    users: [],
    sessions: [],
    botConfigs: [],
    auditLogs: [],
  });
  const ctx = makeCtx(db);
  const calls: SetWebhookCall[] = [];
  const messages: string[] = [];
  const failNext = { status: 0, body: "", times: 0 };
  const realFetch = globalThis.fetch;

  globalThis.fetch = (async (input: any, init?: any) => {
    const url = String(input);
    const path = url.replace(/^https?:\/\/[^/]+/, "");
    let body: any = {};
    try {
      body = init?.body ? JSON.parse(init.body) : {};
    } catch {
      body = {};
    }
    if (path.includes("/sendMessage")) messages.push(String(body.text ?? ""));
    if (path.includes("/setWebhook")) {
      calls.push({
        url,
        webhookUrl: String(body.url ?? ""),
        secretToken: body.secret_token,
        allowedUpdates: body.allowed_updates,
        path,
      });
      if (failNext.times > 0) {
        failNext.times--;
        const status = failNext.status;
        const text = failNext.body ?? `simulated failure ${status}`;
        failNext.status = 0;
        failNext.body = "";
        return new Response(text, { status });
      }
    }
    return new Response(JSON.stringify({ ok: true, result: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  if (seed) seed(ctx, db);

  return {
    ctx,
    db,
    calls,
    messages,
    failNext,
    cleanup() {
      globalThis.fetch = realFetch;
    },
    lastCall() {
      return calls[calls.length - 1];
    },
  };
}

/** Create a tenant + super-admin user + active session; returns the token. */
export function seedAdmin(ctx: Harness["ctx"], db: Harness["db"], token = "tok-admin"): {
  token: string;
  tenantId: string;
  userId: string;
} {
  const t = db.tables as Record<string, any[]>;
  t.tenants.push({ _id: "t-1", name: "acme", status: "active", config: { core: true } });
  t.users.push({
    _id: "u-1",
    username: "admin",
    role: "super_admin",
    tenantId: "t-1",
    status: "active",
    passwordHash: "x",
    failedLogins: 0,
  });
  t.sessions.push({
    _id: "sess-1",
    userId: "u-1",
    tokenHash: stableTokenHash(token),
    refreshTokenHash: stableTokenHash(token + "-r"),
    status: "active",
    expiresAt: Date.now() + 86400_000,
  });
  void ctx;
  return { token, tenantId: "t-1", userId: "u-1" };
}

/** The 32-byte hex master secret this harness encrypts with. */
export const MASTER_SECRET = MASTER;
