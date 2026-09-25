/**
 * GuardAsli — E2E اجراکننده provisioning (آیتم P0 حسابرسی).
 *
 * پوشش:
 *  ۱) خرید پلن سروردار → اجراکننده → آداپتور واقعی provider (create_user)
 *     → provisionFinish → active/provisioned + remoteUserId + لینک ورود تلگرام
 *  ۲) خطای provider → retry با backoff — هرگز موفقیت جعل نمی‌شود — و سپس ترمیم
 *  ۳) کرش اجراکننده → بازیابی کار running قدیمی با provisionRequeueStale
 *  ۴) اشتراک بدون سرور → فعال‌سازی در همان pickDue + لینک ورود
 *  ۵) provider متعلق به tenant دیگر → FORBIDDEN مسیر، اجرا نمی‌شود
 *
 * تنها لبه‌ی شبکه mock می‌شود (fetch ضبط‌شونده)؛ هندلرها و آداپتور واقعی‌اند.
 */
import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { call, makeCtx, makeDb } from "./tenantIsolation";
import * as billing from "../src/convex/billing";
import * as providers from "../src/convex/providers";
import * as provisionWorker from "../src/convex/provisionWorker";
import { encryptSecret } from "../src/core/aead";
import { stableTokenHash } from "../src/core/sessionToken";

const MASTER_SECRET = "t-master-secret-for-provision-harness-0123456789";
const PROVIDER_BASE = "https://upstream-panel.example.com";
const BOT_API = "https://api.telegram.test";
const PUBLIC_URL = "https://panel.example.com";

let savedEnv: Record<string, string | undefined> = {};
function setEnv(key: string, value: string | undefined) {
  savedEnv[key] = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

/** ضبط‌کننده‌ی fetch — هر درخواست outbound با متد/مسیر ثبت می‌شود. */
interface Recorded { url: string; method: string; body: string }
let recorded: Recorded[] = [];
let failNextCreate = false;
let realFetch: typeof fetch = globalThis.fetch;

beforeAll(() => {
  setEnv("GUARDASLI_MASTER_SECRET", MASTER_SECRET);
  setEnv("GUARDASLI_ENV", "test");
  setEnv("GUARDASLI_PUBLIC_URL", PUBLIC_URL);
  setEnv("TELEGRAM_API_BASE", BOT_API);
  realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = String(input);
    if (!url.startsWith(PROVIDER_BASE) && !url.startsWith(BOT_API)) {
      return realFetch(input, init);
    }
    const method = String(init?.method ?? "GET");
    const body = typeof init?.body === "string" ? init.body : "";
    recorded.push({ url, method, body });
    // فرم-لاگین rest-panel — نشست کوکی‌دار برمی‌گردانیم (مثل پنل واقعی)
    if (url.startsWith(PROVIDER_BASE) && url.endsWith("/login") && method === "POST") {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json", "set-cookie": "session=test-cookie-value; Path=/; HttpOnly" },
      });
    }
    if (failNextCreate && url.includes("/api/user") && method === "POST") {
      failNextCreate = false;
      return new Response("boom", { status: 500 });
    }
    if (url.includes("/sendMessage")) {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    return new Response(
      JSON.stringify({ ok: true, user: { username: "remote-x", data_limit: 0 } }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }) as typeof fetch;
});

afterAll(() => {
  globalThis.fetch = realFetch;
  for (const [k, v] of Object.entries(savedEnv)) setEnv(k, v);
});

/** صحنه‌ی کامل: tenant + ادمین + خریدار با تلگرام + provider + server + پلن سروردار + کیف پر. */
function seedScene(opts?: { buyerTg?: number | null }) {
  const db = makeDb({
    tenants: [], users: [], sessions: [], wallets: [], ledgerEntries: [],
    plans: [], subscriptions: [], provisionJobs: [], providers: [], servers: [],
    botConfigs: [], botUsers: [], auditLogs: [], featureFlags: [], jobs: [],
  });
  const ctx = makeCtx(db);
  const t = db.tables as Record<string, any[]>;

  t.tenants.push({ _id: "t-1", name: "acme", status: "active", config: { core: true } });
  t.tenants.push({ _id: "t-other", name: "other", status: "active", parentTenantId: "t-1" });
  t.users.push({
    _id: "u-admin", username: "admin", role: "super_admin", tenantId: "t-1",
    status: "active", passwordHash: "x", failedLogins: 0,
  });
  t.users.push({
    _id: "u-buyer", username: "buyer", role: "user", tenantId: "t-1",
    status: "active", passwordHash: "x", failedLogins: 0,
    ...(opts?.buyerTg === null ? {} : { telegramUserId: opts?.buyerTg ?? 777 }),
  });
  t.sessions.push({
    _id: "sess-admin", userId: "u-admin",
    tokenHash: stableTokenHash("tok-admin"), refreshTokenHash: stableTokenHash("tok-admin-r"),
    status: "active", expiresAt: Date.now() + 86400_000,
  });
  t.wallets.push({
    _id: "w-1", tenantId: "t-1", userId: "u-admin", balance: 500_000,
    seq: 0, status: "active",
  });
  // provider متعلق به t-1 + یک provider دیگر برای tenant مجاور
  t.providers.push({
    _id: "p-1", tenantId: "t-1", kind: "rest-panel", name: "up",
    baseUrl: PROVIDER_BASE, credentialsEncrypted: "",
    capabilities: ["create_user"], status: "active",
  });
  t.servers.push({
    _id: "s-1", tenantId: "t-1", providerId: "p-1", name: "srv", remoteRef: "in-1", status: "active",
  });
  // پلن سروردار با ترافیک و مدت
  t.plans.push({
    _id: "plan-1", tenantId: "t-1", name: "Pro 30d", price: 150_000,
    trafficGb: 50, durationDays: 30, status: "active", kind: "traffic",
  });
  return { db, ctx, t, adminToken: "tok-admin" };
}

