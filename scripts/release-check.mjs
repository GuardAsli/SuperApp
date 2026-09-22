#!/usr/bin/env bun
/** GuardAsli is0.0.1 — pre-release gate. */
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const root = new URL("..", import.meta.url).pathname;
let failed = 0;

function ok(msg) { console.log(`✓ ${msg}`); }
function fail(msg) { console.error(`✗ ${msg}`); failed++; }

const mustExist = [
  "src/core/identity.ts",
  "src/core/aead.ts",
  "src/core/password.ts",
  "src/core/kms.ts",
  "src/core/sidechannel.ts",
  "src/core/prodEnv.ts",
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
  "scripts/wizard.sh",
  "scripts/prod-start.sh",
  "RELEASE.json",
  "docs/RUNBOOK.md",
  "docs/SECURITY.md",
  "docs/PAYMENTS.md",
  "docs/PRODUCTION.md",
  "docs/KMS_AND_SIDECHANNEL.md",
  "README.md",
  "README.fa.md",
  "Docs.md",
  "Docs.fa.md",
  "Learn.md",
  "Learn.fa.md",
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
const scanFiles = ["README.md", "src/core/identity.ts", "package.json", "RELEASE.json"];
for (const f of scanFiles) {
  const text = readFileSync(join(root, f), "utf8");
  for (const re of banned) {
    if (re.test(text)) fail(`banned term in ${f}: ${re}`);
  }
}
ok("brand purity scan");

const aead = readFileSync(join(root, "src/core/aead.ts"), "utf8");
if (!aead.includes("hkdfSync")) fail("aead must use hkdfSync");
else ok("HKDF native");
if (!aead.includes("payment_credentials")) fail("purpose keys missing");
else ok("purpose keys");

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log("\nAll release checks passed — GuardAsli is0.0.1 FINAL");
