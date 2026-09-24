// GuardAsli — E2E bot verification against a LOCAL dev backend.
// Flow proven: Telegram message -> webhook (secret) -> Convex queue -> worker
// -> bot command handler -> Telegram sendMessage/setWebhook calls (recorded as proof).
// Every bot command is covered: regular user commands (/start /help /id /me,
// unknown), admin claim via numeric ID, and all admin commands (/botinfo /bot
// on|off /setadmin /token /miniapp /webhook /stats /broadcast), including
// non-admin rejection, admin-ownership transfer, and the off-gate.
import { createServer } from "node:http";
import { appendFileSync, mkdirSync, existsSync, rmSync, readFileSync } from "node:fs";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../src/convex/_generated/api.js";

const PRODUCT = "GuardAsli";
const DEVELOPER = "AsliCode";
const API = process.env.GA_BASE ?? "http://127.0.0.1:3211"; // HTTP actions site URL
const CONVEX = process.env.GA_CONVEX ?? "http://127.0.0.1:3210"; // deployment URL for ConvexHttpClient
const TG_PORT = Number(process.env.TG_PORT ?? 8899);
const TG = `http://127.0.0.1:${TG_PORT}`;
const PROOF = process.env.GA_PROOF ?? "logs/e2e-bot-proof.jsonl";
const TGLOG = PROOF.replace(/\.jsonl$/, ".tg.jsonl");

if (!existsSync("logs")) mkdirSync("logs");
rmSync(PROOF, { force: true });
rmSync(TGLOG, { force: true });

const log = (...a) => console.log(`[${PRODUCT}]`, ...a);
const proof = (entry) => appendFileSync(PROOF, JSON.stringify(entry) + "\n");

// ---------- 1) Fake Telegram Bot API ----------
// Records every Bot API call. /sendMessage always succeeds; /setWebhook and
// /setChatMenuButton succeed only for https:// URLs (mirrors real Bot API rules,
// so the /webhook command's local-URL error path is proven too).
const tgServer = createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    appendFileSync(TGLOG, JSON.stringify({ path: req.url, body: body.slice(0, 3000) }) + "\n");
    const method = req.url?.split("?")[0];
    const send = (ok, result) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok, result }));
    };
    if (method === "/setWebhook" || method === "/setChatMenuButton") {
      try {
        const parsed = JSON.parse(body);
        const url = parsed.url ?? parsed.menu_button?.web_app?.url ?? "";
        if (!String(url).startsWith("https://")) {
          send(false, { error_code: 400, description: "Bad Request: https required" });
          return;
        }
      } catch {
        send(false, { error_code: 400, description: "Bad Request" });
        return;
      }
    }
    send(true, { message_id: 1 });
  });
});
await new Promise((r) => tgServer.listen(TG_PORT, "127.0.0.1", r));
log(`fake Telegram Bot API listening on 127.0.0.1:${TG_PORT} (log: ${TGLOG})`);

// ---------- 2) Env / prerequisites ----------
// NOTE: GUARDASLI_MASTER_SECRET is deliberately NOT required here — all crypto
// (token encryption, master-secret proofs) happens inside Convex actions using
// the deployment's own env. The script only needs an admin password to log in.
const adminPass = process.env.GUARDASLI_ADMIN_PASS ?? "";
if (!adminPass) {
  console.error("FAIL: GUARDASLI_ADMIN_PASS missing in env");
  process.exit(1);
}

