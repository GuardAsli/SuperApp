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
export * as wallet from "./wallet";
export * as audit from "./audit";
export * as billing from "./billing";
export * as payments from "./payments";
export * as users from "./users";
export * as providers from "./providers";
export * as telegram from "./telegram";
export * as infra from "./infra";
export * as apps from "./apps";
export * as referrals from "./referrals";
export * as auth from "./auth";
export * as tenants from "./tenants";
export * as clientApi from "./clientApi";
export * as storage from "./storage";
export * as authActions from "./authActions";
export * as botActions from "./botActions";
export * as botCommands from "./botCommands";
export * as cardActions from "./cardActions";
export * as paymentActions from "./paymentActions";
export * as telegramActions from "./telegramActions";
export * as backupAuto from "./backupAuto";
export * as jobs from "./jobs";
export * as crons from "./crons";
export * as runtime from "./runtime";
export * as workerActions from "./workerActions";
export * as provisionWorker from "./provisionWorker";
