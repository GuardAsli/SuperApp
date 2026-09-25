/**
 * GuardAsli — تست‌های زنجیره‌ی webhook تلگرام.
 *
 * پوشش:
 *  ۱) ساخت پیکربندی + ثبت خودکار webhook در همان ذخیره
 *  ۲) sentinel «keep-existing»: توکن خالی نباید توکن واقعی را نابود کند
 *  ۳) پایداری webhookSecret در همه‌ی ذخیره‌ها (حتی با تعویض توکن)
 *  ۴) cron روزانه‌ی ترمیم: همه‌ی ربات‌های روشن دوباره ثبت می‌شوند
 *  ۵) خطاها: دامنه‌ی خصوصی، پاسخ خطای تلگرام، نبودن GUARDASLI_PUBLIC_URL
 *
 * تنها چیزی که mock می‌شود لبه‌ی شبکه است (fetch)؛ همه‌ی هندلرها واقعی‌اند.
 */
import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { call } from "./tenantIsolation";
import {
  MASTER_SECRET,
  botToken,
  makeWebhookHarness,
  seedAdmin,
  type Harness,
} from "./telegramWebhookHarness";
import * as botActions from "../src/convex/botActions";
import * as botCommands from "../src/convex/botCommands";
import * as telegramActions from "../src/convex/telegramActions";
import * as billing from "../src/convex/billing";
import * as payments from "../src/convex/payments";
import { stableTokenHash } from "../src/core/sessionToken";

const PUBLIC_URL = "https://panel.example.com";
const BOT_API = "https://api.telegram.test";

let savedEnv: Record<string, string | undefined> = {};
let active: Harness | null = null;