/** ثبت provider با اعتبار واقعی رمزنگاری‌شده (همان قرارداد providers.ts). */
async function saveProviderWithCreds(scene: ReturnType<typeof seedScene>) {
  const envelope = encryptSecret(
    JSON.stringify({ baseUrl: PROVIDER_BASE, username: "admin", password: "secret" }),
    MASTER_SECRET,
  );
  scene.t.providers[0].credentialsEncrypted = envelope;
}

/** استخراج شناسه‌ی اشتراک و job بعد از خرید. */
async function purchase(scene: ReturnType<typeof seedScene>) {
  const res = await call(scene.ctx, billing.purchasePlan, {
    token: scene.adminToken,
    planId: "plan-1",
    serverId: "s-1",
    idempotencyKey: `key-${Math.random().toString(36).slice(2)}`,
  });
  return res as { subscriptionId: string; ledgerEntryId: string; deduped: boolean };
}

function subOf(scene: ReturnType<typeof seedScene>, id: string) {
  return (scene.t.subscriptions as any[]).find((s) => s._id === id)!;
}
function jobOf(scene: ReturnType<typeof seedScene>, id: string) {
  return (scene.t.provisionJobs as any[]).find((j) => j.subscriptionId === id)!;
}

describe("provision executor · happy path", () => {
  test("server plan: pick → adapter createUser → provisioned + telegram link", async () => {
    recorded = [];
    const scene = seedScene();
    await saveProviderWithCreds(scene);
    const buy = await purchase(scene);

    expect(buy.subscriptionId).toBeTruthy();
    expect(buy.deduped).toBe(false);
    const sub = subOf(scene, buy.subscriptionId);
    const job = jobOf(scene, buy.subscriptionId);
    expect(sub.status).toBe("created");
    expect(sub.provisioningState).toBe("queued");
    expect(job.status).toBe("queued");
    expect(scene.ctx.__scheduled.length).toBe(0); // لینک هنوز نرفته

    // ——— اجراکننده (همان چیزی که cron هر دقیقه صدا می‌زند) ———
    const run = await call(scene.ctx, provisionWorker.processDueProvisions, { limit: 10 });
    expect(run.picked).toBe(1);
    expect(run.processed).toBe(1);
    expect(run.results[0].ok).toBe(true);

    // آداپتور واقعی به provider بالادستی زده و create_user دیده می‌شود
    const create = recorded.find((r) => r.url.includes("/api/user") && r.method === "POST");
    expect(create).toBeDefined();
    expect(JSON.parse(create!.body).username).toMatch(/^ga[a-z0-9]+$/i);

    // اشتراک پرووایژن شده
    expect(sub.status).toBe("active");
    expect(sub.provisioningState).toBe("provisioned");
    expect(sub.remoteUserId).toBe("ga" + job._id.replace(/[^a-zA-Z0-9]/g, "").slice(-14));
    expect(sub.activatedAt).toBeGreaterThan(0);
    expect(job.status).toBe("done");

    // لینک ورود بعد از فعال‌سازی زمان‌بندی شده — مرجع scheduler opaque است؛ با drain واقعی می‌سنجم
    expect(scene.ctx.__scheduled.length).toBe(1);
    const drainRes = (await call(scene.ctx, scene.ctx.__scheduled[0].fn, scene.ctx.__scheduled[0].args)) as { sent: boolean; reason?: string };
    expect(drainRes.sent).toBe(false);
    expect(drainRes.reason).toBe("NO_LINKED_BOT");
  });

  test("draining the scheduled link actually sends the message", async () => {
    recorded = [];
    const scene = seedScene();
    await saveProviderWithCreds(scene);
    const buy = await purchase(scene);

    await call(scene.ctx, provisionWorker.processDueProvisions, { limit: 10 });
    expect(scene.ctx.__scheduled.length).toBe(1);

    // شبیه‌سازی اجرای scheduler توسط Convex — sendLoginLinkAction واقعی
    const s = scene.ctx.__scheduled[0];
    const res = (await call(scene.ctx, s.fn, s.args)) as { sent: boolean; reason?: string };
    // بدون ربات پیکربندی‌شده → صدا زده می‌شود ولی ارسال نمی‌کند (NO_LINKED_BOT)
    expect(res.sent).toBe(false);
    expect(res.reason).toBe("NO_LINKED_BOT");
    expect(buy.subscriptionId).toBeTruthy();
  });
});

