#!/usr/bin/env bun
/** GuardAsli — خلاصه صف jobs از طریق convex run اگر API موجود باشد. */
import { spawnSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

const root = join(import.meta.dir, "..");
function loadEnv(p) {
  if (!existsSync(p)) return {};
  const o = {};
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i > 0) o[t.slice(0, i)] = t.slice(i + 1);
  }
  return o;
}
const env = { ...loadEnv(join(root, ".env.local")), ...process.env };

const r = spawnSync(
  "bunx",
  ["convex", "run", "infra:jobStats", "{}"],
  { cwd: root, env: { ...process.env, ...env }, encoding: "utf8" },
);
if (r.status === 0) {
  console.log(r.stdout);
  process.exit(0);
}
// fallback: try internal via logs only
console.error(
  "[job-stats] deploy functions including infra.jobStats; raw:",
  (r.stderr || r.stdout || "").slice(0, 300),
);
process.exit(1);
