/**
 * GuardAsli — real-handler multi-tenancy isolation harness.
 *
 * Unlike a duplicated logic harness, this drives the REAL exported handler
 * functions from src/convex/* through a simulated Convex ctx. `ctx.db`
 * implements the small subset of the Convex data model the handlers use
 * (get / insert / patch / delete / query().withIndex().eq().unique()/collect()),
 * and `ctx.runQuery`/`ctx.runMutation` dispatch to the real internal handlers,
 * so every permission/scope check that production code performs is exercised.
 */
import { stableTokenHash } from "../src/core/sessionToken";
import type { TenantRef } from "../src/core/tenantScope";

// ————— Minimal Convex-like document database —————

type Doc = { _id: string; [k: string]: unknown };
type Table = Doc[];

export function makeDb(tables: Record<string, Table>) {
  const byId = new Map<string, Doc>();
  const indexAll = () => {
    for (const rows of Object.values(tables)) {
      for (const d of rows) byId.set(d._id, d);
    }
  };
  const ensure = (name: string) => {
    tables[name] = tables[name] ?? [];
    return tables[name];
  };

  const db = {
    async get(id: string) {
      indexAll(); // scenario builders may push rows after makeDb — stay lazy
      return byId.get(id) ?? null;
    },
    async insert(table: string, doc: Record<string, unknown>) {
      const id = `${table}_${Math.random().toString(36).slice(2, 12)}`;
      const d = { _id: id, ...doc } as Doc;
      ensure(table).push(d);
      byId.set(id, d);
      return id;
    },
    async patch(id: string, data: Record<string, unknown>) {
      const d = byId.get(id);
      if (!d) throw new Error(`NOT_FOUND: ${id}`);
      // patching with undefined removes the field (Convex semantics)
      for (const [k, v] of Object.entries(data)) {
        if (v === undefined) delete d[k];
        else d[k] = v;
      }
    },
    async delete(id: string) {
      const d = byId.get(id);
      if (!d) throw new Error(`NOT_FOUND: ${id}`);
      for (const [t, rows] of Object.entries(tables)) {
        const i = rows.indexOf(d);
        if (i >= 0) {
          rows.splice(i, 1);
          void t;
        }
      }
      byId.delete(id);
    },
    query(table: string) {
      const rows = () => ensure(table);
      const makeQuery = (filtered?: Doc[]) => ({
        withIndex(_idx: string, apply?: (q: any) => any) {
          // apply(q) returns an array of {field, value} equality constraints
          const conds: Array<[string, unknown]> = apply ? (apply(eqShim) ?? []) : [];
          let out = (filtered ?? rows()).filter((d) =>
            conds.every(([k, v]) => d[k] === v),
          );
          const chain: any = {
            unique: async () => (out.length === 1 ? out[0] : out.length === 0 ? null : out[0]),
            first: async () => out[0] ?? null,
            collect: async () => [...out],
            take: async (n: number) => out.slice(0, n),
            order(dir: "asc" | "desc") {
              const cur = out;
              out = [...cur].reverse();
              void dir;
              return chain;
            },
            filter(fn: (q: any) => any) {
              out = applyFilter(out, fn);
              return chain;
            },
          };
          return chain;
        },
        collect: async () => [...(filtered ?? rows())],
        filter(fn: (q: any) => any) {
          return makeQuery(applyFilter(filtered ?? rows(), fn));
        },
      });
      return makeQuery();
    },
  };
  return { tables, db };
}

// Convex index shim: the withIndex callback is called as q.eq("field", value).
// Support chained multi-field equality (q.eq(a,b).eq(c,d)) by returning a
// chainable object whose flat pair list the filter consumes.
const eqShim: any = {
  eq: (field: string, value: unknown) => eqConstraint(field, value),
};
function eqConstraint(
  field: string,
  value: unknown,
  prev: Array<[string, unknown]> = [],
): Array<[string, unknown]> & { eq: (f: string, v: unknown) => any } {
  const pairs: Array<[string, unknown]> = [...prev, [field, value]];
  const out: any = pairs;
  out.eq = (f: string, v: unknown) => eqConstraint(f, v, pairs);
  return out;
}

/**
 * Faithful Convex FilterBuilder shim.
 *
 * Predicates return zero-arg evaluator functions; the query evaluates the
 * FINAL returned value. This reproduces Convex semantics exactly — including
 * that JS `&&` between Expression objects yields the LAST operand (a truthy
 * object), which silently drops earlier constraints: the exact production bug
 * class the isolation sweep is designed to catch.
 */
