/** GuardAsli — صفحه احراز هویت متصل به بک‌اند واقعی. */
import { useState } from "react";
import { useAction } from "convex/react";
import { api } from "../convex/_generated/api";
import { GUARDASLI } from "../core/identity";

type Mode = "login" | "register";

export default function AuthPage() {
  const [mode, setMode] = useState<Mode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loginAction = useAction(api.authActions.loginAction);
  const registerAction = useAction(api.authActions.registerAction);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "login") {
        const res = await loginAction({ username, password });
        sessionStorage.setItem("guardasli.session", res.accessToken);
        sessionStorage.setItem("guardasli.refresh", res.refreshToken);
        sessionStorage.setItem("guardasli.role", res.role);
        window.location.hash = "#/dashboard";
      } else {
        await registerAction({ username, password, role: "user" });
        setMode("login");
        setError(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطای ناشناخته");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col justify-center px-6 py-12">
      <a href="#/" className="mb-8 text-center">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-core-primary text-xl font-black text-core-primaryFg">
          گ
        </div>
        <div className="mt-3 text-xl font-extrabold">{GUARDASLI.product}</div>
        <div className="text-xs text-core-muted">توسعه‌ی {GUARDASLI.developer}</div>
      </a>

      <form
        onSubmit={submit}
        className="rounded-2xl border bg-core-surface p-6 shadow-sm"
      >
        <h1 className="text-xl font-extrabold">
          {mode === "login" ? "ورود" : "ثبت‌نام"}
        </h1>
        <label className="mt-4 block text-sm font-semibold">
          نام کاربری
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            minLength={3}
            maxLength={32}
            pattern="[a-zA-Z0-9_.\-]+"
            className="mt-1 w-full rounded-lg border bg-core-bg px-3 py-2 outline-none focus:border-core-primary"
            dir="ltr"
          />
        </label>
        <label className="mt-3 block text-sm font-semibold">
          رمز عبور
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            className="mt-1 w-full rounded-lg border bg-core-bg px-3 py-2 outline-none focus:border-core-primary"
            dir="ltr"
          />
        </label>
        {error && (
          <p className="mt-3 rounded-lg bg-core-danger/10 px-3 py-2 text-sm text-core-danger">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={busy}
          className="mt-5 w-full rounded-xl bg-core-primary py-3 font-bold text-core-primaryFg transition hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "در حال پردازش…" : mode === "login" ? "ورود" : "ایجاد حساب"}
        </button>
        <button
          type="button"
          onClick={() => setMode(mode === "login" ? "register" : "login")}
          className="mt-3 w-full text-center text-sm text-core-primary hover:underline"
        >
          {mode === "login" ? "حساب ندارید؟ ثبت‌نام کنید" : "حساب دارید؟ وارد شوید"}
        </button>
      </form>

      <a href="#/" className="mt-6 text-center text-sm text-core-muted hover:underline">
        بازگشت به صفحه اصلی
      </a>
    </div>
  );
}
