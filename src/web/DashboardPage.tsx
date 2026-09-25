/** GuardAsli — داشبورد با تب‌های مدیریت حرفه‌ای */
import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { GUARDASLI } from "../core/identity";
import { saveBranding, type TenantBranding } from "./branding";
import { getLocale, setLocale, t, type Locale } from "./i18n";

const FRIENDLY: Record<string, { fa: string; en: string }> = {
  UNAUTHENTICATED: { fa: "نشست منقضی شده؛ دوباره وارد شوید.", en: "Session expired; please sign in again." },
  FORBIDDEN: { fa: "اجازه‌ی این کار را ندارید.", en: "You are not allowed to do this." },
  VALIDATION_ERROR: { fa: "اطلاعات وارد‌شده درست نیست.", en: "Please check the entered values." },
  RATE_LIMITED: { fa: "کمی صبر کنید و دوباره تلاش کنید.", en: "Slow down a little and retry." },
  NOT_FOUND: { fa: "چیزی که می‌خواستید پیدا نشد.", en: "Not found." },
  CONFLICT: { fa: "این مورد قبلاً ثبت شده.", en: "Already exists." },
  QUOTA_EXCEEDED: { fa: "سهمیه‌ی شما پر است.", en: "Quota exceeded." },
  PAYMENT_REQUIRED: { fa: "موجودی کافی نیست.", en: "Insufficient balance." },
};

/** برچسب فارسی نقش‌ها — هماهنگ با رنگ چیپ در index.css. */
function roleFa(role: string): string {
  const map: Record<string, string> = {
    user: "کاربر",
    reseller: "نماینده",
    admin: "ادمین",
    super_admin: "سوپر ادمین",
  };
  return map[role] ?? role;
}

function roleChipClass(role: string): string {
  if (role === "super_admin") return "role-super";
  if (role === "reseller" || role === "admin") return "role-reseller";
  return "role-user";
}

function friendlyMsg(raw: string, locale: Locale): string {
  // راهنمای خاص webhook — پیام خام برای ادمین مفیدتر از تعمیم است.
  if (raw.includes("GUARDASLI_MASTER_SECRET")) {
    return locale === "fa"
      ? "متغیر محیطی GUARDASLI_MASTER_SECRET روی deployment تنظیم نشده — روی سرور دستور `sudo guardasli convex` را اجرا کنید (یا install را دوباره) و سپس دوباره تلاش کنید."
      : "GUARDASLI_MASTER_SECRET is not set on the deployment — run `sudo guardasli convex` on the server (or rerun the installer) and retry.";
  }
  if (raw.includes("آدرس خصوصی") || raw.includes("میزبان داخلی") || raw.includes("IPv6 داخلی")) {
    return locale === "fa"
      ? "آدرس webhook باید دامنه‌ی عمومی https باشد که به همین سرور اشاره می‌کند — IP خصوصی یا لوکال مجاز نیست."
      : "The webhook URL must be a public https domain pointing at this server — private/loopback IPs are not allowed.";
  }
  const code = raw.split(":")[0]?.trim() ?? "";
  const row = FRIENDLY[code];
  return row ? row[locale] : raw;
}

interface Props {
  branding: TenantBranding;
  onBrandingChange: (b: TenantBranding) => void;
}

type Tab =
  | "overview"
  | "wallet"
  | "charge"
  | "payments"
  | "plans"
  | "branding"
  | "bot"
  | "admin"
  | "monitor";