const filterShim = (doc: Doc) => {
  // A field reference resolves lazily against the current document.
  const field = (name: string) => ({ __field: name });
  const val = (e: unknown): unknown => {
    if (e && typeof e === "object" && "__field" in (e as any)) {
      return doc[(e as any).__field as string];
    }
    if (typeof e === "function") return (e as () => unknown)();
    return e;
  };
  const evalPred = (e: unknown): boolean => Boolean(val(e));
  const cmp = (l: unknown, r: unknown): number => {
    const a = val(l) as number;
    const b = val(r) as number;
    return a < b ? -1 : a > b ? 1 : 0;
  };
  const pred = (fn: () => boolean) => fn;

  const q: any = {
    field,
    and: (...es: unknown[]) => pred(() => es.every(evalPred)),
    or: (...es: unknown[]) => pred(() => es.some(evalPred)),
    not: (e: unknown) => pred(() => !evalPred(e)),
    eq: (l: unknown, r: unknown) => pred(() => val(l) === val(r)),
    neq: (l: unknown, r: unknown) => pred(() => val(l) !== val(r)),
    gt: (l: unknown, r: unknown) => pred(() => cmp(l, r) > 0),
    gte: (l: unknown, r: unknown) => pred(() => cmp(l, r) >= 0),
    lt: (l: unknown, r: unknown) => pred(() => cmp(l, r) < 0),
    lte: (l: unknown, r: unknown) => pred(() => cmp(l, r) <= 0),
  };

  // Direct property access (q.tenantId) behaves like q.field("tenantId").
  return new Proxy(q, {
    get: (t, prop) => {
      if (typeof prop !== "string") return undefined;
      return t[prop] ?? field(prop);
    },
  });
};

/** Evaluate a filter predicate the way Convex would (final expression wins). */
const applyFilter = (rows: Doc[], fn: (q: any) => unknown): Doc[] =>
  rows.filter((d) => {
    const r = fn(filterShim(d));
    return typeof r === "function" ? Boolean((r as () => boolean)()) : Boolean(r);
  });

// ————— Real-handler dispatch —————

/**
 * Real Convex function modules, imported once. Handler bodies reference other
 * functions via `internal.module.fn` — opaque anyApi Proxies from the generated
 * api.js. The harness resolves BOTH kinds of references to real handlers:
 *  - a module namespace export (e.g. wallet.ledgerApply) carries `_handler`;
 *  - an anyApi proxy exposes its path through Convex's own `getFunctionName`
 *    ("wallet:ledgerApply"), which we map back into the module namespaces.
 * No production code is mocked at the authorization level — every internal
 * chain (ledgerApply, audit.log, provisionJobEnqueue, …) executes for real.
 */
import * as harnessModules from "../src/convex/_harnessModules";
import { getFunctionName } from "convex/server";

type FnRef =
  | { _handler?: unknown; invokeQuery?: unknown; invokeAction?: unknown; invokeMutation?: unknown }
  | ((...args: any[]) => any)
  | undefined;

/** Resolve any function reference (module export OR anyApi proxy) to its real handler. */
function handlerOf(fn: unknown): (ctx: any, args: any) => Promise<any> {
  const f = fn as any;
  // Module namespace exports are Convex function wrappers (objects OR functions)
  // with the real handler attached under _handler (mutations) / invokeQuery (queries)
  // / invokeAction (node actions).
  const direct = f?._handler ?? f?.invokeQuery ?? f?.invokeAction ?? f?.invokeMutation;
  if (typeof direct === "function") return direct;
  // Opaque anyApi reference — Convex knows its path; map to the real module export.
  let name: string | null = null;
  try {
    name = getFunctionName(f);
  } catch {
    name = null;
  }
  if (name) {
    const [mod, exportName] = name.split(":");
    const ns = (harnessModules as Record<string, Record<string, unknown>>)[mod];
    const resolved = ns?.[exportName];
    if (resolved) return handlerOf(resolved);
    throw new Error(`harness has no real module for '${name}' — add it to src/convex/_harnessModules.ts`);
  }
  throw new Error(
    "handler not accessible for this function ref — pass a module export or an api/internal reference",
  );
}

export function makeCtx(db: ReturnType<typeof makeDb>) {
  const ctx: any = {
    db: db.db,
    storage: {
      async generateUploadUrl() {
        return `https://upload.test/${Math.random().toString(36).slice(2)}`;
      },
    },
  };
  ctx.runQuery = async (r: any, args: any) => handlerOf(r)(ctx, args);
  ctx.runMutation = async (r: any, args: any) => handlerOf(r)(ctx, args);
  // Node actions run the same real handlers — needed for the webhook chain
  // (botConfigSaveAction → setBotWebhookInternal → ensureBotWebhooksInternal).
  ctx.runAction = async (r: any, args: any) => handlerOf(r)(ctx, args);
  return ctx;
}