function setEnv(key: string, value: string | undefined) {
  savedEnv[key] = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

/** یک tenant + ادمین + نشست فعال؛ رشته‌ی session برمی‌گرداند. */
function addTenant(db: Harness["db"], suffix: string): string {
  const token = `tok-${suffix}`;
  const t = db.tables as Record<string, any[]>;
  t.tenants.push({ _id: `t-${suffix}`, name: suffix, status: "active", config: { core: true } });
  t.users.push({
    _id: `u-${suffix}`,
    username: `admin-${suffix}`,
    role: "super_admin",
    tenantId: `t-${suffix}`,
    status: "active",
    passwordHash: "x",
    failedLogins: 0,
  });
  t.sessions.push({
    _id: `sess-${suffix}`,
    userId: `u-${suffix}`,
    tokenHash: stableTokenHash(token),
    refreshTokenHash: stableTokenHash(token + "-r"),
    status: "active",
    expiresAt: Date.now() + 86400_000,
  });
  return token;
}

function h(): Harness {
  if (!active) throw new Error("harness not initialised");
  return active;
}

function botRows(db: Harness["db"]): any[] {
  return (db.tables as Record<string, any[]>).botConfigs;
}

beforeAll(() => {
  setEnv("GUARDASLI_MASTER_SECRET", MASTER_SECRET);
  setEnv("GUARDASLI_ENV", "test");
  setEnv("GUARDASLI_PUBLIC_URL", PUBLIC_URL);
  setEnv("TELEGRAM_API_BASE", BOT_API);
});

afterAll(() => {
  for (const [k, v] of Object.entries(savedEnv)) setEnv(k, v);
});

afterEach(() => {
  active?.cleanup();
  active = null;
  setEnv("GUARDASLI_PUBLIC_URL", PUBLIC_URL);
  // پورت‌های اختصاصی نقش — هر تست از پیش‌فرض شروع می‌شود
  setEnv("GUARDASLI_PORT_RESELLER", undefined);
  setEnv("GUARDASLI_PORT_SUPER", undefined);
});

describe("webhook · first save registers automatically", () => {
  test("saving the config sets the webhook from GUARDASLI_PUBLIC_URL", async () => {
    active = makeWebhookHarness();
    const { token } = seedAdmin(h().ctx, h().db);

    const res = await call(h().ctx, botActions.saveBotConfigAction, {
      token,
      botToken: botToken(1),
      displayName: "Bot",
      enabled: true,
    });

    expect(res.botConfigId).toBeTruthy();
    expect(res.webhookUrl).toBe(
      `${PUBLIC_URL}/api/v1/telegram/webhook/${res.botConfigId}`,
    );
    expect(h().calls.length).toBe(1);
    const call1 = h().lastCall()!;
    expect(call1.path).toBe(`/bot${botToken(1)}/setWebhook`);
    expect(call1.secretToken).toBe(res.webhookSecret);
    expect(call1.allowedUpdates).toEqual(["message", "callback_query"]);
    expect(h().calls[0].url.startsWith(BOT_API)).toBe(true);
  });

  test("the stored secret is a random 32-byte hex value", async () => {
    active = makeWebhookHarness();
    const { token } = seedAdmin(h().ctx, h().db);
    const res = await call(h().ctx, botActions.saveBotConfigAction, {
      token,
      botToken: botToken(2),
      displayName: "Bot",
      enabled: true,
    });
    expect(res.webhookSecret).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("webhook · keep-existing token", () => {
  test("a blank token field keeps the stored token and the secret", async () => {
    active = makeWebhookHarness();
    const { token } = seedAdmin(h().ctx, h().db);

    const first = await call(h().ctx, botActions.saveBotConfigAction, {
      token,
      botToken: botToken(3),
      displayName: "Bot",
      enabled: true,
    });
    const storedBefore = { ...botRows(h().db)[0] };

    // پنل وقتی فیلد توکن خالی است sentinel صفر می‌فرستد
    const second = await call(h().ctx, botActions.saveBotConfigAction, {
      token,
      botToken: "0".repeat(24),
      displayName: "Bot (renamed)",
      enabled: true,
    });

    const storedAfter = botRows(h().db)[0];
    expect(storedAfter.tokenEncrypted).toBe(storedBefore.tokenEncrypted);
    expect(storedAfter.displayName).toBe("Bot (renamed)");
    expect(botRows(h().db).length).toBe(1);
    expect(second.botConfigId).toBe(first.botConfigId);
  });

  test("a blank token on a fresh tenant is rejected instead of storing zeros", async () => {
    active = makeWebhookHarness();
    seedAdmin(h().ctx, h().db);
    let message = "";
    try {
      await call(h().ctx, botActions.saveBotConfigAction, {
        token: "tok-admin",
        botToken: "0".repeat(24),
        displayName: "Bot",
        enabled: true,
      });
    } catch (e) {
      message = String((e as Error).message);
    }
    expect(message).toContain("هنوز توکن ربات ذخیره نشده است");
    expect(botRows(h().db).length).toBe(0);
  });

  test("a too-short non-blank token is still invalid", async () => {
    active = makeWebhookHarness();
    const { token } = seedAdmin(h().ctx, h().db);
    let message = "";
    try {
      await call(h().ctx, botActions.saveBotConfigAction, {
        token,
        botToken: "short-token",
        displayName: "Bot",
        enabled: true,
      });
    } catch (e) {
      message = String((e as Error).message);
    }
    expect(message).toContain("توکن ربات نامعتبر است");
  });
});

describe("webhook · secret stability", () => {
  test("saving repeatedly never rotates the secret", async () => {
    active = makeWebhookHarness();
    const { token } = seedAdmin(h().ctx, h().db);

    const first = await call(h().ctx, botActions.saveBotConfigAction, {
      token,
      botToken: botToken(4),
      displayName: "Bot",
      enabled: true,
    });
    const second = await call(h().ctx, botActions.saveBotConfigAction, {
      token,
      botToken: "0".repeat(24),
      displayName: "Bot v2",
      enabled: true,
    });
    const third = await call(h().ctx, botActions.saveBotConfigAction, {
      token,
      botToken: "0".repeat(24),
      displayName: "Bot v3",
      enabled: false,
    });

    expect(second.webhookSecret).toBe(first.webhookSecret);
    expect(third.webhookSecret).toBe(first.webhookSecret);
    expect(botRows(h().db)[0].webhookSecret).toBe(first.webhookSecret);
    // هر ذخیره دوباره ثبت می‌شود، اما همیشه با همان secret
    const used = h().calls.map((c) => c.secretToken);
    expect(new Set(used).size).toBe(1);
    expect(used[0]).toBe(first.webhookSecret);
  });

  test("replacing the bot token keeps the same secret", async () => {
    active = makeWebhookHarness();
    const { token } = seedAdmin(h().ctx, h().db);

    const first = await call(h().ctx, botActions.saveBotConfigAction, {
      token,
      botToken: botToken(5),
      displayName: "Bot",
      enabled: true,
    });
    const storedBefore = botRows(h().db)[0].tokenEncrypted;
    const second = await call(h().ctx, botActions.saveBotConfigAction, {
      token,
      botToken: botToken(6),
      displayName: "Bot",
      enabled: true,
    });

    expect(botRows(h().db)[0].tokenEncrypted).not.toBe(storedBefore);
    expect(second.webhookSecret).toBe(first.webhookSecret);
  });
});

describe("webhook · panel action", () => {
  test("an empty base URL falls back to the server domain", async () => {
    active = makeWebhookHarness();
    const { token } = seedAdmin(h().ctx, h().db);
    const saved = await call(h().ctx, botActions.saveBotConfigAction, {
      token,
      botToken: botToken(7),
      displayName: "Bot",
      enabled: true,
    });
    h().calls.length = 0;

    const res = await call(h().ctx, botActions.setBotWebhookAction, { token });
    expect(res.webhookUrl).toBe(`${PUBLIC_URL}/api/v1/telegram/webhook/${saved.botConfigId}`);
    expect(h().lastCall()!.secretToken).toBe(saved.webhookSecret);
  });

  test("an explicit https domain wins and trailing slashes are trimmed", async () => {
    active = makeWebhookHarness();
    const { token } = seedAdmin(h().ctx, h().db);
    await call(h().ctx, botActions.saveBotConfigAction, {
      token,
      botToken: botToken(8),
      displayName: "Bot",
      enabled: true,
    });
    h().calls.length = 0;

    const res = await call(h().ctx, botActions.setBotWebhookAction, {
      token,
      publicBaseUrl: "https://other.example.com///",
    });
    expect(res.webhookUrl.startsWith("https://other.example.com/api/v1/")).toBe(true);
  });

  test("a private address is rejected with a public-domain hint", async () => {
    active = makeWebhookHarness();
    const { token } = seedAdmin(h().ctx, h().db);
    await call(h().ctx, botActions.saveBotConfigAction, {
      token,
      botToken: botToken(9),
      displayName: "Bot",
      enabled: true,
    });
    const callsBefore = h().calls.length;

    let message = "";
    try {
      await call(h().ctx, botActions.setBotWebhookAction, {
        token,
        publicBaseUrl: "https://127.0.0.1:3211",
      });
    } catch (e) {
      message = String((e as Error).message);
    }
    expect(message).toContain("PROVIDER_ERROR");
    expect(message).toContain("دامنه‌ی عمومی https");
    // هیچ فراخوانی ناموفقی به تلگرام ارسال نشد
    expect(h().calls.length).toBe(callsBefore);
  });

  test("a Telegram failure is reported with its status and body", async () => {
    active = makeWebhookHarness();
    const { token } = seedAdmin(h().ctx, h().db);
    await call(h().ctx, botActions.saveBotConfigAction, {
      token,
      botToken: botToken(10),
      displayName: "Bot",
      enabled: true,
    });
    h().calls.length = 0;
    h().failNext.status = 401;
    h().failNext.body = "Unauthorized";
    h().failNext.times = 1;

    let message = "";
    try {
      await call(h().ctx, botActions.setBotWebhookAction, { token });
    } catch (e) {
      message = String((e as Error).message);
    }
    expect(message).toContain("setWebhook HTTP 401");
    expect(message).toContain("Unauthorized");
  });

  test("a non-admin cannot set the webhook", async () => {
    active = makeWebhookHarness();
    seedAdmin(h().ctx, h().db);
    const t = h().db.tables as Record<string, any[]>;
    t.tenants.push({ _id: "t-user", name: "u", status: "active" });
    t.users.push({
      _id: "u-user",
      username: "member",
      role: "user",
      tenantId: "t-user",
      status: "active",
      passwordHash: "x",
      failedLogins: 0,
    });
    t.sessions.push({
      _id: "sess-user",
      userId: "u-user",
      tokenHash: stableTokenHash("tok-user"),
      refreshTokenHash: stableTokenHash("tok-user-r"),
      status: "active",
      expiresAt: Date.now() + 86400_000,
    });

    let message = "";
    try {
      await call(h().ctx, botActions.setBotWebhookAction, { token: "tok-user" });
    } catch (e) {
      message = String((e as Error).message);
    }
    expect(message).toContain("FORBIDDEN");
  });
});

describe("webhook · daily self-healing cron", () => {
  async function seedTwoBots(oneDisabled: boolean) {
    active = makeWebhookHarness();
    seedAdmin(h().ctx, h().db);
    const token2 = addTenant(h().db, "two");
    await call(h().ctx, botActions.saveBotConfigAction, {
      token: "tok-admin",
      botToken: botToken(11),
      displayName: "Bot A",
      enabled: true,
    });
    await call(h().ctx, botActions.saveBotConfigAction, {
      token: token2,
      botToken: botToken(12),
      displayName: "Bot B",
      enabled: !oneDisabled,
    });
    return { token2 };
  }

  test("re-registers every enabled bot and skips disabled ones", async () => {
    await seedTwoBots(true);
    const secrets = botRows(h().db).map((r) => r.webhookSecret);
    h().calls.length = 0;

    const res = await call(h().ctx, telegramActions.ensureBotWebhooksInternal, {});

    expect(res.ok).toBe(true);
    expect(res.checked).toBe(1);
    expect(res.set).toBe(1);
    expect(res.failed).toEqual([]);
    expect(h().calls.length).toBe(1);
    expect(h().lastCall()!.secretToken).toBe(secrets[0]);
    expect(h().lastCall()!.webhookUrl).toBe(
      `${PUBLIC_URL}/api/v1/telegram/webhook/${botRows(h().db)[0]._id}`,
    );
  });

  test("heals a webhook that was removed in BotFather", async () => {
    await seedTwoBots(false);
    const before = botRows(h().db).map((r) => r.webhookSecret);
    h().calls.length = 0;

    // اجرای اول: ثبت
    const firstRun = await call(h().ctx, telegramActions.ensureBotWebhooksInternal, {});
    expect(firstRun.set).toBe(2);
    expect(h().calls.length).toBe(2);

    // فرض: وب‌هوک در BotFather پاک شده — اجرای دوم باید دوباره ثبت کند
    h().calls.length = 0;
    const secondRun = await call(h().ctx, telegramActions.ensureBotWebhooksInternal, {});

    expect(secondRun.set).toBe(2);
    expect(h().calls.length).toBe(2);
    const used = h().calls.map((c) => c.secretToken).sort();
    expect(used).toEqual([...before].sort());
    // آدرس هر ربات دقیقاً مطابق شناسه‌ی خودش است
    for (const row of botRows(h().db)) {
      const seen = h().calls.find(
        (c) => c.secretToken === row.webhookSecret,
      )!;
      expect(seen.webhookUrl).toBe(`${PUBLIC_URL}/api/v1/telegram/webhook/${row._id}`);
    }
  });

  test("a broken bot does not stop the healthy ones", async () => {
    await seedTwoBots(false);
    const t = h().db.tables as Record<string, any[]>;
    t.botConfigs.push({
      _id: "botcfg-broken",
      tenantId: "t-1",
      tokenEncrypted: "not-a-valid-envelope",
      displayName: "Broken Bot",
      webhookSecret: "sec-broken",
      enabled: true,
    });
    h().calls.length = 0;

    const res = await call(h().ctx, telegramActions.ensureBotWebhooksInternal, {});

    expect(res.ok).toBe(false);
    expect(res.checked).toBe(3);
    expect(res.set).toBe(2);
    expect(res.failed.length).toBe(1);
    expect(res.failed[0]).toContain("Broken Bot");
  });

  test("without a public domain the cron reports instead of guessing", async () => {
    await seedTwoBots(false);
    h().calls.length = 0;
    setEnv("GUARDASLI_PUBLIC_URL", undefined);

    const res = await call(h().ctx, telegramActions.ensureBotWebhooksInternal, {});

    expect(res.ok).toBe(false);
    expect(res.reason).toContain("GUARDASLI_PUBLIC_URL");
    expect(res.set).toBe(0);
    expect(h().calls.length).toBe(0);
  });

  test("a domain change moves every webhook to the new URL", async () => {
    await seedTwoBots(false);
    h().calls.length = 0;
    setEnv("GUARDASLI_PUBLIC_URL", "https://new-domain.example.com");

    const res = await call(h().ctx, telegramActions.ensureBotWebhooksInternal, {});

    expect(res.set).toBe(2);
    for (const c of h().calls) {
      expect(c.webhookUrl.startsWith("https://new-domain.example.com/api/v1/")).toBe(true);
    }
    const res2 = await call(h().ctx, telegramActions.ensureBotWebhooksInternal, {});
    expect(res2.set).toBe(2);
  });
});

describe("webhook · bot command", () => {
  async function seedAdminBot(adminTelegramUserId = 42) {
    active = makeWebhookHarness();
    const { token } = seedAdmin(h().ctx, h().db);
    const saved = await call(h().ctx, botActions.saveBotConfigAction, {
      token,
      botToken: botToken(13),
      displayName: "Bot",
      enabled: true,
      adminTelegramUserId,
    });
    return { token, saved };
  }

  test("/webhook with no argument uses the server domain", async () => {
    const { saved } = await seedAdminBot();
    h().calls.length = 0;
    h().messages.length = 0;

    const res = await call(h().ctx, botCommands.handleBotCommand, {
      botConfigId: saved.botConfigId as never,
      chatId: "42",
      text: "/webhook",
      telegramUserId: 42,
    });

    expect(res.ok).toBe(true);
    expect(h().calls.length).toBe(1);
    expect(h().lastCall()!.webhookUrl).toBe(
      `${PUBLIC_URL}/api/v1/telegram/webhook/${saved.botConfigId}`,
    );
    expect(h().lastCall()!.secretToken).toBe(saved.webhookSecret);
    expect(h().messages.join("\n")).toContain("✅");
  });

  test("/webhook with an explicit domain registers that domain", async () => {
    const { saved } = await seedAdminBot(43);
    h().calls.length = 0;
    h().messages.length = 0;

    await call(h().ctx, botCommands.handleBotCommand, {
      botConfigId: saved.botConfigId as never,
      chatId: "43",
      text: "/webhook https://bot.example.com",
      telegramUserId: 43,
    });

    expect(h().lastCall()!.webhookUrl).toBe(
      `https://bot.example.com/api/v1/telegram/webhook/${saved.botConfigId}`,
    );
    expect(h().lastCall()!.secretToken).toBe(saved.webhookSecret);
  });

  test("/webhook with a private address explains why it failed", async () => {
    const { saved } = await seedAdminBot(44);
    h().calls.length = 0;
    h().messages.length = 0;

    await call(h().ctx, botCommands.handleBotCommand, {
      botConfigId: saved.botConfigId as never,
      chatId: "44",
      text: "/webhook https://192.168.1.10",
      telegramUserId: 44,
    });

    expect(h().calls.length).toBe(0);
    expect(h().messages.join("\n")).toContain("❌");
    expect(h().messages.join("\n")).toContain("دامنه‌ی عمومی https");
  });

  test("a non-admin chat cannot register the webhook", async () => {
    const { saved } = await seedAdminBot(42);
    h().calls.length = 0;
    h().messages.length = 0;

    await call(h().ctx, botCommands.handleBotCommand, {
      botConfigId: saved.botConfigId as never,
      chatId: "99",
      text: "/webhook",
      telegramUserId: 99,
    });

    expect(h().calls.length).toBe(0);
  });
});

// ————— لینک ورود نقش‌محور: /login دستی + ارسال خودکار بعد از خرید —————

/** اجرای کارهای زمان‌بندی‌شده‌ی mutation (شبیه‌سازی commit → scheduler). */
async function drainScheduled(hh: Harness) {
  const queued = [...hh.ctx.__scheduled];
  hh.ctx.__scheduled.length = 0;
  for (const s of queued) {
    await call(hh.ctx, s.fn as never, s.args);
  }
  return queued.length;
}

/**
 * tenant + ادمین (u-1، همیشه super_admin برای مدیریت ربات) + ربات فعال
 * + یک کاربر خریدار جدا با نقش/چت تلگرام دلخواه.
 */
async function seedBuyer(opts?: {
  role?: string;
  telegramUserId?: number | null;
  withBot?: boolean;
}) {
  active = makeWebhookHarness();
  const { token } = seedAdmin(h().ctx, h().db);
  const t = h().db.tables as Record<string, any[]>;
  // جدول‌هایی که در این describe استفاده می‌شوند (makeDb آن‌ها را lazy می‌سازد)
  t.botUsers = t.botUsers ?? [];
  t.subscriptions = t.subscriptions ?? [];
  t.provisionJobs = t.provisionJobs ?? [];
  t.wallets = t.wallets ?? [];
  t.payments = t.payments ?? [];

  const role = opts?.role ?? "super_admin";
  const tg = opts?.telegramUserId === null ? undefined : (opts?.telegramUserId ?? 555111);
  const buyerId = "u-buyer";
  t.users.push({
    _id: buyerId,
    username: "buyer",
    role,
    tenantId: "t-1",
    status: "active",
    passwordHash: "x",
    failedLogins: 0,
    ...(tg !== undefined ? { telegramUserId: tg } : {}),
  });

  let saved: any = null;
  if (opts?.withBot !== false) {
    saved = await call(h().ctx, botActions.saveBotConfigAction, {
      token,
      botToken: botToken(20),
      displayName: "Bot",
      enabled: true,
    });
    if (tg !== undefined) {
      t.botUsers.push({
        _id: "bu-1",
        botConfigId: saved.botConfigId,
        telegramUserId: tg,
        platformUserId: buyerId,
        state: "linked",
      });
    }
  }
  return { token, saved, userId: buyerId as string, tenantId: "t-1" as string };
}

describe("login link · /login command", () => {
  test("a linked super_admin gets the scoped :616 entry link", async () => {
    const { saved } = await seedBuyer({ role: "super_admin", telegramUserId: 42 });
    h().messages.length = 0;

    const res = await call(h().ctx, botCommands.handleBotCommand, {
      botConfigId: saved.botConfigId as never,
      chatId: "42",
      text: "/login",
      telegramUserId: 42,
    });

    expect(res.ok).toBe(true);
    const text = h().messages.join("\n");
    expect(text).toContain("https://panel.example.com:616/#/auth");
    expect(text).toContain("سوپر ادمین");
    expect(text).toContain("Coded by AsliCode");
    expect(text).not.toContain("Powered");
    // لینک عمومی هرگز به ادمین سوپر داده نمی‌شود
    expect(text).not.toContain("https://panel.example.com/#/auth");
  });

  test("a linked reseller gets the scoped :105 entry link", async () => {
    const { saved } = await seedBuyer({ role: "reseller", telegramUserId: 77 });
    h().messages.length = 0;

    await call(h().ctx, botCommands.handleBotCommand, {
      botConfigId: saved.botConfigId as never,
      chatId: "77",
      text: "/login",
      telegramUserId: 77,
    });

    const text = h().messages.join("\n");
    expect(text).toContain("https://panel.example.com:105/#/auth");
    expect(text).toContain("نماینده");
  });

  test("a linked normal user gets the open login link without any port", async () => {
    const { saved } = await seedBuyer({ role: "user", telegramUserId: 88 });
    h().messages.length = 0;

    await call(h().ctx, botCommands.handleBotCommand, {
      botConfigId: saved.botConfigId as never,
      chatId: "88",
      text: "/login",
      telegramUserId: 88,
    });

    const text = h().messages.join("\n");
    expect(text).toContain("https://panel.example.com/#/auth");
    expect(text).not.toContain(":616");
    expect(text).not.toContain(":105");
  });

  test("an unlinked chat gets the connection hint instead of any link", async () => {
    const { saved } = await seedBuyer({ role: "user", telegramUserId: 88 });
    h().messages.length = 0;

    await call(h().ctx, botCommands.handleBotCommand, {
      botConfigId: saved.botConfigId as never,
      chatId: "999",
      text: "/login",
      telegramUserId: 999,
    });

    const text = h().messages.join("\n");
    expect(text).toContain("حسابی به این چت متصل نیست");
    expect(text).not.toContain("https://");
  });

  test("without GUARDASLI_PUBLIC_URL the command explains instead of leaking", async () => {
    const { saved } = await seedBuyer({ role: "user", telegramUserId: 88 });
    h().messages.length = 0;
    setEnv("GUARDASLI_PUBLIC_URL", undefined);

    await call(h().ctx, botCommands.handleBotCommand, {
      botConfigId: saved.botConfigId as never,
      chatId: "88",
      text: "/login",
      telegramUserId: 88,
    });

    const text = h().messages.join("\n");
    expect(text).toContain("لینک ورود آماده نیست");
    expect(text).not.toContain("https://");
  });

  test("/login is advertised in the public help text", async () => {
    const { saved } = await seedBuyer({ role: "user", telegramUserId: 88 });
    h().messages.length = 0;

    await call(h().ctx, botCommands.handleBotCommand, {
      botConfigId: saved.botConfigId as never,
      chatId: "88",
      text: "/help",
      telegramUserId: 88,
    });

    expect(h().messages.join("\n")).toContain("/login");
  });

  test("custom operator ports are respected so the link matches nginx", async () => {
    const { saved } = await seedBuyer({ role: "reseller", telegramUserId: 77 });
    h().messages.length = 0;
    setEnv("GUARDASLI_PORT_RESELLER", "8443");
    setEnv("GUARDASLI_PORT_SUPER", "9443");

    await call(h().ctx, botCommands.handleBotCommand, {
      botConfigId: saved.botConfigId as never,
      chatId: "77",
      text: "/login",
      telegramUserId: 77,
    });

    const text = h().messages.join("\n");
    expect(text).toContain("https://panel.example.com:8443/#/auth");
    expect(text).not.toContain(":105");
  });

  test("an invalid port env falls back to the default instead of building a broken link", () => {
    setEnv("GUARDASLI_PORT_SUPER", "not-a-port");
    expect(botCommands.loginUrlForRole("super_admin").url).toBe(`${PUBLIC_URL}:616/#/auth`);
  });
});

describe("login link · auto-send after purchase/activation", () => {
  test("provisionFinish success delivers the role link to the buyer's chat", async () => {
    const { saved, userId, tenantId } = await seedBuyer({ role: "super_admin", telegramUserId: 555111 });
    const t = h().db.tables as Record<string, any[]>;
    t.botUsers = t.botUsers ?? [];
    t.subscriptions = t.subscriptions ?? [];
    t.provisionJobs = t.provisionJobs ?? [];
    t.subscriptions.push({
      _id: "sub-1", tenantId, userId, planId: "plan-1",
      status: "pending", provisioningState: "provisioning",
    });
    t.provisionJobs.push({
      _id: "job-1", tenantId, subscriptionId: "sub-1",
      attempt: 0, maxAttempts: 5, nextRunAt: Date.now(), status: "queued",
    });
    h().messages.length = 0;

    const r = await call(h().ctx, billing.provisionFinish as never, {
      jobId: "job-1", success: true, remoteUserId: "u-9",
    });
    expect(r.ok).toBe(true);
    expect(t.subscriptions.find((s) => s._id === "sub-1")!.status).toBe("active");

    // mutation فقط زمان‌بندی می‌کند؛ اجرای زمان‌بندی‌شده پیام را می‌فرستد
    expect(await drainScheduled(h())).toBe(1);

    const linkMsg = h().messages.find((m) => m.includes("https://"));
    expect(linkMsg).toBeDefined();
    expect(linkMsg!).toContain("https://panel.example.com:616/#/auth");
    expect(linkMsg!).toContain("این آدرس فقط برای خودتان است");
    expect(linkMsg!).toContain("Coded by AsliCode");
    // botConfigId همان رباتِ tenant است
    expect(saved.botConfigId).toBeTruthy();
  });

  test("a buyer without a Telegram chat gets nothing and no error", async () => {
    const { userId, tenantId } = await seedBuyer({ role: "user", telegramUserId: null });
    const t = h().db.tables as Record<string, any[]>;
    t.subscriptions = t.subscriptions ?? [];
    t.provisionJobs = t.provisionJobs ?? [];
    t.subscriptions.push({
      _id: "sub-2", tenantId, userId, planId: "plan-1",
      status: "pending", provisioningState: "provisioning",
    });
    t.provisionJobs.push({
      _id: "job-2", tenantId, subscriptionId: "sub-2",
      attempt: 0, maxAttempts: 5, nextRunAt: Date.now(), status: "queued",
    });
    h().messages.length = 0;

    await call(h().ctx, billing.provisionFinish as never, {
      jobId: "job-2", success: true,
    });
    await drainScheduled(h());

    expect(h().messages.length).toBe(0);
  });

  test("provisionRun without a server also schedules the link delivery", async () => {
    const { userId, tenantId } = await seedBuyer({ role: "user", telegramUserId: 555111 });
    const t = h().db.tables as Record<string, any[]>;
    t.subscriptions = t.subscriptions ?? [];
    t.provisionJobs = t.provisionJobs ?? [];
    t.subscriptions.push({
      _id: "sub-3", tenantId, userId, planId: "plan-1",
      status: "pending", provisioningState: "queued",
    });
    t.provisionJobs.push({
      _id: "job-3", tenantId, subscriptionId: "sub-3",
      attempt: 0, maxAttempts: 5, nextRunAt: Date.now(), status: "queued",
    });
    h().messages.length = 0;

    const r = await call(h().ctx, billing.provisionRun as never, { jobId: "job-3" });
    expect(r.ok).toBe(true);
    expect(t.subscriptions.find((s) => s._id === "sub-3")!.status).toBe("active");

    await drainScheduled(h());
    const linkMsg = h().messages.find((m) => m.includes("https://"));
    expect(linkMsg).toBeDefined();
    // کاربر عادی → لینک بدون پورت
    expect(linkMsg!).toContain("https://panel.example.com/#/auth");
    expect(linkMsg!).not.toContain(":616");
    expect(linkMsg!).not.toContain(":105");
  });

  test("approving a card-to-card payment schedules the buyer's link", async () => {
    const { token, userId, tenantId } = await seedBuyer({ role: "super_admin", telegramUserId: 555111 });
    const t = h().db.tables as Record<string, any[]>;
    t.wallets = t.wallets ?? [];
    t.payments = t.payments ?? [];
    t.wallets.push({ _id: "w-1", userId, balance: 0, status: "active" });
    t.payments.push({
      _id: "pay-1", tenantId, userId, method: "card_to_card",
      amount: 5000, status: "pending_review", attemptCount: 0, createdAt: Date.now(),
    });
    h().messages.length = 0;

    const r = await call(h().ctx, payments.cardReview as never, {
      token, paymentId: "pay-1", decision: "approve",
    });
    expect(r.ok).toBe(true);
    expect(t.wallets.find((w) => w._id === "w-1")!.balance).toBe(5000);

    await drainScheduled(h());
    const linkMsg = h().messages.find((m) => m.includes("https://"));
    expect(linkMsg).toBeDefined();
    expect(linkMsg!).toContain("https://panel.example.com:616/#/auth");
  });

  test("a provider-paid deposit schedules the buyer's link too", async () => {
    const { userId, tenantId } = await seedBuyer({ role: "reseller", telegramUserId: 555111 });
    const t = h().db.tables as Record<string, any[]>;
    t.wallets = t.wallets ?? [];
    t.payments = t.payments ?? [];
    t.wallets.push({ _id: "w-2", userId, balance: 0, status: "active" });
    t.payments.push({
      _id: "pay-2", tenantId, userId, method: "cubepay",
      amount: 7000, status: "awaiting_verify", providerPaymentId: "pp-9", attemptCount: 0, createdAt: Date.now(),
    });
    h().messages.length = 0;

    const r = await call(h().ctx, payments.acceptProviderPayment as never, {
      paymentId: "pay-2", expectedAmount: 7000, providerPaymentId: "pp-9",
    });
    expect(r.ok).toBe(true);

    await drainScheduled(h());
    const linkMsg = h().messages.find((m) => m.includes("https://"));
    expect(linkMsg).toBeDefined();
    expect(linkMsg!).toContain("https://panel.example.com:105/#/auth");
  });

  test("a Telegram failure never breaks the payment flow (non-blocking notify)", async () => {
    const { userId, tenantId } = await seedBuyer({ role: "user", telegramUserId: 555111 });
    const t = h().db.tables as Record<string, any[]>;
    t.wallets = t.wallets ?? [];
    t.payments = t.payments ?? [];
    t.wallets.push({ _id: "w-3", userId, balance: 0, status: "active" });
    t.payments.push({
      _id: "pay-3", tenantId, userId, method: "card_to_card",
      amount: 3000, status: "pending_review", attemptCount: 0, createdAt: Date.now(),
    });
    h().messages.length = 0;
    // شبکه‌ی تلگرام را خراب می‌کنیم؛ کارت همچنان تایید و شارژ می‌شود
    h().failNext.status = 500;
    h().failNext.times = 1;
    // توجه: failNext فقط setWebhook را خراب می‌کند؛ sendMessage را با
    // جایگزینی موقت fetch برای همین آزمون خراب می‌کنیم.
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (input: any, init?: any) => {
      if (String(input).includes("/sendMessage")) {
        return new Response("boom", { status: 500 });
      }
      return realFetch(input as any, init as any);
    }) as typeof fetch;
    try {
      const r = await call(h().ctx, payments.cardReview as never, {
        token: "tok-admin", paymentId: "pay-3", decision: "approve",
      });
      expect(r.ok).toBe(true);
      await drainScheduled(h());
      expect(t.payments.find((p) => p._id === "pay-3")!.status).toBe("paid");
      expect(t.wallets.find((w) => w._id === "w-3")!.balance).toBe(3000);
      // پیام موفق ارسال نشده ولی هیچ استثنایی به سطح mutation نرسید
      expect(h().messages.find((m) => m.includes("https://"))).toBeUndefined();
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});
