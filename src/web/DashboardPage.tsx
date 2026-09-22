/** GuardAsli — داشبورد نقش‌محور: بازتاب واقعی permissions و داده بک‌اند. */
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { GUARDASLI } from "../core/identity";
import { saveBranding, type TenantBranding } from "./branding";

interface Props {
  branding: TenantBranding;
  onBrandingChange: (b: TenantBranding) => void;
}

export default function DashboardPage({ branding, onBrandingChange }: Props) {
  const token = sessionStorage.getItem("guardasli.session") ?? "";
  const whoami = useQuery(api.auth.whoami, token ? { token } : "skip");
  const wallet = useQuery(api.wallet.walletGet, token ? { token } : "skip");
  const history = useQuery(api.wallet.walletHistory, token ? { token, limit: 20 } : "skip");
  const plans = useQuery(api.billing.planList, token ? { token } : "skip");
  const logout = useMutation(api.auth.revokeSession);

  const [tab, setTab] = useState<"overview" | "wallet" | "plans" | "branding">("overview");

  if (!token) {
    window.location.hash = "#/auth";
    return null;
  }

  const role = whoami?.role ?? "user";

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold">داشبورد {branding.displayName}</h1>
          <p className="text-sm text-core-muted">
            {whoami ? `${whoami.username} · ${roleLabel(role)}` : "در حال بارگذاری…"} · پلتفرم{" "}
            {GUARDASLI.product}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={async () => {
              await logout({ token });
              sessionStorage.clear();
              window.location.hash = "#/";
            }}
            className="rounded-lg border px-4 py-2 text-sm font-semibold hover:bg-core-surface"
          >
            خروج
          </button>
        </div>
      </header>

      <nav className="mt-6 flex flex-wrap gap-2">
        {(
          [
            ["overview", "نمای کلی"],
            ["wallet", "کیف پول"],
            ["plans", "پلن‌ها"],
            ...(["admin", "super_admin", "reseller"].includes(role)
              ? [["branding", "برندینگ"] as const]
              : []),
          ] as Array<[typeof tab, string]>
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

      <main className="mt-6">
        {tab === "overview" && (
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard
              title="موجودی کیف پول"
              value={wallet ? `${wallet.balance.toLocaleString("fa-IR")} تومان` : "…"}
            />
            <StatCard title="پلن‌های فعال" value={plans ? String(plans.length) : "…"} />
            <StatCard title="نقش" value={roleLabel(role)} />
          </div>
        )}

        {tab === "wallet" && (
          <div className="rounded-2xl border bg-core-surface p-6">
            <h2 className="text-lg font-extrabold">Ledger کیف پول</h2>
            <div className="mt-4 text-3xl font-black">
              {wallet ? `${wallet.balance.toLocaleString("fa-IR")}` : "…"}{" "}
              <span className="text-sm font-bold text-core-muted">تومان</span>
            </div>
            <ul className="mt-6 divide-y">
              {((history ?? []) as Array<{ _id: string; type: string; reason: string; direction: string; amount: number }>).map((h) => (
                <li key={h._id} className="flex items-center justify-between py-3 text-sm">
                  <span>
                    <span className="font-semibold">{ledgerTypeFa(h.type)}</span>
                    <span className="text-core-muted"> · {h.reason}</span>
                  </span>
                  <span
                    className={`font-bold ${h.direction === "credit" ? "text-core-ok" : "text-core-danger"}`}
                  >
                    {h.direction === "credit" ? "+" : "−"}
                    {h.amount.toLocaleString("fa-IR")}
                  </span>
                </li>
              ))}
              {history && history.length === 0 && (
                <li className="py-3 text-sm text-core-muted">هنوز تراکنشی ثبت نشده است.</li>
              )}
            </ul>
          </div>
        )}

        {tab === "plans" && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {((plans ?? []) as Array<{ _id: string; name: string; kind: string; price: number; trafficGb?: number | null; users?: number | null; durationDays?: number | null }>).map((p) => (
              <div key={p._id} className="rounded-2xl border bg-core-surface p-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold">{p.name}</h3>
                  <span className="rounded-md bg-core-primary/10 px-2 py-0.5 text-xs font-bold text-core-primary">
                    {planKindFa(p.kind)}
                  </span>
                </div>
                <div className="mt-3 text-2xl font-black">
                  {p.price.toLocaleString("fa-IR")}
                  <span className="text-xs font-bold text-core-muted"> تومان</span>
                </div>
                <ul className="mt-3 space-y-1 text-sm text-core-muted">
                  <li>ترافیک: {p.trafficGb === undefined ? "نامحدود" : `${p.trafficGb} گیگ`}</li>
                  <li>کاربر: {p.users === undefined ? "نامحدود" : p.users}</li>
                  <li>مدت: {p.durationDays === undefined ? "بدون الزام" : `${p.durationDays} روز`}</li>
                </ul>
              </div>
            ))}
            {plans && plans.length === 0 && (
              <p className="text-sm text-core-muted">هنوز پلنی تعریف نشده است.</p>
            )}
          </div>
        )}

        {tab === "branding" && (
          <BrandingPanel branding={branding} onChange={onBrandingChange} />
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
      <h2 className="text-lg font-extrabold">شخصی‌سازی برندینگ tenant</h2>
      <p className="mt-1 text-sm text-core-muted">
        لایه tenant کاملاً قابل شخصی‌سازی است؛ هویت Core ({GUARDASLI.product} / {GUARDASLI.developer}) ثابت می‌ماند.
      </p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-semibold">
          نام نمایشی
          <input
            value={branding.displayName}
            onChange={(e) => update("displayName", e.target.value)}
            className="mt-1 w-full rounded-lg border bg-core-bg px-3 py-2 outline-none focus:border-core-primary"
          />
        </label>
        <label className="text-sm font-semibold">
          تم
          <select
            value={branding.theme}
            onChange={(e) => update("theme", e.target.value as TenantBranding["theme"])}
            className="mt-1 w-full rounded-lg border bg-core-bg px-3 py-2 outline-none"
          >
            <option value="dark">تاریک</option>
            <option value="light">روشن</option>
            <option value="system">سیستم</option>
          </select>
        </label>
        {(
          [
            ["primaryColor", "رنگ اصلی"],
            ["secondaryColor", "رنگ دوم"],
            ["accentColor", "رنگ تأکید"],
            ["backgroundColor", "پس‌زمینه"],
          ] as Array<[keyof TenantBranding, string]>
        ).map(([key, label]) => (
          <label key={key} className="text-sm font-semibold">
            {label}
            <input
              type="color"
              value={branding[key] as string}
              onChange={(e) => update(key, e.target.value as never)}
              className="mt-1 h-10 w-full cursor-pointer rounded-lg border bg-core-bg"
            />
          </label>
        ))}
      </div>
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

function roleLabel(role: string): string {
  const map: Record<string, string> = {
    super_admin: "Super Admin",
    admin: "Admin",
    reseller: "Reseller",
    sub_reseller: "Sub-reseller",
    user: "User",
  };
  return map[role] ?? role;
}

function planKindFa(kind: string): string {
  return kind === "volume" ? "حجمی" : "کاربری";
}

function ledgerTypeFa(type: string): string {
  const map: Record<string, string> = {
    deposit: "واریز",
    purchase: "خرید",
    refund: "بازگشت",
    adjustment: "اصلاح",
    admin_credit: "شارژ ادمین",
    commission: "کمیسیون",
  };
  return map[type] ?? type;
}