export default function DashboardPage({ branding, onBrandingChange }: Props) {
  const token = sessionStorage.getItem("guardasli.session") ?? "";
  const [locale, setLoc] = useState<Locale>(getLocale());
  const whoami = useQuery(api.auth.whoami, token ? { token } : "skip");
  const wallet = useQuery(api.wallet.walletGet, token ? { token } : "skip");
  const history = useQuery(api.wallet.walletHistory, token ? { token, limit: 20 } : "skip");
  const plans = useQuery(api.billing.planList, token ? { token } : "skip");
  const methods = useQuery(api.payments.methodList, token ? { token } : "skip");
  const myPayments = useQuery(api.payments.myPayments, token ? { token } : "skip");
  const cards = useQuery(
    api.payments.cardList,
    token &&
      methods?.some(
        (m: { key: string; globallyEnabled: boolean }) =>
          m.key === "card_to_card" && m.globallyEnabled,
      )
      ? { token }
      : "skip",
  );
  const pending = useQuery(
    api.payments.pendingPayments,
    token && ["admin", "super_admin"].includes(whoami?.role ?? "") ? { token } : "skip",
  );
  const providerCfgs = useQuery(api.payments.myProviderConfigList, token ? { token } : "skip");
  const health = useQuery(
    api.infra.healthLatest,
    token && whoami && ["admin", "super_admin"].includes(whoami.role) ? { token } : "skip",
  );
  const jobStats = useQuery(
    api.infra.jobStats,
    token && whoami && ["admin", "super_admin"].includes(whoami.role) ? { token } : "skip",
  );
  const logout = useMutation(api.auth.revokeSession);
  const methodToggle = useMutation(api.payments.methodSetEnabled);
  const cardReview = useMutation(api.payments.cardReview);
  const cardSubmit = useMutation(api.payments.cardToCardSubmit);
  const genUpload = useMutation(api.storage.generateUploadUrl);
  const adminCredit = useMutation(api.wallet.adminManualCredit);
  const purchasePlan = useMutation(api.billing.purchasePlan);
  const saveProvider = useAction(api.paymentActions.saveUserProviderConfigAction);
  const createCube = useAction(api.paymentActions.createCubePayInvoiceAction);
  const createTetra = useAction(api.paymentActions.createTetraminatorInvoiceAction);

  const [tab, setTab] = useState<Tab>("overview");
  const [chargeMethod, setChargeMethod] = useState<"cubepay" | "tetraminator" | "card">(
    "tetraminator",
  );
  const [amount, setAmount] = useState("");
  const [cardId, setCardId] = useState("");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
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
  const locNum = locale === "fa" ? "fa-IR" : "en-US";

  const methodMap = useMemo(() => {
    const m: Record<string, boolean> = {};
    for (const row of methods ?? []) m[row.key] = row.globallyEnabled;
    return m;
  }, [methods]);

  const tabs = useMemo(() => {
    const base: Array<[Tab, string]> = [
      ["overview", t("overview", locale)],
      ["wallet", t("wallet", locale)],
      ["charge", t("charge", locale)],
      ["payments", t("payments", locale)],
      ["plans", t("plans", locale)],
    ];
    if (["admin", "super_admin", "reseller"].includes(role)) {
      base.push(["branding", t("branding", locale)]);
    }
    if (isAdmin) {
      base.push(["bot", locale === "fa" ? "ربات و مینی‌اپ" : "Bot & Mini App"]);
      base.push(["admin", t("admin", locale)]);
      base.push(["monitor", t("monitor", locale)]);
    }
    return base;
  }, [locale, role, isAdmin]);

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
      if (chargeMethod === "card") {
        if (!methodMap.card_to_card) throw new Error("FORBIDDEN: card_to_card disabled");
        if (!cardId || !receiptFile) throw new Error("VALIDATION_ERROR: card + receipt required");
        const upMeta = await genUpload({
          token,
          purpose: "receipt",
          contentType: receiptFile.type || "application/octet-stream",
          sizeBytes: receiptFile.size,
        });
        const uploadUrl =
          typeof upMeta === "string" ? upMeta : (upMeta as { uploadUrl: string }).uploadUrl;
        const up = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": receiptFile.type || "application/octet-stream" },
          body: receiptFile,
        });
        if (!up.ok) throw new Error("UPLOAD_FAILED");
        const { storageId } = (await up.json()) as { storageId: string };
        const res = await cardSubmit({
          token,
          cardId: cardId as never,
          amount: n,
          receiptStorageId: storageId as never,
          idempotencyKey: key,
        });
        setMsg(locale === "fa" ? `رسید ثبت شد و در انتظار بررسی است ✅ (${res.paymentId})` : `Receipt submitted, pending review (${res.paymentId})`);
      } else if (chargeMethod === "cubepay") {
        if (!methodMap.cubepay) throw new Error("FORBIDDEN: CubePay disabled");
        const res = await createCube({ token, amountRials: n, idempotencyKey: key });
        if (res.paymentLink) window.open(res.paymentLink, "_blank");
        setMsg(locale === "fa" ? `به صفحه پرداخت CubePay منتقل شدید ✅` : `Redirected to CubePay ✅`);
      } else {
        if (!methodMap.tetraminator) throw new Error("FORBIDDEN: Tetraminator disabled");
        const res = await createTetra({ token, priceToman: n, idempotencyKey: key });
        if (res.paymentLink) window.open(res.paymentLink, "_blank");
        setMsg(locale === "fa" ? `به صفحه پرداخت Tetraminator منتقل شدید ✅` : `Redirected to Tetraminator ✅`);
      }
    } catch (e) {
      setMsg(e instanceof Error ? friendlyMsg(e.message, locale) : (locale === "fa" ? "مشکلی پیش آمد" : "Something went wrong"));
    } finally {
      setBusy(false);
    }
  }

  async function doSaveProvider(provider: "cubepay" | "tetraminator") {
    setBusy(true);
    setMsg(null);
    try {
      await saveProvider({ token, provider, apiKeyOrToken: provKey, enabled: true });
      setProvKey("");
      setMsg(t("save", locale));
    } catch (e) {
      setMsg(e instanceof Error ? friendlyMsg(e.message, locale) : (locale === "fa" ? "مشکلی پیش آمد" : "Something went wrong"));
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
      setMsg(locale === "fa" ? "انجام شد ✅" : "Done ✅");
    } catch (e) {
      setMsg(e instanceof Error ? friendlyMsg(e.message, locale) : (locale === "fa" ? "مشکلی پیش آمد" : "Something went wrong"));
    } finally {
      setBusy(false);
    }
  }

  async function doPurchase(planId: string) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await purchasePlan({
        token,
        planId: planId as never,
        idempotencyKey: `buy_${planId}_${Date.now()}`,
      });
      setMsg(locale === "fa" ? "پلن خریداری شد ✅" : "Plan purchased ✅");
    } catch (e) {
      setMsg(e instanceof Error ? friendlyMsg(e.message, locale) : (locale === "fa" ? "مشکلی پیش آمد" : "Something went wrong"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative min-h-full overflow-hidden" dir={locale === "fa" ? "rtl" : "ltr"}>
      <div className="aurora" aria-hidden="true" />
      <div className="grid-mesh" aria-hidden="true" />
      <div className="mx-auto max-w-6xl px-6 py-8">
      <header className="card flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="flex items-center gap-3">
          <div
            className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-emerald-300 to-teal-400 text-xl font-black text-slate-950 shadow-lg shadow-emerald-500/30"
            aria-hidden="true"
          >
            گ
          </div>
          <div>
            <h1 className="text-xl font-extrabold">
              {t("dashboard", locale)} {branding.displayName}
            </h1>
            <p className="text-xs text-core-muted">
              {whoami ? whoami.username : "…"} · {GUARDASLI.product} {GUARDASLI.initialVersion}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`role-chip ${roleChipClass(role)}`}>
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            {roleFa(role)}
          </span>
          <button
            type="button"
            onClick={() => switchLocale(locale === "fa" ? "en" : "fa")}
            className="btn-ghost px-3 py-2 text-sm font-semibold"
          >
            {locale === "fa" ? "EN" : "FA"}
          </button>
          <button
            onClick={async () => {
              await logout({ token });
              sessionStorage.clear();
              window.location.hash = "#/";
            }}
            className="btn-ghost px-4 py-2 text-sm font-semibold"
          >
            {t("logout", locale)}
          </button>
        </div>
      </header>

      <nav className="mt-6 flex flex-wrap gap-2">
        {tabs.map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`rounded-xl px-4 py-2.5 text-sm font-bold transition-all ${
              tab === key
                ? "bg-gradient-to-br from-emerald-400 to-teal-500 text-slate-950 shadow-lg shadow-emerald-500/25"
                : "border border-core-border bg-white/[0.03] text-core-muted hover:border-emerald-300/30 hover:text-core-text"
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      <AnimatePresence mode="wait">
        {msg && (
          <motion.p
            key={msg}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="card mt-4 px-3 py-2 text-sm"
            dir="auto"
          >
            {msg}
          </motion.p>
        )}
      </AnimatePresence>

      <main className="mt-6">
        {tab === "overview" && (
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard
              tone="emerald"
              title={t("balance", locale)}
              value={wallet ? `${wallet.balance.toLocaleString(locNum)} ${t("toman", locale)}` : "…"}
            />
            <StatCard tone="teal" title={t("plans", locale)} value={plans ? String(plans.length) : "…"} />
            <StatCard tone="amber" title={locale === "fa" ? "نقش" : "Role"} value={roleFa(role)} />
          </div>
        )}

        {tab === "wallet" && (
          <div className="card p-6">
            <h2 className="text-lg font-extrabold">{t("wallet", locale)}</h2>
            <div className="mt-4 text-3xl font-black">
              {wallet ? wallet.balance.toLocaleString(locNum) : "…"}{" "}
              <span className="text-sm font-bold text-core-muted">{t("toman", locale)}</span>
            </div>
            <ul className="mt-6 divide-y">
              {(
                (history ?? []) as Array<{
                  _id: string;
                  type: string;
                  reason: string;
                  direction: string;
                  amount: number;
                }>
              ).map((h) => (
                <li key={h._id} className="flex items-center justify-between py-3 text-sm">
                  <span>
                    <span className="font-semibold">{h.type}</span>
                    <span className="text-core-muted"> · {h.reason}</span>
                  </span>
                  <span
                    className={`font-bold ${
                      h.direction === "credit" ? "text-core-ok" : "text-core-danger"
                    }`}
                  >
                    {h.direction === "credit" ? "+" : "−"}
                    {h.amount.toLocaleString(locNum)}
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
            <div className="card p-6">
              <h2 className="text-lg font-extrabold">{t("charge", locale)}</h2>
              <div className="mt-4 flex flex-wrap gap-2">
                {(["tetraminator", "cubepay", "card"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setChargeMethod(m)}
                    className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                      chargeMethod === m ? "bg-core-primary text-core-primaryFg" : "border"
                    }`}
                  >
                    {m === "card"
                      ? t("cardToCard", locale)
                      : m === "cubepay"
                        ? t("cubePay", locale)
                        : t("tetraminator", locale)}
                  </button>
                ))}
              </div>
              <label className="mt-4 block text-sm font-semibold">
                {t("amount", locale)}
                <input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="input mt-1 w-full px-3 py-2"
                  dir="ltr"
                  inputMode="numeric"
                />
              </label>
              {chargeMethod === "card" && (
                <>
                  <label className="mt-3 block text-sm font-semibold">
                    Card
                    <select
                      value={cardId}
                      onChange={(e) => setCardId(e.target.value)}
                      className="input mt-1 w-full px-3 py-2"
                    >
                      <option value="">—</option>
                      {(cards ?? []).map(
                        (c: { _id: string; numberMasked?: string; ownerName: string }) => (
                          <option key={c._id} value={c._id}>
                            {c.numberMasked ?? "****"} · {c.ownerName}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                  <label className="mt-3 block text-sm font-semibold">
                    Receipt
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      className="mt-1 block w-full text-sm"
                      onChange={(e) => setReceiptFile(e.target.files?.[0] ?? null)}
                    />
                  </label>
                </>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={doCharge}
                className="btn-primary mt-4 w-full py-3 font-bold disabled:opacity-50"
              >
                {t("submit", locale)}
              </button>
            </div>
            <div className="card p-6">
              <h2 className="text-lg font-extrabold">{t("providerConfig", locale)}</h2>
              <ul className="mt-3 space-y-1 text-sm">
                {(providerCfgs ?? []).map(
                  (c: { provider: string; enabled: boolean; hasSecret: boolean }) => (
                    <li key={c.provider}>
                      {c.provider}: {c.enabled ? t("enabled", locale) : t("disabled", locale)}
                      {c.hasSecret ? " · ••••" : ""}
                    </li>
                  ),
                )}
              </ul>
              <input
                type="password"
                value={provKey}
                onChange={(e) => setProvKey(e.target.value)}
                placeholder={locale === "fa" ? "کلید API" : "API Key"}
                className="input mt-4 w-full px-3 py-2"
                dir="ltr"
              />
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => doSaveProvider("tetraminator")}
                  className="rounded-lg border px-3 py-2 text-sm font-semibold"
                >
                  Tetra
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => doSaveProvider("cubepay")}
                  className="rounded-lg border px-3 py-2 text-sm font-semibold"
                >
                  CubePay
                </button>
              </div>
            </div>
          </div>
        )}

        {tab === "payments" && (
          <div className="card p-6">
            <h2 className="text-lg font-extrabold">{t("history", locale)}</h2>
            <ul className="mt-4 divide-y">
              {(
                (myPayments ?? []) as Array<{
                  _id: string;
                  method: string;
                  status: string;
                  amount: number;
                  paymentLink?: string | null;
                }>
              ).map((p) => (
                <li
                  key={p._id}
                  className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"
                >
                  <span>
                    {p.method} · {p.status}
                  </span>
                  <span className="font-bold">{p.amount.toLocaleString(locNum)}</span>
                  {p.paymentLink && (
                    <a
                      href={p.paymentLink}
                      target="_blank"
                      rel="noreferrer"
                      className="text-core-primary underline"
                    >
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
            {((plans ?? []) as Array<{ _id: string; name: string; kind: string; price: number }>).map(
              (p) => (
                <div key={p._id} className="card p-5">
                  <h3 className="text-lg font-bold">{p.name}</h3>
                  <div className="mt-3 text-2xl font-black">{p.price.toLocaleString(locNum)}</div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => doPurchase(p._id)}
                    className="mt-4 w-full rounded-lg bg-core-primary py-2 text-sm font-bold text-core-primaryFg disabled:opacity-50"
                  >
                    {t("submit", locale)}
                  </button>
                </div>
              ),
            )}
          </div>
        )}

        {tab === "branding" && (
          <BrandingPanel branding={branding} onChange={onBrandingChange} />
        )}

        {tab === "bot" && isAdmin && <BotPanel token={token} />}

        {tab === "monitor" && isAdmin && (
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="card p-6">
              <h2 className="text-lg font-extrabold">{t("health", locale)}</h2>
              <ul className="mt-4 space-y-2 text-sm">
                {(health ?? []).map((h: { target: string; state: string; checkedAt: number }) => (
                  <li key={h.target} className="flex justify-between border-b border-white/5 py-2">
                    <span className="font-semibold">{h.target}</span>
                    <span className="text-core-muted">{h.state}</span>
                  </li>
                ))}
                {(!health || health.length === 0) && <li className="text-core-muted">—</li>}
              </ul>
            </div>
            <div className="card p-6">
              <h2 className="text-lg font-extrabold">{t("jobs", locale)}</h2>
              {jobStats ? (
                <div className="mt-4 space-y-2 font-mono text-sm" dir="ltr">
                  {Object.entries((jobStats as { counts: Record<string, number> }).counts || {}).map(
                    ([k, v]) => (
                      <div key={k} className="flex justify-between">
                        <span>{k}</span>
                        <span className="font-bold">{String(v)}</span>
                      </div>
                    ),
                  )}
                </div>
              ) : (
                <p className="mt-4 text-sm text-core-muted">…</p>
              )}
            </div>
          </div>
        )}

        {tab === "admin" && isAdmin && (
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="card p-6">
              <h2 className="text-lg font-extrabold">{t("pendingReview", locale)}</h2>
              <ul className="mt-4 space-y-3">
                {(pending ?? []).map((p: { _id: string; amount: number; method: string }) => (
                  <li key={p._id} className="rounded-lg border p-3 text-sm">
                    <div>
                      {p.amount.toLocaleString(locNum)} · {p.method}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="rounded-lg bg-core-primary px-3 py-1 text-xs font-bold text-core-primaryFg"
                        onClick={() =>
                          cardReview({ token, paymentId: p._id as never, decision: "approve" })
                        }
                      >
                        {t("approve", locale)}
                      </button>
                      <button
                        type="button"
                        className="rounded-lg border px-3 py-1 text-xs font-bold"
                        onClick={() =>
                          cardReview({ token, paymentId: p._id as never, decision: "reject" })
                        }
                      >
                        {t("reject", locale)}
                      </button>
                      <button
                        type="button"
                        className="rounded-lg border border-red-500 px-3 py-1 text-xs font-bold text-red-500"
                        onClick={() =>
                          cardReview({ token, paymentId: p._id as never, decision: "fraud" })
                        }
                      >
                        {t("fraud", locale)}
                      </button>
                    </div>
                  </li>
                ))}
                {pending && pending.length === 0 && <li className="text-sm text-core-muted">—</li>}
              </ul>
            </div>
            <div className="card p-6">
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
                className="input mt-2 w-full px-3 py-2"
                dir="ltr"
              />
              <input
                placeholder={locale === "fa" ? "دلیل" : "Reason"}
                value={adminReason}
                onChange={(e) => setAdminReason(e.target.value)}
                className="input mt-2 w-full px-3 py-2"
              />
              <button
                type="button"
                disabled={busy}
                onClick={doAdminCredit}
                className="btn-primary mt-3 px-4 py-2 font-bold"
              >
                {t("submit", locale)}
              </button>
              {isSuper && (
                <div className="mt-8">
                  <h3 className="font-extrabold">{t("paymentMethods", locale)}</h3>
                  <ul className="mt-2 space-y-2 text-sm">
                    {["admin_manual", "card_to_card", "cubepay", "tetraminator"].map((key) => (
                      <li key={key} className="flex items-center justify-between">
                        <span>{key}</span>
                        <button
                          type="button"
                          className="rounded border px-2 py-1 text-xs"
                          onClick={() => methodToggle({ token, key, enabled: !methodMap[key] })}
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
  const fa = getLocale() === "fa";
  const colorRow = (key: "primaryColor" | "secondaryColor" | "accentColor" | "backgroundColor") => (
    <label className="mt-4 block text-sm font-semibold">
      {fa
        ? key === "primaryColor"
          ? "رنگ اصلی"
          : key === "secondaryColor"
            ? "رنگ دوم"
            : key === "accentColor"
              ? "رنگ تأکید"
              : "رنگ پس‌زمینه"
        : key.replace("Color", " color")}
      <div className="mt-1 flex items-center gap-3">
        <input
          type="color"
          value={branding[key]}
          onChange={(e) => update(key, e.target.value)}
          className="h-10 w-14 cursor-pointer rounded-lg border"
        />
        <input
          value={branding[key]}
          onChange={(e) => update(key, e.target.value)}
          className="input w-32 px-3 py-2"
          dir="ltr"
        />
      </div>
    </label>
  );
  return (
    <div className="card p-6">
      <h2 className="text-lg font-extrabold">{fa ? "شخصی‌سازی ظاهر" : "Branding"}</h2>
      <p className="mt-1 text-sm text-core-muted">
        {fa
          ? "اسم و رنگ‌ها را به سلیقه‌ی خودتان عوض کنید."
          : "Change the name and colors as you like."}{" "}
        ({GUARDASLI.product} / {GUARDASLI.developer})
      </p>
      <label className="mt-4 block text-sm font-semibold">
        {fa ? "اسم نمایشی" : "Display name"}
        <input
          value={branding.displayName}
          onChange={(e) => update("displayName", e.target.value)}
          className="input mt-1 w-full px-3 py-2"
        />
      </label>
      {colorRow("primaryColor")}
      {colorRow("secondaryColor")}
      {colorRow("accentColor")}
      {colorRow("backgroundColor")}
      <div className="mt-4 block text-sm font-semibold">
        {fa ? "حالت نمایش" : "Theme"}
        <div className="mt-1 flex gap-2">
          {(["light", "dark", "system"] as const).map((th) => (
            <button
              key={th}
              type="button"
              onClick={() => update("theme", th)}
              className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                branding.theme === th ? "bg-core-primary text-core-primaryFg" : "btn-ghost"
              }`}
            >
              {th === "light" ? (fa ? "روشن" : "Light") : th === "dark" ? (fa ? "تاریک" : "Dark") : fa ? "سیستمی" : "System"}
            </button>
          ))}
        </div>
      </div>
      <button
        type="button"
        onClick={() => {
          const def = { ...branding, theme: "light" as const };
          update("displayName", GUARDASLI.product);
          update("primaryColor", "#2fd08a");
          update("secondaryColor", "#0ea5a0");
          update("accentColor", "#f59e0b");
          update("backgroundColor", "#f4fdf9");
          update("theme", def.theme);
        }}
        className="btn-ghost mt-5 px-4 py-2 text-sm font-semibold"
      >
        {fa ? "بازگشت به تم پیش‌فرض" : "Reset to default"}
      </button>
    </div>
  );
}

type BotConfigInfo = {
  botConfigId: string;
  displayName: string;
  username: string | null;
  description: string | null;
  enabled: boolean;
  hasToken: boolean;
  adminTelegramUserId: number | null;
  miniAppUrl: string | null;
};

/** مدیریت کامل ربات و مینی‌اپ — معادل کامل بخش ربات در ربات (/admin). */
function BotPanel({ token }: { token: string }) {
  const fa = getLocale() === "fa";
  const cfg = useQuery(api.telegram.botConfigGet, { token });
  const saveConfig = useAction(api.botActions.saveBotConfigAction);
  const setAdmin = useAction(api.botActions.setBotAdminAction);
  const setMiniApp = useAction(api.botActions.setBotMiniAppAction);
  const setWebhook = useAction(api.botActions.setBotWebhookAction);

  const [displayName, setDisplayName] = useState("");
  const [botToken, setBotToken] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [adminId, setAdminId] = useState("");
  const [miniAppUrl, setMiniAppUrl] = useState("");
  const [publicBase, setPublicBase] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [seeded, setSeeded] = useState(false);

  // پیش‌فرض‌های فرم از پیکربندی فعلی — فقط یک‌بار
  useEffect(() => {
    if (cfg && !seeded) {
      setDisplayName(cfg.displayName);
      setEnabled(cfg.enabled);
      setAdminId(cfg.adminTelegramUserId ? String(cfg.adminTelegramUserId) : "");
      setMiniAppUrl(cfg.miniAppUrl ?? "");
      setSeeded(true);
    }
  }, [cfg, seeded]);

  const run = async (fn: () => Promise<string>) => {
    setBusy(true);
    setMsg(null);
    try {
      setMsg(await fn());
    } catch (e) {
      setMsg(friendlyMsg(e instanceof Error ? e.message : String(e), getLocale()));
    } finally {
      setBusy(false);
    }
  };

  const info = (c: BotConfigInfo) => (
    <ul className="mt-3 space-y-1 text-sm" dir="ltr">
      <li>• {c.displayName}{c.username ? ` (@${c.username})` : ""}</li>
      <li>• {fa ? "وضعیت" : "Status"}: {c.enabled ? (fa ? "روشن" : "on") : fa ? "خاموش" : "off"}</li>
      <li>• {fa ? "توکن" : "Token"}: {c.hasToken ? "✓" : "—"}</li>
      <li>• {fa ? "ادمین (شناسه عددی)" : "Admin (numeric ID)"}: {c.adminTelegramUserId ?? "—"}</li>
      <li>• Mini App: {c.miniAppUrl ?? "—"}</li>
    </ul>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="card p-6">
        <h2 className="text-lg font-extrabold">{fa ? "وضعیت ربات" : "Bot status"}</h2>
        {cfg ? info(cfg) : <p className="mt-3 text-sm text-core-muted">{fa ? "هنوز پیکربندی نشده — از فرم ردیف ذخیره کنید." : "Not configured yet — save the form on the right."}</p>}
        <h3 className="mt-6 font-bold">{fa ? "مدیریت از خود ربات" : "Manage from the bot itself"}</h3>
        <ul className="mt-2 space-y-1 text-sm text-core-muted" dir="ltr">
          <li>/admin — {fa ? "اولین نفر ادمین می‌شود" : "first sender becomes admin"}</li>
          <li>/id — {fa ? "شناسه عددی شما" : "your numeric ID"}</li>
          <li>/bot on|off · /setadmin · /token · /miniapp · /webhook · /stats · /broadcast</li>
        </ul>
      </div>

      <div className="card p-6">
        <h2 className="text-lg font-extrabold">{fa ? "پیکربندی ربات" : "Bot configuration"}</h2>
        <label className="mt-3 block text-sm font-semibold">
          {fa ? "نام نمایشی" : "Display name"}
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="input mt-1 w-full px-3 py-2" />
        </label>
        <label className="mt-3 block text-sm font-semibold">
          {fa ? `توکن BotFather ${cfg?.hasToken ? "(خالی = بدون تغییر)" : ""}` : `BotFather token ${cfg?.hasToken ? "(blank = keep current)" : ""}`}
          <input type="password" value={botToken} onChange={(e) => setBotToken(e.target.value)} className="input mt-1 w-full px-3 py-2" dir="ltr" />
        </label>
        <label className="mt-3 block text-sm font-semibold">
          {fa ? "شناسه عددی ادمین ربات" : "Bot admin numeric Telegram ID"}
          <input value={adminId} onChange={(e) => setAdminId(e.target.value.replace(/[^0-9]/g, ""))} placeholder="123456789" className="input mt-1 w-full px-3 py-2" dir="ltr" />
        </label>
        <label className="mt-3 block text-sm font-semibold">
          {fa ? "آدرس مینی‌اپ (https)" : "Mini App URL (https)"}
          <input value={miniAppUrl} onChange={(e) => setMiniAppUrl(e.target.value)} placeholder="https://…" className="input mt-1 w-full px-3 py-2" dir="ltr" />
        </label>
        <label className="mt-3 flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          {fa ? "ربات روشن باشد" : "Bot enabled"}
        </label>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => run(async () => {
              const res = await saveConfig({
                token,
                botToken: botToken || "0".repeat(24),
                displayName: displayName || "GuardAsli Bot",
                enabled,
                ...(adminId ? { adminTelegramUserId: Number(adminId) } : {}),
                ...(miniAppUrl ? { miniAppUrl } : {}),
              });
              return res.webhookUrl
                ? fa
                  ? `پیکربندی ذخیره و webhook خودکار تنظیم شد: ${res.webhookUrl}`
                  : `Configuration saved and webhook auto-set: ${res.webhookUrl}`
                : fa
                  ? "پیکربندی ذخیره شد"
                  : "Configuration saved";
            })}
            className="btn-primary px-4 py-2 font-bold"
          >
            {fa ? "ذخیره پیکربندی" : "Save configuration"}
          </button>
          <button
            type="button"
            disabled={busy || !adminId}
            onClick={() => run(async () => {
              await setAdmin({ token, adminTelegramUserId: Number(adminId) });
              return fa ? `ادمین ربات: ${adminId}` : `Bot admin: ${adminId}`;
            })}
            className="rounded-lg border px-4 py-2 text-sm font-bold"
          >
            {fa ? "ثبت ادمین" : "Set admin"}
          </button>
          <button
            type="button"
            disabled={busy || !/^https:\/\//.test(miniAppUrl)}
            onClick={() => run(async () => {
              await setMiniApp({ token, miniAppUrl });
              return fa ? "مینی‌اپ و دکمه منو ثبت شد" : "Mini App + menu button set";
            })}
            className="rounded-lg border px-4 py-2 text-sm font-bold"
          >
            {fa ? "ثبت مینی‌اپ" : "Set Mini App"}
          </button>
        </div>

        <h3 className="mt-6 font-bold">{fa ? "تنظیم خودکار webhook" : "Automatic webhook"}</h3>
        <p className="mt-1 text-xs text-core-muted">
          {fa
            ? "اگر فیلد را خالی بگذارید، دامنه‌ی عمومی از تنظیمات سرور خوانده می‌شود. در غیر این صورت همان دامنه‌ی https پنل را بدهید (مثل https://panel.example.com). آدرس IP یا دامنه‌ی خصوصی پذیرفته نمی‌شود."
            : "Leave the field blank to use the server-configured public domain, or enter the panel's https domain (e.g. https://panel.example.com). IPs and private domains are rejected."}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            value={publicBase}
            onChange={(e) => setPublicBase(e.target.value)}
            placeholder={fa ? "خالی = دامنه‌ی خودکار سرور" : "blank = automatic server domain"}
            className="input flex-1 px-3 py-2"
            dir="ltr"
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => run(async () => {
              const res = await setWebhook(
                publicBase.trim() ? { token, publicBaseUrl: publicBase.trim() } : { token },
              );
              return `${fa ? "webhook تنظیم شد" : "webhook set"}: ${res.webhookUrl}`;
            })}
            className="rounded-lg bg-core-primary px-4 py-2 text-sm font-bold text-core-primaryFg"
          >
            {fa ? "تنظیم webhook" : "Set webhook"}
          </button>
        </div>
        {msg && <p className="mt-3 text-sm font-semibold" role="status">{msg}</p>}
      </div>
    </div>
  );
}

function StatCard({ title, value, tone = "emerald" }: { title: string; value: string; tone?: string }) {
  const tones: Record<string, string> = {
    emerald: "from-emerald-400/20",
    teal: "from-teal-400/20",
    amber: "from-amber-400/20",
  };
  return (
    <div className="card p-5 transition-transform duration-200 hover:-translate-y-0.5">
      <div className="flex items-center gap-2">
        <span className={`h-8 w-1 rounded-full bg-gradient-to-b ${tones[tone] ?? tones.cyan} to-transparent`} />
        <div className="text-sm font-semibold text-core-muted">{title}</div>
      </div>
      <div className="metric mt-2 text-2xl font-black text-gradient">{value}</div>
    </div>
  );
}
