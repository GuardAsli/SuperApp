/** GuardAsli — صفحه ورود/ثبت‌نام متصل به بک‌اند واقعی. */
import { useState } from "react";
import { motion } from "framer-motion";
import { useAction } from "convex/react";
import { api } from "../convex/_generated/api";
import { GUARDASLI } from "../core/identity";

type Mode = "login" | "register";

const FRIENDLY_ERROR: Record<string, string> = {
  UNAUTHENTICATED: "نام کاربری یا رمز درست نیست.",
  RATE_LIMITED: "چند بار تلاش کردید؛ کمی صبر کنید و دوباره امتحان کنید.",
  FORBIDDEN: "حساب شما فعلاً اجازه‌ی ورود ندارد.",
  VALIDATION_ERROR: "اطلاعات وارد‌شده درست نیست.",
  CONFLICT: "این نام کاربری قبلاً گرفته شده.",
};

function friendly(msg: string): string {
  const code = msg.split(":")[0]?.trim() ?? "";
  return FRIENDLY_ERROR[code] ?? "مشکلی پیش آمد؛ دوباره تلاش کنید.";
}

export default function AuthPage() {
  const [mode, setMode] = useState<Mode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okNote, setOkNote] = useState<string | null>(null);

  const loginAction = useAction(api.authActions.loginAction);
  const registerAction = useAction(api.authActions.registerAction);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setOkNote(null);
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
        setOkNote("حساب ساخته شد؛ حالا وارد شوید.");
      }
    } catch (err) {
      setError(err instanceof Error ? friendly(err.message) : "مشکلی پیش آمد؛ دوباره تلاش کنید.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col justify-center px-6 py-12">
      <div className="aurora" aria-hidden="true" />

      <motion.a
        href="#/"
        className="mb-8 text-center"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
      >
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-core-primary text-xl font-black text-core-primaryFg shadow-sm">
          گ
        </div>
        <div className="mt-3 text-xl font-extrabold">{GUARDASLI.product}</div>
        <div className="text-xs text-core-muted">ساخته‌ی {GUARDASLI.developer}</div>
      </motion.a>

      <motion.form
        onSubmit={submit}
        className="card p-6"
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, delay: 0.1, ease: "easeOut" }}
      >
        <h1 className="text-xl font-extrabold">
          {mode === "login" ? "خوش آمدید 👋" : "ساخت حساب جدید"}
        </h1>
        <p className="mt-1 text-sm text-core-muted">
          {mode === "login" ? "وارد حساب خودتان شوید." : "چند ثانیه بیشتر طول نمی‌کشد."}
        </p>

        <label className="mt-5 block text-sm font-semibold">
          نام کاربری
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            minLength={3}
            maxLength={32}
            pattern="[a-zA-Z0-9_.\-]+"
            className="input mt-1 w-full px-3 py-2"
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
            className="input mt-1 w-full px-3 py-2"
            dir="ltr"
          />
        </label>

        {error && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-3 rounded-lg bg-core-danger/10 px-3 py-2 text-sm text-core-danger"
          >
            {error}
          </motion.p>
        )}
        {okNote && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-3 rounded-lg bg-core-ok/10 px-3 py-2 text-sm text-core-ok"
          >
            {okNote}
          </motion.p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="btn-primary mt-5 w-full py-3 font-bold disabled:opacity-50"
        >
          {busy ? "یک لحظه…" : mode === "login" ? "ورود" : "ساخت حساب"}
        </button>
        <button
          type="button"
          onClick={() => {
            setMode(mode === "login" ? "register" : "login");
            setError(null);
            setOkNote(null);
          }}
          className="mt-3 w-full text-center text-sm text-core-primary hover:underline"
        >
          {mode === "login" ? "حساب ندارید؟ بسازید" : "حساب دارید؟ وارد شوید"}
        </button>
      </motion.form>

      <a href="#/" className="mt-6 text-center text-sm text-core-muted hover:underline">
        بازگشت به صفحه‌ی اصلی
      </a>
    </div>
  );
}
