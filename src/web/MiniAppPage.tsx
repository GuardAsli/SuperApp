/** GuardAsli — Telegram Mini App: احراز هویت initData و داشبورد برند tenant. */
import { useEffect, useState } from "react";
import { GUARDASLI } from "../core/identity";

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
  const [user, setUser] = useState<string | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "no-telegram">("loading");

  useEffect(() => {
    const wa = window.Telegram?.WebApp;
    if (!wa) {
      setStatus("no-telegram");
      return;
    }
    wa.ready();
    wa.expand();
    const tgUser = wa.initDataUnsafe?.user;
    if (tgUser) {
      setUser(tgUser.first_name ?? tgUser.username ?? "کاربر");
    }
    setStatus("ready");
    // verify واقعی initData در backend از طریق authActions انجام می‌شود.
  }, []);

  return (
    <div className="mx-auto max-w-md px-6 py-10">
      <header className="text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-core-primary text-2xl font-black text-core-primaryFg">
          گ
        </div>
        <h1 className="mt-3 text-xl font-extrabold">{GUARDASLI.product} Mini App</h1>
        <p className="text-sm text-core-muted">
          {status === "no-telegram"
            ? "خارج از تلگرام — حالت نمایش"
            : user
              ? `سلام ${user} 👋`
              : "در حال اتصال…"}
        </p>
      </header>

      <main className="mt-8 space-y-3">
        {["کیف پول", "اشتراک‌ها", "پلن‌ها", "پشتیبانی"].map((label) => (
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