/**
 * Call a public/internal handler through the same ctx.runQuery/runMutation path
 * Convex uses. `fn` accepts either a module export or an api/internal reference
 * (both are resolved to the real handler at runtime, so the strong Convex
 * function types do not need to be widened here).
 */
export async function call(
  ctx: ReturnType<typeof makeCtx>,
  fn: unknown,
  args: Record<string, unknown>,
): Promise<any> {
  return handlerOf(fn)(ctx, args);
}

export async function expectThrows(fn: () => Promise<unknown>, marker?: string): Promise<string> {
  try {
    await fn();
  } catch (e) {
    const msg = String((e as Error).message ?? e);
    if (marker && !msg.includes(marker)) {
      throw new Error(`expected error containing '${marker}', got: ${msg}`);
    }
    return msg;
  }
  throw new Error("expected the call to throw, but it resolved");
}

// ————— Standard two-tenant scenario —————
/**
 * Core (t-core, core=true)
 *  ├── t-resA  (Reseller-A tree)  users: resA(admin of own tree), a1(user)
 *  │     └── t-subA (sub-tree of A) users: s1(user)
 *  ├── t-resB  (Reseller-B tree)  users: resB, b1(user)
 *  └── (no other connection between the trees)
 */
export interface Scenario {
  db: ReturnType<typeof makeDb>;
  ctx: ReturnType<typeof makeCtx>;
  ids: {
    tCore: string;
    tResA: string;
    tSubA: string;
    tResB: string;
    uCore: string;
    uResA: string;
    uA1: string;
    uS1: string;
    uResB: string;
    uB1: string;
  };
  tokens: { core: string; resA: string; a1: string; s1: string; resB: string; b1: string };
}

export function buildScenario(): Scenario {
  const db = makeDb({
    tenants: [],
    users: [],
    sessions: [],
    wallets: [],
    ledgerEntries: [],
    plans: [],
    subscriptions: [],
    payments: [],
    paymentCards: [],
    paymentMethods: [],
    providers: [],
    servers: [],
    botConfigs: [],
    botUsers: [],
    customDomains: [],
    apiKeys: [],
    appCustomizations: [],
    builds: [],
    backups: [],
    auditLogs: [],
    referralRules: [],
    referrals: [],
    clientDevices: [],
    userPaymentConfigs: [],
    systemSettings: [],
    featureFlags: [],
    branding: [],
    jobs: [],
  });
  const ctx = makeCtx(db);
  const t = db.tables;

  const tCore = "t-core";
  t.tenants.push({ _id: tCore, name: "core", status: "active", config: { core: true } });
  const tResA = "t-resA";
  t.tenants.push({ _id: tResA, name: "resA", status: "active", parentTenantId: tCore });
  const tSubA = "t-subA";
  t.tenants.push({ _id: tSubA, name: "subA", status: "active", parentTenantId: tResA });
  const tResB = "t-resB";
  t.tenants.push({ _id: tResB, name: "resB", status: "active", parentTenantId: tCore });

  const mkUser = (id: string, username: string, role: string, tenantId: string) => {
    t.users.push({ _id: id, username, role, tenantId, status: "active", passwordHash: "x", failedLogins: 0 });
  };
  mkUser("u-core", "core", "super_admin", tCore);
  mkUser("u-resA", "resA", "reseller", tResA);
  mkUser("u-a1", "a1", "user", tResA);
  mkUser("u-s1", "s1", "user", tSubA);
  mkUser("u-resB", "resB", "reseller", tResB);
  mkUser("u-b1", "b1", "user", tResB);

  const mkSession = (userId: string, token: string) => {
    t.sessions.push({
      _id: `sess-${token}`,
      userId,
      tokenHash: stableTokenHash(token),
      refreshTokenHash: stableTokenHash(token + "-r"),
      status: "active",
      expiresAt: Date.now() + 86400_000,
    });
  };
  const tokens = { core: "tok-core", resA: "tok-resA", a1: "tok-a1", s1: "tok-s1", resB: "tok-resB", b1: "tok-b1" };
  mkSession("u-core", tokens.core);
  mkSession("u-resA", tokens.resA);
  mkSession("u-a1", tokens.a1);
  mkSession("u-s1", tokens.s1);
  mkSession("u-resB", tokens.resB);
  mkSession("u-b1", tokens.b1);

  return {
    db,
    ctx,
    ids: { tCore, tResA, tSubA, tResB, uCore: "u-core", uResA: "u-resA", uA1: "u-a1", uS1: "u-s1", uResB: "u-resB", uB1: "u-b1" },
    tokens,
  };
}

// Re-exported for assertions in test files
export type { TenantRef };
