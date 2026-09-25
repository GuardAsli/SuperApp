/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as apps from "../apps.js";
import type * as audit from "../audit.js";
import type * as auth from "../auth.js";
import type * as authActions from "../authActions.js";
import type * as backupAuto from "../backupAuto.js";
import type * as billing from "../billing.js";
import type * as botActions from "../botActions.js";
import type * as botCommands from "../botCommands.js";
import type * as cardActions from "../cardActions.js";
import type * as clientApi from "../clientApi.js";
import type * as crons from "../crons.js";
import type * as http from "../http.js";
import type * as httpApi from "../httpApi.js";
import type * as httpAuth from "../httpAuth.js";
import type * as infra from "../infra.js";
import type * as jobs from "../jobs.js";
import type * as paymentActions from "../paymentActions.js";
import type * as payments from "../payments.js";
import type * as providers from "../providers.js";
import type * as provisionWorker from "../provisionWorker.js";
import type * as referrals from "../referrals.js";
import type * as runtime from "../runtime.js";
import type * as storage from "../storage.js";
import type * as telegram from "../telegram.js";
import type * as telegramActions from "../telegramActions.js";
import type * as tenants from "../tenants.js";
import type * as users from "../users.js";
import type * as wallet from "../wallet.js";
import type * as workerActions from "../workerActions.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  apps: typeof apps;
  audit: typeof audit;
  auth: typeof auth;
  authActions: typeof authActions;
  backupAuto: typeof backupAuto;
  billing: typeof billing;
  botActions: typeof botActions;
  botCommands: typeof botCommands;
  cardActions: typeof cardActions;
  clientApi: typeof clientApi;
  crons: typeof crons;
  http: typeof http;
  httpApi: typeof httpApi;
  httpAuth: typeof httpAuth;
  infra: typeof infra;
  jobs: typeof jobs;
  paymentActions: typeof paymentActions;
  payments: typeof payments;
  providers: typeof providers;
  provisionWorker: typeof provisionWorker;
  referrals: typeof referrals;
  runtime: typeof runtime;
  storage: typeof storage;
  telegram: typeof telegram;
  telegramActions: typeof telegramActions;
  tenants: typeof tenants;
  users: typeof users;
  wallet: typeof wallet;
  workerActions: typeof workerActions;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
