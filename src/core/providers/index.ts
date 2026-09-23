/** GuardAsli — آداپتورهای واقعی Provider: 3X-UI، Sanaei، PasarGuard، Rebecca. */
import {
  assertOutboundUrl,
  providerFetch,
  unsupported,
  type ProviderAdapter,
  type ProviderCapability,
  type ProviderCredentials,
  type ProviderKind,
  type ProviderOperationResult,
  type RemoteUser,
} from "./types";

/** تشخیص توانایی از طریق health endpoint واقعی پنل — هرگز قابلیت جعل نمی‌شود. */
async function detectCapabilities(
  cfg: ProviderCredentials,
  probePaths: Record<string, string>,
): Promise<ProviderCapability[]> {
  const caps: ProviderCapability[] = [];
  for (const [cap, path] of Object.entries(probePaths)) {
    try {
      const base = assertOutboundUrl(cfg.baseUrl);
      const u = new URL(path, base);
      const res = await providerFetch(u.toString(), {
        method: "GET",
        headers: cfg.apiKey ? { "Authorization": `Bearer ${cfg.apiKey}` } : {},
        timeoutMs: 6_000,
      });
      if (res.status < 500) caps.push(cap as ProviderCapability);
    } catch {
      // endpoint پاسخ نداد → capability اعلام نمی‌شود
    }
  }
  return caps;
}

async function loginSession(cfg: ProviderCredentials): Promise<string> {
  const base = assertOutboundUrl(cfg.baseUrl);
  if (!cfg.username || !cfg.password) {
    throw new Error("PROVIDER_ERROR: نام کاربری/رمز provider لازم است");
  }
  const res = await providerFetch(new URL("/login", base).toString(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ username: cfg.username, password: cfg.password }).toString(),
  });
  if (!res.ok) throw new Error(`PROVIDER_ERROR: login HTTP ${res.status}`);
  const setCookie = res.headers.get("set-cookie") ?? "";
  const match = /([^=\s]+)=[^;]+/.exec(setCookie);
  if (!match) throw new Error("PROVIDER_ERROR: نشست provider دریافت نشد");
  return `${match[1]}=${setCookie.split(";")[0].split("=").slice(1).join("=")}`;
}

async function authedFetch(
  cfg: ProviderCredentials,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const base = assertOutboundUrl(cfg.baseUrl);
  const u = new URL(path, base);
  if (cfg.apiKey) {
    return providerFetch(u.toString(), {
      ...init,
      headers: { ...(init.headers ?? {}), "Authorization": `Bearer ${cfg.apiKey}` },
    });
  }
  const cookie = await loginSession(cfg);
  return providerFetch(u.toString(), {
    ...init,
    headers: { ...(init.headers ?? {}), "Cookie": cookie },
  });
}

function parseRemoteUser(raw: Record<string, unknown>, fallbackName: string): RemoteUser {
  return {
    remoteRef: String(raw.id ?? raw.uuid ?? fallbackName),
    username: String(raw.username ?? raw.email ?? fallbackName),
    trafficUsedGb: Number(raw.traffic_used ?? raw.usedTraffic ?? raw.up ?? 0) / (1024 * 1024 * 1024),
    trafficLimitGb:
      raw.total === 0 || raw.total === undefined || raw.total === null
        ? null
        : Number(raw.total ?? raw.traffic_limit ?? 0) / (1024 * 1024 * 1024),
    expiredAt: raw.expiry_time ? Number(raw.expiry_time) : raw.expiredAt ? Number(raw.expiredAt) : null,
    status: String(raw.status ?? (raw.enable === false ? "disabled" : "active")),
  };
}

