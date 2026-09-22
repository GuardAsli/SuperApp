#!/usr/bin/env bun
/** GuardAsli — bootstrap خودکار Super Admin اگر deployment آماده باشد. */
import { readFileSync, existsSync } from "fs";
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

const fileEnv = {
  ...loadEnvFile(join(root, ".env")),
  ...loadEnvFile(join(root, ".env.local")),
};

const url = process.env.VITE_CONVEX_URL || fileEnv.VITE_CONVEX_URL || "";
const user = process.env.GUARDASLI_ADMIN_USER || fileEnv.GUARDASLI_ADMIN_USER || "admin";
const pass =
  process.env.GUARDASLI_ADMIN_PASS || fileEnv.GUARDASLI_ADMIN_PASS || "Abcd1234!xyz";

if (!url) {
  console.warn("[bootstrap] VITE_CONVEX_URL خالی — رد شد");
  process.exit(2);
}

const argsJson = JSON.stringify({ username: user, password: pass });
const r = spawnSync(
  "bunx",
  ["convex", "run", "authActions:bootstrapAdminAction", argsJson],
  {
    cwd: root,
    env: { ...process.env, ...fileEnv },
    encoding: "utf8",
  },
);

if (r.status !== 0) {
  const err = (r.stderr || r.stdout || "").toString();
  // اگر قبلاً bootstrap شده، موفقیت نرم
  if (/already|موجود|created:\s*false|bootstrap/i.test(err) || /tenant/i.test(err)) {
    console.log("[bootstrap] احتمالاً قبلاً انجام شده:", err.slice(0, 200));
    process.exit(0);
  }
  console.error("[bootstrap] ناموفق:", err.slice(0, 500));
  process.exit(1);
}

console.log("[bootstrap] OK", (r.stdout || "").toString().slice(0, 300));
process.exit(0);
