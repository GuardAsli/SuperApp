/** GuardAsli — صفحه فرود با تم سپر سبز لوگو و کپی فروش، بدون افشای اطلاعات داخلی. */
import { motion } from "framer-motion";
import { GUARDASLI } from "../core/identity";

const FEATURES = [
  {
    title: "مدیریت مشتری و ریسلر",
    desc: "هر کس فقط داده‌ی خودش را می‌بیند؛ همه‌چیز امن و سروری.",
    icon: "🛡️",
    glow: "from-emerald-400/20",
  },
  {
    title: "کیف پول امن",
    desc: "هر تغییر موجودی ثبت می‌شود؛ شارژ تکراری ممکن نیست.",
    icon: "📒",
    glow: "from-teal-400/20",
  },
  {
    title: "پرداخت آسان",
    desc: "شارژ دستی، کارت به کارت و درگاه آنلاین با تأیید خودکار.",
    icon: "💳",
    glow: "from-lime-400/20",
  },
  {
    title: "برند اختصاصی شما",
    desc: "نام، لوگو و رنگ‌ها همه از آنِ شماست؛ اپ اختصاصی بدون کدنویسی.",
    icon: "🎨",
    glow: "from-emerald-400/20",
  },
  {
    title: "ربات تلگرام آماده",
    desc: "ربات و مینی‌اپ خودکار فعال می‌شود و همیشه آنلاین می‌ماند.",
    icon: "🤖",
    glow: "from-teal-400/20",
  },
  {
    title: "پشتیبانی سریع",
    desc: "کاربران همان‌جا در ربات پاسخ می‌گیرند و لینک ورود خودکار می‌رسد.",
    icon: "⚡",
    glow: "from-lime-400/20",
  },
];

const fade = {
  hidden: { opacity: 0, y: 18 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.07, duration: 0.5, ease: "easeOut" as const },
  }),
};

export default function LandingPage() {
  return (
    <div className="relative min-h-full overflow-hidden">
      <div className="aurora" aria-hidden="true" />
      <div className="grid-mesh" aria-hidden="true" />

      <div className="mx-auto max-w-6xl px-6 py-10">
        <motion.header
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-emerald-300 to-teal-400 text-xl font-black text-slate-950 shadow-lg shadow-emerald-500/30">
              گ
            </div>
            <div>
              <div className="font-extrabold leading-tight">{GUARDASLI.product}</div>
              <div className="text-[11px] text-core-muted" dir="ltr">
                Coded by {GUARDASLI.developer}
              </div>
            </div>
          </div>
          <a href="#/auth" className="btn-ghost px-4 py-2 text-sm font-bold">
            ورود / ثبت‌نام
          </a>
        </motion.header>

        {/* ── هیرو ─────────────────────────────────────────────────────────── */}
        <section className="pt-16 text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4 }}
            className="mx-auto inline-flex items-center gap-2 rounded-full border border-emerald-300/25 bg-emerald-400/10 px-3.5 py-1.5 text-xs font-bold text-emerald-200"
          >
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-300" />
            کنترل · حفاظت · اتصال
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.05 }}
            className="text-gradient mx-auto mt-6 max-w-3xl text-4xl font-black leading-tight sm:text-5xl"
          >
            کسب‌وکار خود را در یک پنل مدیریت کنید
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.12 }}
            className="mx-auto mt-5 max-w-2xl text-base text-core-muted"
          >
            مشتری‌ها، پرداخت‌ها و ربات تلگرام — همه در یک جا، ساده و امن.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mt-9 flex flex-wrap items-center justify-center gap-3"
          >
            <a href="#/auth" className="btn-primary px-7 py-3.5 text-base">
              شروع کنید — ساخت حساب کاربری
            </a>
            <a href="#/dashboard" className="btn-ghost px-6 py-3.5 text-base font-bold">
              ورود به پنل
            </a>
          </motion.div>
        </section>

        {/* ── قابلیت‌ها ────────────────────────────────────────────────────── */}
        <section className="mt-16">
          <h2 className="text-center text-2xl font-black">هر چیزی که برای فروش لازم دارید</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f, i) => (
              <motion.div
                key={f.title}
                variants={fade}
                initial="hidden"
                animate="show"
                custom={i}
                className="card p-5 transition-transform duration-200 hover:-translate-y-1"
              >
                <div
                  className={`grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br ${f.glow} to-transparent text-xl ring-1 ring-white/10`}
                >
                  {f.icon}
                </div>
                <h3 className="mt-3 font-extrabold">{f.title}</h3>
                <p className="mt-1 text-sm text-core-muted">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* ── فراخوان پایانی ───────────────────────────────────────────────── */}
        <section className="mt-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="card p-8 text-center"
          >
            <h2 className="text-2xl font-black">همین حالا شروع کنید</h2>
            <p className="mx-auto mt-2 max-w-xl text-core-muted">
              حساب خود را بسازید و در چند دقیقه اولین مشتری را بپذیرید.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <a href="#/auth" className="btn-primary px-6 py-3 font-bold">
                ساخت حساب کاربری
              </a>
              <a href="#/dashboard" className="btn-ghost px-6 py-3 font-bold">
                ورود به پنل
              </a>
            </div>
          </motion.div>
        </section>

        <footer className="mt-14 border-t border-core-border pt-6 text-center text-xs text-core-muted">
          Coded by {GUARDASLI.developer} · {GUARDASLI.product} {GUARDASLI.initialVersion}
        </footer>
      </div>
    </div>
  );
}
