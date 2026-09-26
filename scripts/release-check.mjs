#!/usr/bin/env bun
/** GuardAsli is0.0.2 — pre-release gate. */
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const root = new URL("..", import.meta.url).pathname;
let failed = 0;

function ok(msg) { console.log(`✓ ${msg}`); }
function fail(msg) { console.error(`✗ ${msg}`); failed++; }

const mustExist = [
  "docs/en/API.md",
  "docs/en/RUNBOOK.md",
  "docs/en/SECURITY.md",
  "docs/en/DEPLOYMENT.md",
  "docs/en/PAYMENTS.md",
  "docs/fa/API.md",
  "docs/fa/ARCHITECTURE.md",
  "docs/fa/BRANDING.md",
  "docs/fa/PRODUCTION.md",
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
  "scripts/guardasli.sh",
  "scripts/wizard.sh",
  "scripts/prod-start.sh",
  "RELEASE.json",
  "docs/en/RUNBOOK.md",
  "docs/en/SECURITY.md",
  "docs/en/PAYMENTS.md",
  "docs/fa/PRODUCTION.md",
  "docs/fa/KMS_AND_SIDECHANNEL.md",
  "docs/en/AUDIT.md",
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
if (release.product === "GuardAsli" && release.developer === "AsliCode" && release.release === "is0.0.2") {
  ok("RELEASE.json is0.0.2");
} else fail("RELEASE.json invalid");

// الگوهای ممنوعه به‌صورت split ساخته می‌شوند تا خودِ این فایل حاوی نام ثالث نباشد (بند ۴).
const j = (parts) => new RegExp(parts.join(""), "i");
const banned = [
  j(["open", "ai"]),
  j(["chat", "gpt"]),
  j(["anthro", "pic"]),
  j(["clau", "de"]),
  j(["gem", "ini"]),
  j(["copi", "lot"]),
  j(["nord", "vpn"]),
  j(["express", "vpn"]),
  j(["marz", "ban"]),
];
const scanFiles = [
  "README.md",
  "src/core/identity.ts",
  "package.json",
  "RELEASE.json",
  "src/core/clientExperience.ts",
  "src/core/providers/index.ts",
  "docs/fa/CLIENT_EXPERIENCE.md",
  "docs/en/AUDIT.md",
];
for (const f of scanFiles) {
  const text = readFileSync(join(root, f), "utf8");
  for (const re of banned) {
    if (re.test(text)) fail(`banned term in ${f}: ${re.source}`);
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
console.log("\nAll release checks passed — GuardAsli is0.0.2 FINAL");