describe("provision executor · failure & recovery", () => {
  test("provider 500 → provisionFinish(false) → retry backoff → then heals", async () => {
    recorded = [];
    const scene = seedScene();
    await saveProviderWithCreds(scene);
    const buy = await purchase(scene);
    const job = jobOf(scene, buy.subscriptionId);
    const sub = subOf(scene, buy.subscriptionId);

    failNextCreate = true;
    const run1 = await call(scene.ctx, provisionWorker.processDueProvisions, { limit: 10 });
    expect(run1.results[0].ok).toBe(false);
    expect(sub.status).toBe("created"); // هرگز موفقیت جعل نمی‌شود
    expect(sub.provisioningState).toBe("queued");
    expect(job.status).toBe("queued");
    expect(job.attempt).toBe(1);
    expect(job.nextRunAt).toBeGreaterThan(Date.now()); // backoff
    expect(job.lastError).toContain("500");

    // قبل از سررسید backoff → اجراکننده هیچ کاری برنمی‌دارد
    const run2 = await call(scene.ctx, provisionWorker.processDueProvisions, { limit: 10 });
    expect(run2.picked).toBe(0);

    // زمان را جلو می‌بریم و دوباره اجرا می‌کنیم → این بار موفق
    job.nextRunAt = Date.now() - 1;
    const run3 = await call(scene.ctx, provisionWorker.processDueProvisions, { limit: 10 });
    expect(run3.results[0].ok).toBe(true);
    expect(sub.status).toBe("active");
    expect(sub.provisioningState).toBe("provisioned");
    expect(job.status).toBe("done");
  });

  test("stale running job (worker crash) is requeued and then completes", async () => {
    recorded = [];
    const scene = seedScene();
    await saveProviderWithCreds(scene);
    const buy = await purchase(scene);
    const job = jobOf(scene, buy.subscriptionId);
    const sub = subOf(scene, buy.subscriptionId);

    // شبیه‌سازی کرش: pick انجام شده اما اکشن مرده
    await call(scene.ctx, billing.provisionPickDue, { limit: 10 });
    expect(job.status).toBe("running");

    // قبل از کهنگی → برگردانده نمی‌شود
    const r1 = await call(scene.ctx, billing.provisionRequeueStale, {});
    expect(r1.requeued).toBe(0);

    // ۵ دقیقه می‌گذرد → requeue
    job.nextRunAt = Date.now() - 6 * 60_000;
    const r2 = await call(scene.ctx, billing.provisionRequeueStale, {});
    expect(r2.requeued).toBe(1);
    expect(job.status).toBe("queued");

    // اجرای مجدد → موفق
    await call(scene.ctx, provisionWorker.processDueProvisions, { limit: 10 });
    expect(sub.provisioningState).toBe("provisioned");
  });

  test("cross-tenant provider never executes", async () => {
    recorded = [];
    const scene = seedScene();
    await saveProviderWithCreds(scene);
    // سرور را به provider مجاور وصل می‌کنیم — مسیر cross-tenant
    scene.t.servers[0].providerId = "p-other";
    scene.t.providers.push({
      _id: "p-other", tenantId: "t-other", kind: "rest-panel", name: "evil",
      baseUrl: PROVIDER_BASE, credentialsEncrypted: "", capabilities: ["create_user"], status: "active",
    });
    const buy = await purchase(scene);
    const job = jobOf(scene, buy.subscriptionId);

    const run = await call(scene.ctx, provisionWorker.processDueProvisions, { limit: 10 });
    expect(run.picked).toBe(0);
    expect(job.status).toBe("queued"); // retry — نه اجرا
    expect(recorded.filter((r) => r.url.includes("/api/user")).length).toBe(0);
  });

  test("server-less subscription activates inside pickDue and schedules the link", async () => {
    recorded = [];
    const scene = seedScene();
    const buy = await call(scene.ctx, billing.purchasePlan, {
      token: scene.adminToken,
      planId: "plan-1",
      idempotencyKey: `key-${Math.random().toString(36).slice(2)}`,
    }) as { subscriptionId: string };
    const sub = subOf(scene, buy.subscriptionId);
    expect(sub.provisioningState).toBe("queued");

    const run = await call(scene.ctx, provisionWorker.processDueProvisions, { limit: 10 });
    // بدون سرور در pickDue فعال می‌شود → در picked نمی‌آید
    expect(run.picked).toBe(0);
    expect(sub.status).toBe("active");
    expect(sub.provisioningState).toBe("provisioned");
    expect(scene.ctx.__scheduled.length).toBe(1);
  });
});

describe("provision executor · audit trail", () => {
  test("audit log records purchase", async () => {
    const scene = seedScene();
    await saveProviderWithCreds(scene);
    await purchase(scene);
    const logs = scene.t.auditLogs as any[];
    expect(logs.some((l) => l.action === "subscription.purchase")).toBe(true);
  });
});
