#!/usr/bin/env bun
/** GuardAsli — چک env production بدون deploy. */
import { validateProductionEnv, isProductionEnv } from "../src/core/prodEnv.ts";

process.env.GUARDASLI_ENV = process.env.GUARDASLI_ENV || "production";
process.env.NODE_ENV = process.env.NODE_ENV || "production";

const r = validateProductionEnv();
console.log("production mode:", isProductionEnv());
for (const w of r.warnings) console.warn("WARN:", w);
for (const e of r.errors) console.error("ERR:", e);
if (!r.ok) {
  console.error("FAIL: production env incomplete");
  process.exit(1);
}
console.log("OK: production env valid");
