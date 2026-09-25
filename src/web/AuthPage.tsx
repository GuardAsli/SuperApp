/** GuardAsli — صفحه ورود/ثبت‌نام با ورود تفکیک‌شده بر اساس پورت نقش. */
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useAction } from "convex/react";
import { api } from "../convex/_generated/api";
import { GUARDASLI } from "../core/identity";
import {
  entryContext,
  roleAllowed,
  roleMismatchMessage,
  roleEntryUrl,
  RESELLER_PORT,
  SUPER_ADMIN_PORT,
} from "./entryPorts";

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

/** رنگ و نشان هر نقش — هماهنگ با تم اصلی. */
const ROLE_STYLE: Record<string, { ring: string; text: string; chip: string; glyph: string }> = {
  super_admin: {
    ring: "ring-amber-400/40",
    text: "text-amber-300",
    chip: "bg-amber-400/15 text-amber-200 border-amber-300/30",
    glyph: "★",
  },
  reseller: {
    ring: "ring-sky-400/40",
    text: "text-sky-300",
    chip: "bg-sky-400/15 text-sky-200 border-sky-300/30",
    glyph: "◆",
  },
  user: {
    ring: "ring-emerald-400/40",
    text: "text-emerald-300",
    chip: "bg-emerald-400/15 text-emerald-200 border-emerald-300/30",
    glyph: "●",
  },
};

export default function AuthPage() {
  const entry = useMemo(() => entryContext(), []);
  const style = ROLE_STYLE[entry.role ?? "user"];
  const [mode, setMode] = useState<Mode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okNote, setOkNote] = useState<string | null>(null);

  const loginAction = useAction(api.authActions.loginAction);
  const registerAction = useAction(api.authActions.registerAction);

  // در پورت ادمین/نماینده، ثبت‌نام عمومی معنا ندارد — فقط ورود.
  const canRegister = !entry.scoped;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setOkNote(null);
    try {
      if (mode === "login") {
        const res = await loginAction({
          username,
          password,
          ...(entry.role ? { expectRole: entry.role } : {}),
        });
        // سمت کلاینت سریع فیلتر می‌شود؛ اعزام سمت سرور هم اجباری است.
        if (!roleAllowed(entry, res.role)) {
          sessionStorage.removeItem("guardasli.session");
          setError(roleMismatchMessage(entry, res.role));
          return;
        }
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
    <div className="relative min-h-full overflow-hidden">
      {/* پس‌زمینه‌ی زنده‌ی تم — هاله‌های رنگی + شبکه‌ی نقطه‌ای */}
      <div className="aurora" aria-hidden="true" />
      <div className="grid-mesh" aria-hidden="true" />
      {entry.role && (
        <div
          className={`pointer-events-none absolute -top-40 start-1/2 h-[34rem] w-[34rem] -translate-x-1/2 rounded-full blur-[120px] ${
            entry.role === "super_admin" ? "bg-amber-500/20" : "bg-sky-500/20"
          }`}
          aria-hidden="true"
        />
      )}

      <div className="relative mx-auto flex min-h-full max-w-md flex-col justify-center px-6 py-12">
        <motion.a
          href="#/"
          className="mb-7 text-center"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
        >
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-sky-400 to-cyan-300 text-2xl font-black text-slate-950 shadow-lg shadow-cyan-500/30">
            گ
          </div>
          <div className="mt-3 text-2xl font-extrabold tracking-tight">{GUARDASLI.product}</div>
          <div className="text-xs text-core-muted">ساخته‌ی {GUARDASLI.developer}</div>
        </motion.a>

        {/* نشان نقش — فقط وقتی آدرس پورت دارد */}
        {entry.scoped && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.35, delay: 0.05 }}
            className="mb-4 flex justify-center"
          >
            <span
              className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-bold backdrop-blur ${style.chip}`}
            >
              <span aria-hidden="true">{style.glyph}</span>
              ورود {entry.label}
              <span className="opacity-60">· پورت {entry.port}</span>
            </span>
          </motion.div>
        )}

        <motion.form
          onSubmit={submit}
          className={`card p-6 ring-1 backdrop-blur-xl ${entry.role ? style.ring : "ring-white/5"}`}
          initial={{ opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.1, ease: "easeOut" }}
        >
          <h1 className="text-xl font-extrabold">
            {mode === "login" ? "خوش آمدید 👋" : "ساخت حساب جدید"}
          </h1>
          <p className="mt-1 text-sm text-core-muted">
            {mode === "login"
              ? entry.scoped
                ? `ورود ${entry.label} از آدرس اختصاصی.`
                : "وارد حساب خودتان شوید."
              : "چند ثانیه بیشتر طول نمی‌کشد."}
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
              autoComplete="username"
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
              autoComplete="current-password"
            />
          </label>

          {error && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-3 rounded-lg border border-core-danger/30 bg-core-danger/10 px-3 py-2 text-sm text-core-danger"
            >
              {error}
            </motion.p>
          )}
          {okNote && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-3 rounded-lg border border-core-ok/30 bg-core-ok/10 px-3 py-2 text-sm text-core-ok"
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

          {canRegister && (
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
          )}

          {/* راهنمای ورود نقش‌های دیگر — فقط در صفحه‌ی عمومی */}
          {!entry.scoped && (
            <div className="mt-5 space-y-1.5 border-t border-core-border pt-4 text-xs text-core-muted">
              <p className="font-semibold text-core-text/80">ورود جداگانه‌ی هر نقش:</p>
              <p>
                نماینده:{" "}
                <code className="text-core-primary" dir="ltr">
                  {roleEntryUrl("reseller", window.location.origin)}
                </code>
              </p>
              <p>
                سوپر ادمین:{" "}
                <code className="text-amber-300" dir="ltr">
                  {roleEntryUrl("super_admin", window.location.origin)}
                </code>
              </p>
            </div>
          )}
        </motion.form>

        <a href="#/" className="mt-6 text-center text-sm text-core-muted hover:underline">
          بازگشت به صفحه‌ی اصلی
        </a>
      </div>
      <p className="sr-only">
        پورت‌های نقش: سوپر ادمین {SUPER_ADMIN_PORT}، نماینده {RESELLER_PORT}
      </p>
    </div>
  );
}
