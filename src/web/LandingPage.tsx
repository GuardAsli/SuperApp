/** GuardAsli — صفحه فرود: متن‌های ساده، تم مرواریدی/آسمانی، انیمیشن ملایم. */
import { motion } from "framer-motion";
import { GUARDASLI } from "../core/identity";

const FEATURES = [
  {
    title: "مدیریت مشتری و ریسلر",
    desc: "هر ریسلر و مشتری فقط داده‌ی خودش را می‌بیند؛ دسترسی‌ها سمت سرور کنترل می‌شود.",
    icon: "🛡️",
  },
  {
    title: "کیف پول امن",
    desc: "همه‌ی تغییرات موجودی ثبت می‌شوند و هیچ شارژ تکراری ممکن نیست.",
    icon: "📒",
  },
  {
    title: "پرداخت به روش‌های مختلف",
    desc: "شارژ دستی، کارت به کارت، CubePay و Tetraminator با تأیید خودکار.",
    icon: "💳",
  },
  {
    title: "برند اختصاصی",
    desc: "هر مشتری لوگو، رنگ و دامنه‌ی خودش را دارد؛ تم کاملاً قابل تغییر است.",
    icon: "🎨",
  },
  {
    title: "اپ اختصاصی",
    desc: "ساخت اپ با نام و آیکون شما؛ از پنل، بدون کدنویسی.",
    icon: "📱",
  },
  {
    title: "پایش و پشتیبان",
    desc: "وضعیت سیستم، کارهای خودکار و پشتیبان‌گیری روزانه.",
    icon: "📊",
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
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="aurora" aria-hidden="true" />

      <motion.header
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="flex items-center justify-between"
      >
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-core-primary text-core-primaryFg text-xl font-black shadow-sm">
            گ
          </div>
          <div>
            <div className="text-lg font-extrabold">{GUARDASLI.product}</div>
            <div className="text-xs text-core-muted">
              ساخته‌ی {GUARDASLI.developer}
            </div>
          </div>
        </div>
        <nav className="flex items-center gap-3">
          <a href="#auth" className="btn-ghost px-4 py-2 text-sm font-semibold">
            ورود
          </a>
          <a href="#auth" className="btn-primary px-4 py-2 text-sm font-bold">
            شروع کنید
          </a>
        </nav>
      </motion.header>

      <main>
        <section className="mt-16 grid gap-10 md:grid-cols-2 md:items-center">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          >
            <h1 className="text-4xl font-black leading-[1.25] md:text-5xl">
              همه‌چیز برای فروش سرویس،
              <br />
              یک‌جا و ساده
            </h1>
            <p className="mt-4 text-lg leading-relaxed text-core-muted">
              کاربران، ریسلرها، پلن‌ها، کیف پول، پرداخت، سرورها و بات تلگرام —
              همه در یک پنل، با تم و برند خودتان.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="#auth" className="btn-primary px-7 py-3 text-base font-bold">
                بزن بریم
              </a>
              <a href="#dashboard" className="btn-ghost px-7 py-3 text-base font-bold">
                دیدن پنل
              </a>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.15, ease: "easeOut" }}
            className="card p-6"
          >
            <div className="text-sm font-bold text-core-muted">همه‌ی بخش‌ها آماده‌اند</div>
            <ul className="mt-4 space-y-2 text-sm">
              {["Core", "API", "Web", "Bot", "Mini App", "App Builder"].map((c, i) => (
                <motion.li
                  key={c}
                  custom={i}
                  variants={fade}
                  initial="hidden"
                  animate="show"
                  className="flex items-center justify-between rounded-xl bg-core-bg px-3 py-2"
                >
                  <span className="font-semibold">{c}</span>
                  <span className="rounded-full bg-core-primary/10 px-2.5 py-0.5 text-xs font-bold text-core-primary">
                    آماده
                  </span>
                </motion.li>
              ))}
            </ul>
          </motion.div>
        </section>

        <section className="mt-20">
          <motion.h2
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.5 }}
            className="text-2xl font-extrabold"
          >
            چه کارهایی می‌توانید بکنید؟
          </motion.h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f, i) => (
              <motion.div
                key={f.title}
                custom={i}
                variants={fade}
                initial="hidden"
                whileInView="show"
                viewport={{ once: true, margin: "-40px" }}
                whileHover={{ y: -4 }}
                className="card p-5"
              >
                <div className="text-2xl">{f.icon}</div>
                <h3 className="mt-3 text-lg font-bold">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-core-muted">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </section>

        <motion.section
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.55 }}
          className="card mt-20 p-8 text-center"
        >
          <h2 className="text-2xl font-extrabold">آماده‌ی شروع؟</h2>
          <p className="mt-2 text-core-muted">یک حساب بسازید و همین حالا شروع کنید.</p>
          <a
            href="#auth"
            className="btn-primary mt-6 inline-block px-8 py-3 font-bold"
          >
            ساخت حساب
          </a>
        </motion.section>
      </main>

      <footer className="mt-16 border-t py-8 text-center text-sm text-core-muted">
        {GUARDASLI.product} · ساخته‌ی {GUARDASLI.developer}
      </footer>
    </div>
  );
}
