/** GuardAsli — قرارداد آداپتور Provider (بند ۱۱). کد provider فقط داخل آداپتور خودش. */
import { validateOutboundUrl } from "../ssrf";

export type ProviderKind = "inbound-panel" | "rest-panel" | "rest-panel-plus" | "rest-open";

export const PROVIDER_KINDS: readonly ProviderKind[] = [
  "inbound-panel",
  "rest-panel",
  "rest-panel-plus",
  "rest-open",
];

export type ProviderCapability =
  | "connect"
  | "health_check"
  | "get_users"
  | "get_user"
  | "create_user"
  | "update_user"
  | "delete_user"
  | "get_traffic"
  | "get_subscription"
  | "get_servers"
  | "sync";

export interface ProviderCredentials {
  baseUrl: string;
  username?: string;
  password?: string;
  apiKey?: string;
}

export interface RemoteUser {
  remoteRef: string;
  username: string;
  trafficUsedGb: number;
  trafficLimitGb: number | null;
  expiredAt: number | null;
  status: string;
}

export interface ProviderOperationResult<T> {
  supported: boolean;
  ok: boolean;
  data?: T;
  error?: string;
}

export interface ProviderAdapter {
  readonly kind: ProviderKind;
  readonly capabilities: readonly ProviderCapability[];
  supports(cap: ProviderCapability): boolean;
  connect(cfg: ProviderCredentials): Promise<ProviderOperationResult<{ sessionId: string }>>;
  healthCheck(cfg: ProviderCredentials): Promise<ProviderOperationResult<{ healthy: boolean }>>;
  getUsers(cfg: ProviderCredentials, page?: number): Promise<ProviderOperationResult<RemoteUser[]>>;
  getUser(cfg: ProviderCredentials, ref: string): Promise<ProviderOperationResult<RemoteUser>>;
  createUser(
    cfg: ProviderCredentials,
    spec: { username: string; trafficLimitGb: number | null; expiredAt: number | null },
  ): Promise<ProviderOperationResult<RemoteUser>>;
  updateUser(
    cfg: ProviderCredentials,
    ref: string,
    patch: { trafficLimitGb?: number | null; expiredAt?: number | null; status?: string },
  ): Promise<ProviderOperationResult<RemoteUser>>;
  deleteUser(cfg: ProviderCredentials, ref: string): Promise<ProviderOperationResult<null>>;
  getTraffic(cfg: ProviderCredentials, ref: string): Promise<ProviderOperationResult<number>>;
  getSubscription(cfg: ProviderCredentials, ref: string): Promise<ProviderOperationResult<string>>;
  getServers(cfg: ProviderCredentials): Promise<ProviderOperationResult<Array<{ id: string; name: string }>>>;
  sync(cfg: ProviderCredentials): Promise<ProviderOperationResult<{ synced: number }>>;
}

/** اعتبارسنجی مشترک URL خروجی. */
export function assertOutboundUrl(raw: string): URL {
  const check = validateOutboundUrl(raw);
  if (!check.ok) throw new Error(`PROVIDER_ERROR: ${check.reason}`);
  return new URL(raw);
}

/** پاسخ HTTP را با timeout امن دریافت می‌کند. */
export async function providerFetch(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const { timeoutMs = 12_000, ...rest } = init;
  return await fetch(url, { ...rest, signal: AbortSignal.timeout(timeoutMs) });
}

export function unsupported<T>(op: string): ProviderOperationResult<T> {
  return { supported: false, ok: false, error: `UNSUPPORTED: ${op} در این provider پشتیبانی نمی‌شود` };
}