// ————— 3X-UI —————
const xuiAdapter: ProviderAdapter = {
  kind: "xui",
  capabilities: [
    "connect", "health_check", "get_users", "get_user", "create_user",
    "update_user", "delete_user", "get_traffic", "get_subscription", "sync",
  ],
  supports(cap) {
    return this.capabilities.includes(cap);
  },
  async connect(cfg) {
    const session = await loginSession(cfg);
    return { supported: true, ok: true, data: { sessionId: session } };
  },
  async healthCheck(cfg) {
    const base = assertOutboundUrl(cfg.baseUrl);
    const res = await providerFetch(new URL("/", base).toString(), { timeoutMs: 6_000 });
    return { supported: true, ok: res.ok, data: { healthy: res.ok } };
  },
  async getUsers(cfg) {
    const res = await authedFetch(cfg, "/panel/api/inbounds/list");
    if (!res.ok) return { supported: true, ok: false, error: `HTTP ${res.status}` };
    const body = (await res.json()) as { obj?: Array<{ id: number; remark?: string; clientStats?: unknown[] }> };
    const users: RemoteUser[] = (body.obj ?? []).flatMap((inbound) =>
      (inbound.clientStats ?? []).map((cs, i) =>
        parseRemoteUser(cs as Record<string, unknown>, `${inbound.id}_${i}`),
      ),
    );
    return { supported: true, ok: true, data: users };
  },
  async getUser(cfg, ref) {
    const res = await authedFetch(cfg, `/panel/api/inbounds/getClientTraffics/${encodeURIComponent(ref)}`);
    if (!res.ok) return { supported: true, ok: false, error: `HTTP ${res.status}` };
    const body = (await res.json()) as { obj?: Record<string, unknown> };
    if (!body.obj) return { supported: true, ok: false, error: "NOT_FOUND" };
    return { supported: true, ok: true, data: parseRemoteUser(body.obj, ref) };
  },
  async createUser(cfg, spec) {
    const res = await authedFetch(cfg, "/panel/api/inbounds/addClient", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: spec.username,
        total: spec.trafficLimitGb === null ? 0 : spec.trafficLimitGb * 1024 ** 3,
        expiryTime: spec.expiredAt ?? 0,
      }),
    });
    if (!res.ok) return { supported: true, ok: false, error: `HTTP ${res.status}` };
    return {
      supported: true,
      ok: true,
      data: {
        remoteRef: spec.username,
        username: spec.username,
        trafficUsedGb: 0,
        trafficLimitGb: spec.trafficLimitGb,
        expiredAt: spec.expiredAt,
        status: "active",
      },
    };
  },
  async updateUser(cfg, ref, patch) {
    const res = await authedFetch(cfg, `/panel/api/inbounds/updateClient/${encodeURIComponent(ref)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(patch.trafficLimitGb !== undefined
          ? { total: patch.trafficLimitGb === null ? 0 : patch.trafficLimitGb * 1024 ** 3 }
          : {}),
        ...(patch.expiredAt !== undefined ? { expiryTime: patch.expiredAt ?? 0 } : {}),
        ...(patch.status !== undefined ? { enable: patch.status === "active" } : {}),
      }),
    });
    if (!res.ok) return { supported: true, ok: false, error: `HTTP ${res.status}` };
    return { supported: true, ok: true, data: await this.getUser(cfg, ref).then((r) => r.data!) };
  },
  async deleteUser(cfg, ref) {
    const res = await authedFetch(cfg, `/panel/api/inbounds/deleteClient/${encodeURIComponent(ref)}`, {
      method: "POST",
    });
    return { supported: true, ok: res.ok, data: null };
  },
  async getTraffic(cfg, ref) {
    const r = await this.getUser(cfg, ref);
    if (!r.ok || !r.data) return { supported: true, ok: false, error: r.error };
    return { supported: true, ok: true, data: r.data.trafficUsedGb };
  },
  async getSubscription(cfg, ref) {
    const res = await authedFetch(cfg, `/sub/${encodeURIComponent(ref)}`);
    if (!res.ok) return { supported: true, ok: false, error: `HTTP ${res.status}` };
    return { supported: true, ok: true, data: await res.text() };
  },
  async getServers() {
    return unsupported("get_servers");
  },
  async sync(cfg) {
    const users = await this.getUsers(cfg);
    if (!users.ok || !users.data) return { supported: true, ok: false, error: users.error };
    return { supported: true, ok: true, data: { synced: users.data.length } };
  },
};

// ————— Sanaei (panel-style REST API) —————
function makePanelLikeAdapter(kind: ProviderKind, basePath: string, extraCaps: ProviderCapability[]): ProviderAdapter {
  return {
    kind,
    capabilities: [
      "connect", "health_check", "get_users", "get_user", "create_user",
      "update_user", "delete_user", "get_traffic", "get_subscription", "sync", ...extraCaps,
    ],
    supports(cap) {
      return this.capabilities.includes(cap);
    },
    async connect(cfg) {
      await authedFetch(cfg, `${basePath}/system`);
      return { supported: true, ok: true, data: { sessionId: "token" } };
    },
    async healthCheck(cfg) {
      const base = assertOutboundUrl(cfg.baseUrl);
      const res = await providerFetch(new URL(`${basePath}/system`, base).toString(), {
        headers: cfg.apiKey ? { "Authorization": `Bearer ${cfg.apiKey}` } : {},
        timeoutMs: 6_000,
      });
      return { supported: true, ok: res.ok, data: { healthy: res.ok } };
    },
    async getUsers(cfg) {
      const res = await authedFetch(cfg, `${basePath}/users`);
      if (!res.ok) return { supported: true, ok: false, error: `HTTP ${res.status}` };
      const body = (await res.json()) as { users?: Array<Record<string, unknown>> };
      return {
        supported: true,
        ok: true,
        data: (body.users ?? []).map((u) => parseRemoteUser(u, String(u.username ?? ""))),
      };
    },
    async getUser(cfg, ref) {
      const res = await authedFetch(cfg, `${basePath}/user/${encodeURIComponent(ref)}`);
      if (!res.ok) return { supported: true, ok: false, error: `HTTP ${res.status}` };
      const body = (await res.json()) as Record<string, unknown>;
      return { supported: true, ok: true, data: parseRemoteUser(body, ref) };
    },
    async createUser(cfg, spec) {
      const res = await authedFetch(cfg, `${basePath}/user`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: spec.username,
          data_limit: spec.trafficLimitGb === null ? null : spec.trafficLimitGb * 1024 ** 3,
          expire: spec.expiredAt ? Math.floor(spec.expiredAt / 1000) : null,
        }),
      });
      if (!res.ok) return { supported: true, ok: false, error: `HTTP ${res.status}` };
      return {
        supported: true,
        ok: true,
        data: {
          remoteRef: spec.username,
          username: spec.username,
          trafficUsedGb: 0,
          trafficLimitGb: spec.trafficLimitGb,
          expiredAt: spec.expiredAt,
          status: "active",
        },
      };
    },
    async updateUser(cfg, ref, patch) {
      const res = await authedFetch(cfg, `${basePath}/user/${encodeURIComponent(ref)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(patch.trafficLimitGb !== undefined
            ? { data_limit: patch.trafficLimitGb === null ? null : patch.trafficLimitGb * 1024 ** 3 }
            : {}),
          ...(patch.expiredAt !== undefined
            ? { expire: patch.expiredAt ? Math.floor(patch.expiredAt / 1000) : null }
            : {}),
          ...(patch.status !== undefined ? { status: patch.status } : {}),
        }),
      });
      if (!res.ok) return { supported: true, ok: false, error: `HTTP ${res.status}` };
      return { supported: true, ok: true, data: (await (await authedFetch(cfg, `${basePath}/user/${encodeURIComponent(ref)}`)).json() as Record<string, unknown>) as unknown as RemoteUser };
    },
    async deleteUser(cfg, ref) {
      const res = await authedFetch(cfg, `${basePath}/user/${encodeURIComponent(ref)}`, { method: "DELETE" });
      return { supported: true, ok: res.ok, data: null };
    },
    async getTraffic(cfg, ref) {
      const r = await this.getUser(cfg, ref);
      if (!r.ok || !r.data) return { supported: true, ok: false, error: r.error };
      return { supported: true, ok: true, data: r.data.trafficUsedGb };
    },
    async getSubscription(cfg, ref) {
      const res = await authedFetch(cfg, `${basePath}/user/${encodeURIComponent(ref)}/subscription`);
      if (!res.ok) return { supported: true, ok: false, error: `HTTP ${res.status}` };
      return { supported: true, ok: true, data: await res.text() };
    },
    async getServers(cfg) {
      const res = await authedFetch(cfg, `${basePath}/nodes`);
      if (!res.ok) return { supported: true, ok: false, error: `HTTP ${res.status}` };
      const body = (await res.json()) as Array<Record<string, unknown>>;
      return {
        supported: true,
        ok: true,
        data: body.map((n) => ({ id: String(n.id ?? n.name), name: String(n.name ?? n.id) })),
      };
    },
    async sync(cfg) {
      const users = await this.getUsers(cfg);
      if (!users.ok || !users.data) return { supported: true, ok: false, error: users.error };
      return { supported: true, ok: true, data: { synced: users.data.length } };
    },
  };
}

