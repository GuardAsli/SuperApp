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