// ---------- 3) Super admin login (REST, same chain as production) ----------
const loginRes = await fetch(`${API}/api/v1/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: process.env.GA_ADMIN_USER ?? "admin", password: adminPass }),
});
const login = await loginRes.json();
if (!login.accessToken) {
  console.error("FAIL: super admin login failed:", JSON.stringify(login).slice(0, 200));
  process.exit(1);
}
log(`super admin login OK (role=${login.role}, tenant=${login.tenantId})`);
proof({ step: "admin_login", ok: true, role: login.role });

// ---------- 4) Seed bot config on the admin's tenant via the real public API ----------
const client = new ConvexHttpClient(CONVEX);
const tenantId = login.tenantId;
if (!tenantId) {
  console.error("FAIL: login did not return tenantId");
  process.exit(1);
}
log(`using tenant: ${tenantId}`);

const botToken = `${Math.random().toString(36).slice(2)}:${"x".repeat(35)}`; // fake, never sent anywhere real
const saved = await client.action(api.botActions.saveBotConfigAction, {
  token: login.accessToken,
  botToken,
  displayName: "E2E Bot",
  username: "guardasli_e2e_bot",
  enabled: true,
});
const botConfigId = saved.botConfigId;
log(`bot config saved: ${botConfigId}`);
proof({ step: "bot_config_saved", ok: true, tenantId, botConfigId });

// Clear any admin id from a previous run so the claim path is exercised fresh
await client.mutation(api.telegram.botConfigSetAdmin, { token: login.accessToken });
proof({ step: "admin_cleared_for_claim" });

const postWebhook = async (payload) => {
  const res = await fetch(`${API}/api/v1/telegram/webhook/${botConfigId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-telegram-bot-api-secret-token": saved.webhookSecret,
    },
    body: JSON.stringify(payload),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

// Drain the queue FULLY: runWorkerOnce processes up to 20 jobs per call, so
// loop until a call reports zero processed (or the safety cap is hit).
const drainAll = async (maxRounds = 30) => {
  let total = 0;
  for (let i = 0; i < maxRounds; i++) {
    let r;
    try {
      r = await client.action(api.workerActions.runWorkerOnce, { token: login.accessToken });
    } catch {
      await new Promise((res) => setTimeout(res, 400));
      continue;
    }
    total += r.processed;
    if (r.processed === 0) break;
  }
  return total;
};

const sendCommand = async (chatId, text) => {
  const r = await postWebhook({
    update_id: ++updateId,
    message: { chat: { id: chatId }, from: { id: chatId }, text },
  });
  proof({ step: "webhook_post", ok: r.status === 200, cmd: text, status: r.status });
  if (r.status !== 200) {
    console.error(`FAIL: webhook rejected ${text}: HTTP ${r.status}`, JSON.stringify(r.body));
    process.exit(1);
  }
};
let updateId = 100;

const ADMIN_TG_ID = 777000;
const USER_TG_ID = 555111;

// ---------- 5) Regular user commands ----------
await sendCommand(USER_TG_ID, "/start");
await sendCommand(USER_TG_ID, "/help");
await sendCommand(USER_TG_ID, "/id");
await sendCommand(USER_TG_ID, "/me"); // unlinked -> connection hint
await sendCommand(USER_TG_ID, "/nosuchcmd"); // unknown -> guidance

// ---------- 6) Admin claim with numeric ID ----------
await sendCommand(ADMIN_TG_ID, "/admin"); // first /admin claims

// ---------- 7) Admin commands, phase 1 ----------
await sendCommand(ADMIN_TG_ID, "/admin"); // panel text
await sendCommand(ADMIN_TG_ID, "/botinfo");
await sendCommand(ADMIN_TG_ID, "/stats");
await sendCommand(ADMIN_TG_ID, "/bot off");

// ---------- 8) Off-gate ----------
// /help and /start are intentionally still allowed while OFF (informational);
// any other command is paused. /id proves the pause for regular users.
await sendCommand(USER_TG_ID, "/id"); // -> paused notice
await sendCommand(ADMIN_TG_ID, "/bot on"); // recovery from Telegram itself

// ---------- 9) Admin commands, phase 2 ----------
await sendCommand(ADMIN_TG_ID, "/miniapp https://e2e.example.com/app");
await sendCommand(ADMIN_TG_ID, "/webhook http://127.0.0.1:3211"); // non-https -> usage text
await sendCommand(ADMIN_TG_ID, "/webhook https://127.0.0.1:3211"); // https private IP -> SSRF rejection
await sendCommand(ADMIN_TG_ID, "/webhook https://e2e.example.com"); // valid https -> real setWebhook call
await sendCommand(ADMIN_TG_ID, "/token newtoken1234567890123456789012345:aaaaaaaaaaaaaaaaaaaaaaaaa");
await sendCommand(ADMIN_TG_ID, "/broadcast پیام تست نگهبان اصل");
await sendCommand(ADMIN_TG_ID, "/setadmin"); // bad usage -> usage text
await sendCommand(ADMIN_TG_ID, "/miniapp notaurl"); // bad usage -> usage text
await sendCommand(ADMIN_TG_ID, "/bot bogus"); // bad usage -> usage text

// ---------- 10) Non-admin must be rejected on admin commands ----------
await sendCommand(USER_TG_ID, "/botinfo");
await sendCommand(USER_TG_ID, "/stats");
await sendCommand(USER_TG_ID, "/bot off");
await sendCommand(USER_TG_ID, "/broadcast hidden");

// ---------- 11) Drain phase A so queued jobs execute ----------
const drainedA = await drainAll();
log(`worker drained (A): ${drainedA} job(s)`);
proof({ step: "worker_drain_a", processed: drainedA });
if (drainedA < 24) {
  console.error(`FAIL: expected >=22 jobs processed, got ${drainedA}`);
  proof({ step: "fail", reason: "incomplete_drain_a", processed: drainedA });
  tgServer.close();
  process.exit(1);
}

// ---------- 12) Admin ownership transfer: /setadmin 999888 moves the crown ----------
await sendCommand(ADMIN_TG_ID, "/setadmin 999888");
await sendCommand(ADMIN_TG_ID, "/botinfo"); // 777000 is NO LONGER admin -> rejected
await sendCommand(999888, "/botinfo"); // new admin from its own chat -> allowed
const drainedB = await drainAll();
log(`worker drained (B): ${drainedB} job(s)`);
proof({ step: "worker_drain_b", processed: drainedB });

// Restore the original admin through the WEB panel (proves web<->bot parity)
await client.mutation(api.telegram.botConfigSetAdmin, {
  token: login.accessToken,
  adminTelegramUserId: ADMIN_TG_ID,
});
proof({ step: "admin_restored_via_web_panel", adminTelegramUserId: ADMIN_TG_ID });

// ---------- 13) Token rotation still decrypts: /id must keep working ----------
await sendCommand(USER_TG_ID, "/id");
const drainedC = await drainAll();
log(`worker drained (C): ${drainedC} job(s)`);
proof({ step: "worker_drain_c", processed: drainedC });

// ---------- 14) Read back bot replies from the fake Telegram API log ----------
const tgLines = readFileSync(TGLOG, "utf8").trim().split("\n").filter(Boolean);
const tgCalls = tgLines.map((l) => JSON.parse(l));
const sendCalls = tgCalls
  .filter((e) => e.path?.includes("/sendMessage"))
  .map((e) => {
    try {
      return JSON.parse(e.body);
    } catch {
      return { raw: e.body };
    }
  });
const webhookCalls = tgCalls.filter((e) => e.path?.includes("/setWebhook"));
const menuCalls = tgCalls.filter((e) => e.path?.includes("/setChatMenuButton"));
log(`Telegram calls observed: sendMessage=${sendCalls.length} setWebhook=${webhookCalls.length} setChatMenuButton=${menuCalls.length}`);
proof({
  step: "telegram_calls",
  sendMessage: sendCalls.length,
  setWebhook: webhookCalls.length,
  setChatMenuButton: menuCalls.length,
  replies: sendCalls.map((c) => ({ chat_id: c.chat_id, text: String(c.text).slice(0, 160) })),
});
for (const c of sendCalls) {
  log(`  -> chat ${c.chat_id}: ${String(c.text).split("\n")[0].slice(0, 70)}`);
}

// ---------- 15) Assertions ----------
let failed = false;
const assert = (cond, name) => {
  proof({ step: "assert", name, ok: !!cond });
  if (!cond) {
    console.error(`FAIL: assertion '${name}'`);
    failed = true;
  } else {
    log(`assert OK: ${name}`);
  }
};
const fromUser = (marker) =>
  sendCalls.some((c) => String(c.chat_id) === String(USER_TG_ID) && String(c.text).includes(marker));
const fromAdmin = (marker) =>
  sendCalls.some((c) => String(c.chat_id) === String(ADMIN_TG_ID) && String(c.text).includes(marker));

// regular user
assert(fromUser("/help"), "user /start answered with help text");
assert(fromUser("شناسه عددی تلگرام شما"), "/id returns numeric telegram id");
assert(fromUser("متصل نیست"), "/me without linked account shows connection hint");
assert(fromUser("دستور ناشناخته"), "unknown command gets guidance");

// claim + panel
assert(fromAdmin("ادمین این ربات شدید"), "first /admin claimed admin by numeric telegram id");
assert(fromAdmin("پنل ادمین"), "second /admin shows admin panel");

// admin commands phase 1
assert(fromAdmin("E2E Bot"), "/botinfo shows bot config state");
assert(fromAdmin("کاربران ربات"), "/stats shows bot user stats");
assert(fromAdmin("خاموش شد"), "/bot off toggled the bot off");

// off-gate
assert(fromUser("ربات خاموش است"), "off-gate pauses regular user commands (/id)");
assert(fromAdmin("ربات روشن شد"), "/bot on re-enabled the bot from Telegram (recovery path)");

// admin commands phase 2
assert(fromAdmin("مینی‌اپ ثبت شد"), "/miniapp registered the mini app URL");
assert(menuCalls.length >= 1, "menu button was set for the mini app");
assert(fromAdmin("استفاده: /webhook"), "/webhook non-https URL shows usage text");
assert(fromAdmin("ناموفق بود"), "/webhook with private https IP rejected by SSRF guard");
assert(fromAdmin("webhook تنظیم شد") && webhookCalls.length >= 1, "/webhook with valid https URL registered (setWebhook called)");
assert(fromAdmin("جایگزین شد"), "/token rotated the bot token (stored encrypted)");
assert(/پیام به \d+ کاربر ارسال شد/.test(sendCalls.map((c) => c.text).join("\n")), "/broadcast delivered to linked chats");
assert(fromAdmin("استفاده: /setadmin"), "/setadmin bad usage shows usage text");
assert(fromAdmin("استفاده: /miniapp"), "/miniapp bad usage shows usage text");
assert(fromAdmin("استفاده: /bot"), "/bot bad usage shows usage text");

// rejection paths (non-admin)
for (const [cmd, marker] of [
  ["/botinfo", "فقط برای ادمین ربات است"],
  ["/stats", "فقط برای ادمین ربات است"],
  ["/bot off", "فقط برای ادمین ربات است"],
  ["/broadcast hidden", "فقط برای ادمین ربات است"],
]) {
  assert(fromUser(marker), `non-admin ${cmd.split(" ")[0]} rejected`);
}

// ownership transfer
assert(
  fromAdmin("فقط برای ادمین ربات است") &&
    sendCalls.some(
      (c) => String(c.chat_id) === String(999888) && String(c.text).includes("E2E Bot"),
    ),
  "/setadmin transfers adminship: old id rejected, new id 999888 accepted",
);

// webhook secret enforcement (negative control)
const badRes = await fetch(`${API}/api/v1/telegram/webhook/${botConfigId}`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "x-telegram-bot-api-secret-token": "wrong-secret" },
  body: JSON.stringify({ update_id: 999, message: { chat: { id: USER_TG_ID }, from: { id: USER_TG_ID }, text: "/start" } }),
});
proof({ step: "webhook_bad_secret", status: badRes.status });
assert(badRes.status !== 200, "webhook rejects wrong secret");

// token rotation actually took effect (new token decrypts -> /id still works)
assert(
  sendCalls.filter(
    (c) => String(c.chat_id) === String(USER_TG_ID) && /شناسه عددی/.test(String(c.text)),
  ).length >= 2,
  "bot still replies after token rotation (new token decrypts)",
);

if (failed) {
  tgServer.close();
  process.exit(1);
}
tgServer.close();
log("E2E bot verification PASSED — full chain: Telegram -> webhook -> Convex -> worker -> Telegram");
proof({ step: "summary", ok: true, product: PRODUCT, developer: DEVELOPER });
process.exit(0);
