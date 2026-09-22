/** GuardAsli — داشبورد: کیف پول، شارژ، بررسی پرداخت، i18n FA/EN */
import { useMemo, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { GUARDASLI } from "../core/identity";
import { saveBranding, type TenantBranding } from "./branding";
import { getLocale, setLocale, t, type Locale } from "./i18n";

interface Props {
  branding: TenantBranding;
  onBrandingChange: (b: TenantBranding) => void;
}

type Tab = "overview" | "wallet" | "charge" | "payments" | "plans" | "branding" | "admin";

export default function DashboardPage({ branding, onBrandingChange }: Props) {
  const token = sessionStorage.getItem("guardasli.session") ?? "";
  const [locale, setLoc] = useState<Locale>(getLocale());
  const whoami = useQuery(api.auth.whoami, token ? { token } : "skip");
  const wallet = useQuery(api.wallet.walletGet, token ? { token } : "skip");
  const history = useQuery(api.wallet.walletHistory, token ? { token, limit: 20 } : "skip");
  const plans = useQuery(api.billing.planList, token ? { token } : "skip");
  const methods = useQuery(api.payments.methodList, token ? { token } : "skip");
  const myPayments = useQuery(api.payments.myPayments, token ? { token } : "skip");
  const pending = useQuery(
    api.payments.pendingPayments,
    token && ["admin", "super_admin"].includes(whoami?.role ?? "") ? { token } : "skip",
  );
  const providerCfgs = useQuery(api.payments.myProviderConfigList, token ? { token } : "skip");
  const logout = useMutation(api.auth.revokeSession);
  const methodToggle = useMutation(api.payments.methodSetEnabled);
  const cardReview = useMutation(api.payments.cardReview);
  const adminCredit = useMutation(api.wallet.adminManualCredit);
  const saveProvider = useAction(api.paymentActions.saveUserProviderConfigAction);
  const createCube = useAction(api.paymentActions.createCubePayInvoiceAction);
  const createTetra = useAction(api.paymentActions.createTetraminatorInvoiceAction);

  const [tab, setTab] = useState<Tab>("overview");
  const [chargeMethod, setChargeMethod] = useState<"cubepay" | "tetraminator">("tetraminator");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [provKey, setProvKey] = useState("");
  const [adminUserId, setAdminUserId] = useState("");
  const [adminAmount, setAdminAmount] = useState("");
  const [adminReason, setAdminReason] = useState("");

  if (!token) {
    window.location.hash = "#/auth";
    return null;
  }

  const role = whoami?.role ?? "user";
  const isAdmin = ["admin", "super_admin"].includes(role);
  const isSuper = role === "super_admin";

  const methodMap = useMemo(() => {
    const m: Record<string, boolean> = {};
    for (const row of methods ?? []) m[row.key] = row.globallyEnabled;
    return m;
  }, [methods]);

  function switchLocale(next: Locale) {
    setLocale(next);
    setLoc(next);
  }

  async function doCharge() {
    setBusy(true);
    setMsg(null);
    try {
      const n = Number(amount);
      if (!Number.isInteger(n) || n <= 0) throw new Error("VALIDATION_ERROR: invalid amount");
      const key = `chg_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      if (chargeMethod === "cubepay") {
        if (!methodMap.cubepay) throw new Error("FORBIDDEN: CubePay disabled");
        const res = await createCube({
          token,
          amountRials: n,
          idempotencyKey: key,
        });
        if (res.paymentLink) window.open(res.paymentLink, "_blank");
        setMsg(`CubePay OK · ${res.paymentId}`);
      } else {
        if (!methodMap.tetraminator) throw new Error("FORBIDDEN: Tetraminator disabled");
        const res = await createTetra({
          token,
          priceToman: n,
          idempotencyKey: key,
        });
        if (res.paymentLink) window.open(res.paymentLink, "_blank");
        setMsg(`Tetraminator OK · ${res.paymentId}`);
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "error");
    } finally {
      setBusy(false);
    }
  }

  async function doSaveProvider(provider: "cubepay" | "tetraminator") {
    setBusy(true);
    setMsg(null);
    try {
      await saveProvider({
        token,
        provider,
        apiKeyOrToken: provKey,
        enabled: true,
      });
      setProvKey("");
      setMsg(t("save", locale));
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "error");
    } finally {
      setBusy(false);
    }
  }

  async function doAdminCredit() {
    setBusy(true);
    setMsg(null);
    try {
      if (!methodMap.admin_manual) throw new Error("FORBIDDEN: admin_manual disabled");
      await adminCredit({
        token,
        targetUserId: adminUserId as never,
        amount: Number(adminAmount),
        reason: adminReason || "admin credit",
        idempotencyKey: `adm_${Date.now()}`,
      });
      setMsg("OK");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8" dir={locale === "fa" ? "rtl" : "ltr"}>
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold">{t("dashboard", locale)} {branding.displayName}</h1>
          <p className="text-sm text-core-muted">
            {whoami ? `${whoami.username} · ${role}` : "…"} · {GUARDASLI.product}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => switchLocale(locale === "fa" ? "en" : "fa")}
            className="rounded-lg border px-3 py-2 text-sm font-semibold"
          >
            {locale === "fa" ? "EN" : "FA"}
          </button>
          <button
            onClick={async () => {
              await logout({ token });
              sessionStorage.clear();
              window.location.hash = "#/";
            }}
            className="rounded-lg border px-4 py-2 text-sm font-semibold hover:bg-core-surface"
          >
            {t("logout", locale)}
          </button>
        </div>
      </header>

      <nav className="mt-6 flex flex-wrap gap-2">
        {(
          [
            ["overview", t("overview", locale)],
            ["wallet", t("wallet", locale)],
            ["charge", t("charge", locale)],
            ["payments", t("payments", locale)],
            ["plans", t("plans", locale)],
            ...(["admin", "super_admin", "reseller"].includes(role)
              ? ([["branding", t("branding", locale)]] as const)
              : []),
            ...(isAdmin ? ([["admin", "Admin"]] as const) : []),
          ] as Array<[Tab, string]>
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
              tab === key ? "bg-core-primary text-core-primaryFg" : "border hover:bg-core-surface"
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      {msg && (
        <p className="mt-4 rounded-lg border bg-core-surface px-3 py-2 text-sm" dir="ltr">
          {msg}
        </p>
      )}

      <main className="mt-6">
        {tab === "overview" && (
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard
              title={t("balance", locale)}
              value={wallet ? `${wallet.balance.toLocaleString(locale === "fa" ? "fa-IR" : "en-US")} ${t("toman", locale)}` : "…"}
            />
            <StatCard title={t("plans", locale)} value={plans ? String(plans.length) : "…"} />
            <StatCard title="Role" value={role} />
          </div>
        )}

        {tab === "wallet" && (
          <div className="rounded-2xl border bg-core-surface p-6">
            <h2 className="text-lg font-extrabold">{t("wallet", locale)}</h2>
            <div className="mt-4 text-3xl font-black">
              {wallet ? wallet.balance.toLocaleString(locale === "fa" ? "fa-IR" : "en-US") : "…"}{" "}
              <span className="text-sm font-bold text-core-muted">{t("toman", locale)}</span>
            </div>
            <ul className="mt-6 divide-y">
              {((history ?? []) as Array<{ _id: string; type: string; reason: string; direction: string; amount: number }>).map((h) => (
                <li key={h._id} className="flex items-center justify-between py-3 text-sm">
                  <span>
                    <span className="font-semibold">{h.type}</span>
                    <span className="text-core-muted"> · {h.reason}</span>
                  </span>
                  <span className={`font-bold ${h.direction === "credit" ? "text-core-ok" : "text-core-danger"}`}>
                    {h.direction === "credit" ? "+" : "−"}
                    {h.amount.toLocaleString(locale === "fa" ? "fa-IR" : "en-US")}
                  </span>
                </li>
              ))}
              {history && history.length === 0 && (
                <li className="py-3 text-sm text-core-muted">{t("noTransactions", locale)}</li>
              )}
            </ul>
          </div>
        )}

        {tab === "charge" && (
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border bg-core-surface p-6">
              <h2 className="text-lg font-extrabold">{t("charge", locale)}</h2>
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => setChargeMethod("tetraminator")}
                  className={`rounded-lg px-3 py-2 text-sm font-semibold ${chargeMethod === "tetraminator" ? "bg-core-primary text-core-primaryFg" : "border"}`}
                >
                  {t("tetraminator", locale)}
                  {!methodMap.tetraminator && " ✕"}
                </button>
                <button
                  type="button"
                  onClick={() => setChargeMethod("cubepay")}
                  className={`rounded-lg px-3 py-2 text-sm font-semibold ${chargeMethod === "cubepay" ? "bg-core-primary text-core-primaryFg" : "border"}`}
                >
                  {t("cubePay", locale)}
                  {!methodMap.cubepay && " ✕"}
                </button>
              </div>
              <label className="mt-4 block text-sm font-semibold">
                {t("amount", locale)}
                <input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="mt-1 w-full rounded-lg border bg-core-bg px-3 py-2"
                  dir="ltr"
                  inputMode="numeric"
                />
              </label>
              <button
                type="button"
                disabled={busy}
                onClick={doCharge}
                className="mt-4 w-full rounded-xl bg-core-primary py-3 font-bold text-core-primaryFg disabled:opacity-50"
              >
                {t("submit", locale)}
              </button>
              <p className="mt-2 text-xs text-core-muted">
                Webhook never credits wallet; server inquiry/verify required.
              </p>
            </div>
            <div className="rounded-2xl border bg-core-surface p-6">
              <h2 className="text-lg font-extrabold">{t("providerConfig", locale)}</h2>
              <p className="mt-1 text-sm text-core-muted">
                Secrets encrypted at rest · never returned in API
              </p>
              <ul className="mt-3 space-y-1 text-sm">
                {(providerCfgs ?? []).map((c) => (
                  <li key={c.provider}>
                    {c.provider}: {c.enabled ? t("enabled", locale) : t("disabled", locale)}
                    {c.hasSecret ? " · ••••" : ""}
                  </li>
                ))}
              </ul>
              <input
                type="password"
                value={provKey}
                onChange={(e) => setProvKey(e.target.value)}
                placeholder="API Key / Bearer token"
                className="mt-4 w-full rounded-lg border bg-core-bg px-3 py-2"
                dir="ltr"
              />
              <div className="mt-3 flex gap-2">
                <button type="button" disabled={busy} onClick={() => doSaveProvider("tetraminator")} className="rounded-lg border px-3 py-2 text-sm font-semibold">
                  Save Tetra
                </button>
                <button type="button" disabled={busy} onClick={() => doSaveProvider("cubepay")} className="rounded-lg border px-3 py-2 text-sm font-semibold">
                  Save CubePay
                </button>
              </div>
            </div>
          </div>
        )}

        {tab === "payments" && (
          <div className="rounded-2xl border bg-core-surface p-6">
            <h2 className="text-lg font-extrabold">{t("history", locale)}</h2>
            <ul className="mt-4 divide-y">
              {(myPayments ?? []).map((p) => (
                <li key={p._id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                  <span>
                    {p.method} · {p.status}
                  </span>
                  <span className="font-bold">
                    {p.amount.toLocaleString(locale === "fa" ? "fa-IR" : "en-US")}
                  </span>
                  {p.paymentLink && (
                    <a href={p.paymentLink} target="_blank" rel="noreferrer" className="text-core-primary underline">
                      link
                    </a>
                  )}
                </li>
              ))}
              {myPayments && myPayments.length === 0 && (
                <li className="py-3 text-sm text-core-muted">{t("noTransactions", locale)}</li>
              )}
            </ul>
          </div>
        )}

        {tab === "plans" && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {((plans ?? []) as Array<{ _id: string; name: string; kind: string; price: number }>).map((p) => (
              <div key={p._id} className="rounded-2xl border bg-core-surface p-5">
                <h3 className="text-lg font-bold">{p.name}</h3>
                <div className="mt-3 text-2xl font-black">
                  {p.price.toLocaleString(locale === "fa" ? "fa-IR" : "en-US")}
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "branding" && (
          <BrandingPanel branding={branding} onChange={onBrandingChange} />
        )}

        {tab === "admin" && isAdmin && (
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border bg-core-surface p-6">
              <h2 className="text-lg font-extrabold">{t("pendingReview", locale)}</h2>
              <ul className="mt-4 space-y-3">
                {(pending ?? []).map((p) => (
                  <li key={p._id} className="rounded-lg border p-3 text-sm">
                    <div>
                      {p.amount.toLocaleString()} · {p.method}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="rounded-lg bg-core-primary px-3 py-1 text-xs font-bold text-core-primaryFg"
                        onClick={() => cardReview({ token, paymentId: p._id, decision: "approve" })}
                      >
                        {t("approve", locale)}
                      </button>
                      <button
                        type="button"
                        className="rounded-lg border px-3 py-1 text-xs font-bold"
                        onClick={() => cardReview({ token, paymentId: p._id, decision: "reject" })}
                      >
                        {t("reject", locale)}
                      </button>
                      <button
                        type="button"
                        className="rounded-lg border border-red-500 px-3 py-1 text-xs font-bold text-red-500"
                        onClick={() => cardReview({ token, paymentId: p._id, decision: "fraud" })}
                      >
                        {t("fraud", locale)}
                      </button>
                    </div>
                  </li>
                ))}
                {pending && pending.length === 0 && (
                  <li className="text-sm text-core-muted">—</li>
                )}
              </ul>
            </div>

            <div className="rounded-2xl border bg-core-surface p-6">
              <h2 className="text-lg font-extrabold">{t("adminCredit", locale)}</h2>
              <input
                placeholder="target user id"
                value={adminUserId}
                onChange={(e) => setAdminUserId(e.target.value)}
                className="mt-3 w-full rounded-lg border bg-core-bg px-3 py-2"
                dir="ltr"
              />
              <input
                placeholder={t("amount", locale)}
                value={adminAmount}
                onChange={(e) => setAdminAmount(e.target.value)}
                className="mt-2 w-full rounded-lg border bg-core-bg px-3 py-2"
                dir="ltr"
              />
              <input
                placeholder={t("reason", locale)}
                value={adminReason}
                onChange={(e) => setAdminReason(e.target.value)}
                className="mt-2 w-full rounded-lg border bg-core-bg px-3 py-2"
              />
              <button
                type="button"
                disabled={busy}
                onClick={doAdminCredit}
                className="mt-3 rounded-xl bg-core-primary px-4 py-2 font-bold text-core-primaryFg"
              >
                {t("submit", locale)}
              </button>

              {isSuper && (
                <div className="mt-8">
                  <h3 className="font-extrabold">{t("methods", locale)}</h3>
                  <ul className="mt-2 space-y-2 text-sm">
                    {["admin_manual", "card_to_card", "cubepay", "tetraminator"].map((key) => (
                      <li key={key} className="flex items-center justify-between">
                        <span>{key}</span>
                        <button
                          type="button"
                          className="rounded border px-2 py-1 text-xs"
                          onClick={() =>
                            methodToggle({ token, key, enabled: !methodMap[key] })
                          }
                        >
                          {methodMap[key] ? t("enabled", locale) : t("disabled", locale)}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function BrandingPanel({
  branding,
  onChange,
}: {
  branding: TenantBranding;
  onChange: (b: TenantBranding) => void;
}) {
  function update<K extends keyof TenantBranding>(key: K, value: TenantBranding[K]) {
    const next = { ...branding, [key]: value };
    saveBranding(next);
    onChange(next);
  }
  return (
    <div className="rounded-2xl border bg-core-surface p-6">
      <h2 className="text-lg font-extrabold">Branding</h2>
      <p className="mt-1 text-sm text-core-muted">
        Core identity ({GUARDASLI.product} / {GUARDASLI.developer}) is fixed.
      </p>
      <label className="mt-4 block text-sm font-semibold">
        Display name
        <input
          value={branding.displayName}
          onChange={(e) => update("displayName", e.target.value)}
          className="mt-1 w-full rounded-lg border bg-core-bg px-3 py-2"
        />
      </label>
    </div>
  );
}

function StatCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-2xl border bg-core-surface p-5">
      <div className="text-sm font-semibold text-core-muted">{title}</div>
      <div className="mt-2 text-2xl font-black">{value}</div>
    </div>
  );
}
