#!/usr/bin/env bun
/** GuardAsli — همگام‌سازی secrets به Convex env (در صورت امکان). */
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { spawnSync } from "child_process";

const root = join(import.meta.dir, "..");

function loadEnv(path) {
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

const env = {
  // نصب‌کننده روی VPS secrets را در <state>/.env می‌نویسد؛ ویزارد لوکال در .env.local —
  // هر دو خوانده می‌شوند تا secrets به deployment برسند و ست‌کردن webhook ربات کار کند.
  ...loadEnv(join(root, ".env")),
  ...loadEnv(join(root, ".env.local")),
  ...process.env,
};

const keys = [
  "GUARDASLI_MASTER_SECRET",
  "GUARDASLI_TOKEN_PEPPER",
  "GUARDASLI_AEAD_SALT",
  "GUARDASLI_AEAD_KID",
  "GUARDASLI_PUBLIC_URL",
  "GUARDASLI_CORS_ORIGINS",
  "GUARDASLI_ENV",
  "GUARDASLI_PRODUCT",
  "GUARDASLI_DEVELOPER",
  "GUARDASLI_VERSION",
  // پورت‌های اختصاصی نقش — تا لینک ورودی که ربات می‌فرستد با nginx هم‌خوان بماند
  "GUARDASLI_PORT_SUPER",
  "GUARDASLI_PORT_RESELLER",
  "GUARDASLI_MAIN_DOMAIN",
];

let ok = 0;
let fail = 0;
for (const k of keys) {
  const v = env[k];
  if (!v) continue;
  // convex env set NAME value
  const r = spawnSync("bunx", ["convex", "env", "set", k, v], {
    cwd: root,
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
  if (r.status === 0) {
    ok++;
    console.log(`[sync-env] set ${k}`);
  } else {
    fail++;
    // سکوت نسبی — ممکن است login نباشد
  }
}

console.log(`[sync-env] ok=${ok} fail=${fail}`);
process.exit(fail > 0 && ok === 0 ? 1 : 0);