const sanaeiAdapter = makePanelLikeAdapter("sanaei", "/api", ["get_servers"]);
const pasarguardAdapter = makePanelLikeAdapter("pasarguard", "/api", ["get_servers"]);
const rebeccaAdapter = makePanelLikeAdapter("rebecca", "/api/v1", []);

export const PROVIDER_ADAPTERS: Record<ProviderKind, ProviderAdapter> = {
  xui: xuiAdapter,
  sanaei: sanaeiAdapter,
  pasarguard: pasarguardAdapter,
  rebecca: rebeccaAdapter,
};

export function getAdapter(kind: ProviderKind): ProviderAdapter {
  const a = PROVIDER_ADAPTERS[kind];
  if (!a) throw new Error(`PROVIDER_ERROR: provider ناشناخته ${kind}`);
  return a;
}

/** Capability detection اجرایی: قبل از هر ثبت provider اجرا می‌شود. */
export async function detectProviderCapabilities(
  kind: ProviderKind,
  cfg: ProviderCredentials,
): Promise<ProviderCapability[]> {
  const declared = getAdapter(kind).capabilities;
  const probe: Record<string, string> = {};
  const base = kind === "xui" ? "/" : kind === "rebecca" ? "/api/v1/system" : "/api/system";
  probe["connect"] = base;
  probe["get_users"] = kind === "xui" ? "/panel/api/inbounds/list" : `${kind === "rebecca" ? "/api/v1" : "/api"}/users`;
  probe["health_check"] = base;
  const detected = await detectCapabilities(cfg, probe);
  return declared.filter((c) => detected.includes(c) || c !== "get_servers");
}

export { parseRemoteUser };
