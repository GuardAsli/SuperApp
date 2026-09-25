#!/usr/bin/env bun
/**
 * GuardAsli — bootstrap کامل ربات تلگرام از CLI (دستور `guardasli telegram`).
 *
 * کارهایی که اینجا خودکار می‌شود:
 *  ۱) ورود با اکانت ادمین نصب (GUARDASLI_ADMIN_USER/PASS) → نشست
 *  ۲) ثبت توکن ربات (رمزنگاری‌شده AES-256-GCM سمت بک‌اند) + شناسه عددی ادمین
 *  ۳) ثبت webhook روی تلگرام با GUARDASLI_PUBLIC_URL + secret اختصاصی
 *  ۴) گزارش نتیجه واقعی — توکن اشتباه یا دامنه https نبودن همان‌جا معلوم می‌شود
 *
 * متغیرهای لازم:
 *   GUARDASLI_BOT_TOKEN       توکن BotFather (اجباری)
 *   GUARDASLI_BOT_ADMIN_ID    شناسه عددی ادمین (اختیاری)
 *   GUARDASLI_ADMIN_USER/PASS اکانت ادمین (اجباری — همان چیزی که installer ساخت)
 *   VITE_CONVEX_URL / CONVEX_DEPLOY_KEY  برای اتصال به بک‌اند
 */
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { spawnSync } from "child_process";

const root = join(import.meta.dir, "..");

function loadEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i <= 0) continue;
    out[t.slice(0, i)] = t.slice(i + 1);
  }
  return out;
}

const env = { ...loadEnvFile(join(root, ".env")), ...loadEnvFile(join(root, ".env.local")), ...process.env };

const BOT_TOKEN = (env.GUARDASLI_BOT_TOKEN ?? "").trim();
const ADMIN_ID = (env.GUARDASLI_BOT_ADMIN_ID ?? "").trim();
const ADMIN_USER = (env.GUARDASLI_ADMIN_USER ?? "").trim();
const ADMIN_PASS = (env.GUARDASLI_ADMIN_PASS ?? "").trim();
const URL = (env.VITE_CONVEX_URL ?? "").trim();

function die(msg, hint) {
  console.error(`[bot-bootstrap] ${msg}`);
  if (hint) console.error(`[bot-bootstrap] ${hint}`);
  process.exit(1);
}

if (!/^\d{5,}:[A-Za-z0-9_-]{20,}$/.test(BOT_TOKEN)) {
  die("GUARDASLI_BOT_TOKEN is missing or not a BotFather token (expected `123456:AAH...`)");
}
if (!ADMIN_USER || !ADMIN_PASS) {
  die("GUARDASLI_ADMIN_USER / GUARDASLI_ADMIN_PASS are required", "They are created by the installer (see install.log or .env)");
}
if (!URL) {
  die("VITE_CONVEX_URL is missing", "Run 'sudo guardasli convex' first, then retry");
}

/** یک فرمان convex را اجرا می‌کند و خروجی را برمی‌گرداند. */
function convexRun(fn, argsJson) {
  const r = spawnSync("bunx", ["convex", "run", fn, argsJson], {
    cwd: root,
    env: { ...process.env, ...env },
    encoding: "utf8",
    timeout: 90_000,
  });
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  return { ok: r.status === 0, out };
}

/** مقدار نتیجه‌ی convex run را از خروجی متنی می‌کشد (آخرین JSON object). */
function extractJson(out) {
  const start = out.lastIndexOf("{");
  const end = out.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(out.slice(start, end + 1));
  } catch {
    return null;
  }
}

// ── ۱) ورود ادمین ───────────────────────────────────────────────────────────
const login = convexRun("authActions:loginAction", JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS }));
if (!login.ok) die("admin login failed — check GUARDASLI_ADMIN_USER/PASS", login.out.slice(0, 300));
const loginRes = extractJson(login.out);
const token = loginRes?.accessToken;
if (!token) die("could not read the session token from login output", login.out.slice(0, 300));

// ── ۲) ذخیره پیکربندی ربات (توکن رمزنگاری + ادمین عددی) ────────────────────
const saveArgs = {
  token,
  botToken: BOT_TOKEN,
  displayName: "GuardAsli Bot",
  enabled: true,
};
if (ADMIN_ID && /^\d{4,20}$/.test(ADMIN_ID)) saveArgs.adminTelegramUserId = Number(ADMIN_ID);
const saved = convexRun("botActions:saveBotConfigAction", JSON.stringify(saveArgs));
if (!saved.ok) die("saveBotConfigAction failed", saved.out.slice(0, 500));
const savedRes = extractJson(saved.out);
if (!savedRes?.botConfigId) die("could not read botConfigId from save output", saved.out.slice(0, 300));

console.log(`[bot-bootstrap] bot config saved: ${savedRes.botConfigId}`);

// ── ۳) ثبت خودکار webhook (اگر ذخیره آن را ست نکرده باشد) ──────────────────
if (savedRes.webhookUrl) {
  console.log(`[bot-bootstrap] webhook registered: ${savedRes.webhookUrl}`);
} else {
  const wh = convexRun("botActions:setBotWebhookAction", JSON.stringify({ token }));
  if (wh.ok) {
    const whRes = extractJson(wh.out);
    console.log(`[bot-bootstrap] webhook registered: ${whRes?.webhookUrl ?? "(done)"}`);
  } else {
    die("webhook registration failed — GUARDASLI_PUBLIC_URL must be https:// of your domain", wh.out.slice(0, 400));
  }
}

console.log("[bot-bootstrap] done — send /start to your bot in Telegram");
