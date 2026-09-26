/**
 * GuardAsli — test-support barrel (NOT part of the deployed backend surface).
 *
 * The multi-tenant isolation harness (tests/tenantIsolation.ts) drives real
 * handler functions. Handler bodies reach sibling functions through the
 * generated `internal.*` references, which are opaque Proxies. To resolve them
 * to real implementations the harness needs a module-name → namespace map.
 * Convex's own `getFunctionName` yields e.g. "wallet:ledgerApply"; this barrel
 * supplies the "wallet" part so the harness can find the real export.
 *
 * All exports here are plain re-exports of production modules — no behavior is
 * mocked or duplicated. The underscore prefix keeps the file out of every
 * application import graph; it is referenced only from tests/.
 */
export * as wallet from "../src/convex/wallet";
export * as audit from "../src/convex/audit";
export * as billing from "../src/convex/billing";
export * as payments from "../src/convex/payments";
export * as users from "../src/convex/users";
export * as providers from "../src/convex/providers";
export * as telegram from "../src/convex/telegram";
export * as infra from "../src/convex/infra";
export * as apps from "../src/convex/apps";
export * as referrals from "../src/convex/referrals";
export * as auth from "../src/convex/auth";
export * as tenants from "../src/convex/tenants";
export * as clientApi from "../src/convex/clientApi";
export * as storage from "../src/convex/storage";
export * as authActions from "../src/convex/authActions";
export * as botActions from "../src/convex/botActions";
export * as botCommands from "../src/convex/botCommands";
export * as cardActions from "../src/convex/cardActions";
export * as paymentActions from "../src/convex/paymentActions";
export * as telegramActions from "../src/convex/telegramActions";
export * as backupAuto from "../src/convex/backupAuto";
export * as jobs from "../src/convex/jobs";
export * as crons from "../src/convex/crons";
export * as runtime from "../src/convex/runtime";
export * as workerActions from "../src/convex/workerActions";
export * as provisionWorker from "../src/convex/provisionWorker";
export * as httpApi from "../src/convex/httpApi";
