#!/usr/bin/env bun
/**
 * GuardAsli — bootstrap مقاوم Super Admin
 * - خواندن env از .env / .env.local
 * - retry با backoff
 * - تشخیص «قبلاً bootstrap شده»
 * - اعتبارسنجی رمز قوی قبل از ارسال
 */
import { readFileSync, existsSync, writeFileSync } from "fs";
import { join } from "path";
import { spawnSync } from "child_process";

const root = join(import.meta.dir, "..");
const MAX_TRIES = 5;

function loadEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i <= 0) continue;
    let v = t.slice(i + 1);
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    out[t.slice(0, i)] = v;
  }
  return out;
}

function strongEnough(p) {
  return (
    typeof p === "string" &&
    p.length >= 12 &&
    /[a-z]/.test(p) &&
    /[A-Z]/.test(p) &&
    /[0-9]/.test(p)
  );
}

const fileEnv = {
  ...loadEnvFile(join(root, ".env")),
  ...loadEnvFile(join(root, ".env.local")),
};

const env = { ...fileEnv, ...process.env };
const url = env.VITE_CONVEX_URL || "";
const user = env.GUARDASLI_ADMIN_USER || "admin";
let pass = env.GUARDASLI_ADMIN_PASS || "";

if (!strongEnough(pass)) {
  // تولید رمز قوی و نوشتن در .env.local اگر خالی/ضعیف بود
  const { randomBytes } = await import("node:crypto");
  pass =
    "Ga" +
    randomBytes(8).toString("hex") +
    "A1";
  const envPath = join(root, ".env.local");
  if (existsSync(envPath)) {
    let text = readFileSync(envPath, "utf8");
    if (/^GUARDASLI_ADMIN_PASS=/m.test(text)) {
      text = text.replace(/^GUARDASLI_ADMIN_PASS=.*$/m, `GUARDASLI_ADMIN_PASS=${pass}`);
    } else {
      text += `\nGUARDASLI_ADMIN_PASS=${pass}\n`;
    }
    writeFileSync(envPath, text);
  }
  console.warn("[bootstrap] رمز ادمین تولید/تقویت شد و در .env.local ذخیره شد");
}

if (!url && !env.CONVEX_DEPLOY_KEY) {
  console.warn("[bootstrap] VITE_CONVEX_URL خالی — رد شد (کد ۲)");
  process.exit(2);
}

const argsJson = JSON.stringify({ username: user, password: pass });

function runOnce() {
  return spawnSync(
    "bunx",
    ["convex", "run", "authActions:bootstrapAdminAction", argsJson],
    {
      cwd: root,
      env: { ...process.env, ...fileEnv, GUARDASLI_ADMIN_PASS: pass },
      encoding: "utf8",
      timeout: 60_000,
    },
  );
}

let lastErr = "";
for (let i = 1; i <= MAX_TRIES; i++) {
  const r = runOnce();
  const out = `${r.stdout || ""}${r.stderr || ""}`;
  if (r.status === 0) {
    console.log("[bootstrap] OK", out.slice(0, 400));
    console.log(`[bootstrap] admin user=${user}`);
    process.exit(0);
  }
  lastErr = out;
  // قبلاً ساخته شده
  if (
    /created:\s*false/i.test(out) ||
    /already/i.test(out) ||
    /موجود/i.test(out) ||
    /bootstrapSystem/i.test(out)
  ) {
    console.log("[bootstrap] قبلاً انجام شده — OK");
    process.exit(0);
  }
  console.warn(`[bootstrap] تلاش ${i}/${MAX_TRIES} ناموفق`);
  if (i < MAX_TRIES) {
    const ms = 1500 * i;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  }
}

console.error("[bootstrap] ناموفق پس از retry:\n", lastErr.slice(0, 800));
process.exit(1);
