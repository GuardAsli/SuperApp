#!/usr/bin/env bun
/** GuardAsli — pre-release gate checks (no network secrets). */
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const root = new URL("..", import.meta.url).pathname;
let failed = 0;

function ok(msg) {
  console.log(`✓ ${msg}`);
}
function fail(msg) {
  console.error(`✗ ${msg}`);
  failed++;
}

const mustExist = [
  "src/core/identity.ts",
  "src/convex/schema.ts",
  "src/convex/auth.ts",
  "src/convex/wallet.ts",
  "src/convex/payments.ts",
  "src/convex/paymentActions.ts",
  "src/convex/billing.ts",
  "src/convex/workerActions.ts",
  "src/convex/crons.ts",
  "src/core/payments/cubepay.ts",
  "src/core/payments/tetraminator.ts",
  "scripts/cli.mjs",
  "RELEASE.json",
  "docs/RUNBOOK.md",
  "docs/SECURITY.md",
  "docs/PAYMENTS.md",
];

for (const f of mustExist) {
  if (existsSync(join(root, f))) ok(`exists ${f}`);
  else fail(`missing ${f}`);
}

const identity = readFileSync(join(root, "src/core/identity.ts"), "utf8");
if (identity.includes('product: "GuardAsli"') && identity.includes('developer: "AsliCode"')) {
  ok("Core identity GuardAsli/AsliCode");
} else fail("Core identity mismatch");

const release = JSON.parse(readFileSync(join(root, "RELEASE.json"), "utf8"));
if (release.product === "GuardAsli" && release.developer === "AsliCode" && release.release === "is0.0.1") {
  ok("RELEASE.json is0.0.1");
} else fail("RELEASE.json invalid");

const banned = [/openai/i, /chatgpt/i, /anthropic/i, /claude/i, /gemini/i, /copilot/i];
const scanFiles = [
  "README.md",
  "src/core/identity.ts",
  "src/web/LandingPage.tsx",
  "package.json",
];
for (const f of scanFiles) {
  const text = readFileSync(join(root, f), "utf8");
  for (const re of banned) {
    if (re.test(text)) fail(`banned term in ${f}: ${re}`);
  }
}
ok("brand purity scan on key files");

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log("\nAll release checks passed — is0.0.1");
