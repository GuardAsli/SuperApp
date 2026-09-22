/** GuardAsli — Telegram Mini App: initData → backend auth → wallet/subscriptions. */
import { useEffect, useState } from "react";
import { useAction, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { GUARDASLI } from "../core/identity";
import { getLocale, t } from "./i18n";

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData: string;
        ready: () => void;
        expand: () => void;
        initDataUnsafe?: { user?: { id: number; first_name: string; username?: string } };
      };
    };
  }
}

export default function MiniAppPage() {
  const locale = getLocale();
  const [session, setSession] = useState<string | null>(
    () => sessionStorage.getItem("guardasli.session"),
  );
  const [name, setName] = useState<string | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "no-telegram" | "need-bot">("loading");
  const [botConfigId, setBotConfigId] = useState("");
  const miniAuth = useAction(api.telegramActions.miniAppAuthAction);
  const wallet = useQuery(api.wallet.walletGet, session ? { token: session } : "skip");
  const subs = useQuery(api.billing.subscriptionList, session ? { token: session } : "skip");

  useEffect(() => {
    const wa = window.Telegram?.WebApp;
    if (!wa) {
      setStatus("no-telegram");
      return;
    }
    wa.ready();
    wa.expand();
    const tgUser = wa.initDataUnsafe?.user;
    if (tgUser) setName(tgUser.first_name ?? tgUser.username ?? "User");
    setStatus("ready");
  }, []);

  async function authenticate() {
    const wa = window.Telegram?.WebApp;
    if (!wa?.initData || !botConfigId) {
      setStatus("need-bot");
      return;
    }
    try {
      const res = await miniAuth({
        botConfigId: botConfigId as never,
        initData: wa.initData,
      });
      if ("accessToken" in res && res.accessToken) {
        sessionStorage.setItem("guardasli.session", res.accessToken);
        setSession(res.accessToken);
      }
    } catch {
      setStatus("need-bot");
    }
  }

  return (
    <div className="mx-auto max-w-md px-6 py-10" dir={locale === "fa" ? "rtl" : "ltr"}>
      <header className="text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-core-primary text-2xl font-black text-core-primaryFg">
          گ
        </div>
        <h1 className="mt-3 text-xl font-extrabold">{GUARDASLI.product} Mini App</h1>
        <p className="text-sm text-core-muted">
          {status === "no-telegram"
            ? locale === "fa"
              ? "خارج از تلگرام — حالت نمایش"
              : "Outside Telegram — preview"
            : name
              ? `${locale === "fa" ? "سلام" : "Hi"} ${name}`
              : "…"}
        </p>
      </header>

      {!session && status === "ready" && (
        <div className="mt-6 space-y-2">
          <input
            value={botConfigId}
            onChange={(e) => setBotConfigId(e.target.value)}
            placeholder="botConfigId"
            className="w-full rounded-lg border bg-core-bg px-3 py-2 text-sm"
            dir="ltr"
          />
          <button
            type="button"
            onClick={authenticate}
            className="w-full rounded-xl bg-core-primary py-3 font-bold text-core-primaryFg"
          >
            {t("login", locale)}
          </button>
        </div>
      )}

      <main className="mt-8 space-y-3">
        <div className="rounded-xl border bg-core-surface px-4 py-3">
          <div className="text-xs text-core-muted">{t("balance", locale)}</div>
          <div className="text-xl font-black">
            {wallet ? wallet.balance.toLocaleString(locale === "fa" ? "fa-IR" : "en-US") : session ? "…" : "—"}
          </div>
        </div>
        <div className="rounded-xl border bg-core-surface px-4 py-3">
          <div className="text-xs text-core-muted">{t("plans", locale)} / Subs</div>
          <div className="text-sm font-semibold">{subs ? `${subs.length}` : session ? "…" : "—"}</div>
        </div>
        {[t("wallet", locale), t("payments", locale)].map((label) => (
          <div
            key={label}
            className="flex items-center justify-between rounded-xl border bg-core-surface px-4 py-3 font-semibold"
          >
            <span>{label}</span>
            <span className="text-core-muted">‹</span>
          </div>
        ))}
      </main>

      <footer className="mt-10 text-center text-xs text-core-muted">
        {GUARDASLI.product} · {GUARDASLI.developer} · is0.0.1
      </footer>
    </div>
  );
}
