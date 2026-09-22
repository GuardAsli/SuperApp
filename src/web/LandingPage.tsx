/** GuardAsli — صفحه فرود: هویت Core + مسیر ورود به محصول. */
import { GUARDASLI } from "../core/identity";

const FEATURES = [
  {
    title: "چندمستأجری کامل",
    desc: "جداسازی واقعی tenant با سلسله‌مراتب Reseller و Sub-reseller و مجوزهای granular سمت سرور.",
    icon: "🛡️",
  },
  {
    title: "کیف پول با Ledger تغییرناپذیر",
    desc: "هر تغییر موجودی با Ledger Entry ثبت می‌شود؛ جلوگیری قطعی از credit/debit تکراری.",
    icon: "📒",
  },
  {
    title: "پرداخت چندروشه",
    desc: "شارژ ادمین، کارت به کارت با رسید و بررسی، CubePay و Tetraminator با تأیید دوطرفه.",
    icon: "💳",
  },
  {
    title: "برندینگ بی‌نهایت",
    desc: "هر tenant لوگو، رنگ، دامنه، بات تلگرام و اپ اختصاصی خودش را دارد — با هویت Core ثابت.",
    icon: "🎨",
  },
  {
    title: "اپ‌ساز اختصاصی",
    desc: "ساخت اپ اختصاصی با صف build، وضعیت‌ها، آرتیفکت و checksum — نسخه‌گذاری isMAJOR.MINOR.PATCH.",
    icon: "📱",
  },
  {
    title: "پایش و حسابرسی",
    desc: "پایش سلامت اجزا، صف کارهای پس‌زمینه، پشتیبان‌گیری رمزنگاری‌شده و Audit Log کامل.",
    icon: "📊",
  },
];

export default function LandingPage() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-core-primary text-core-primaryFg text-xl font-black">
            گ
          </div>
          <div>
            <div className="text-lg font-extrabold">{GUARDASLI.product}</div>
            <div className="text-xs text-core-muted">
              توسعه‌ی {GUARDASLI.developer} · نسخه is0.0.1
            </div>
          </div>
        </div>
        <nav className="flex items-center gap-3">
          <a
            href="#auth"
            className="rounded-lg px-4 py-2 text-sm font-semibold text-core-primary hover:underline"
          >
            ورود / ثبت‌نام
          </a>
          <a
            href="#dashboard"
            className="rounded-lg bg-core-primary px-4 py-2 text-sm font-bold text-core-primaryFg transition hover:opacity-90"
          >
            داشبورد
          </a>
        </nav>
      </header>

      <main>
        <section className="mt-16 grid gap-8 md:grid-cols-2 md:items-center">
          <div>
            <h1 className="text-4xl font-black leading-tight md:text-5xl">
              پلتفرم کنترل چندمستأجری،
              <br />
              از فروش تا پرووایژنینگ
            </h1>
            <p className="mt-4 text-lg leading-relaxed text-core-muted">
              {GUARDASLI.product} کل زنجیره را یک‌جا جمع می‌کند: کاربران، ریسلرها، پلن‌ها،
              ویژگی‌ها، کیف پول، پرداخت، سرورها، بات تلگرام و اپ اختصاصی — با امنیت
              سمت سرور و جداسازی کامل مستأجرها.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href="#auth"
                className="rounded-xl bg-core-primary px-6 py-3 font-bold text-core-primaryFg transition hover:opacity-90"
              >
                شروع کنید
              </a>
              <a
                href="#dashboard"
                className="rounded-xl border px-6 py-3 font-bold transition hover:bg-core-surface"
              >
                مشاهده داشبورد
              </a>
            </div>
          </div>
          <div className="rounded-2xl border bg-core-surface p-6 shadow-sm">
            <div className="text-sm font-bold text-core-muted">وضعیت اجزا — is0.0.1</div>
            <ul className="mt-4 space-y-2 text-sm">
              {["Core", "API", "Web", "Bot", "Mini App", "App Builder"].map((c) => (
                <li key={c} className="flex items-center justify-between rounded-lg bg-core-bg px-3 py-2">
                  <span className="font-semibold">{c}</span>
                  <span className="rounded-md bg-core-primary/10 px-2 py-0.5 text-xs font-bold text-core-primary">
                    is0.0.1
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="mt-20">
          <h2 className="text-2xl font-extrabold">قابلیت‌ها</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="rounded-2xl border bg-core-surface p-5 transition hover:shadow-md"
              >
                <div className="text-2xl">{f.icon}</div>
                <h3 className="mt-3 text-lg font-bold">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-core-muted">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-20 rounded-2xl border bg-core-surface p-8 text-center">
          <h2 className="text-2xl font-extrabold">آماده‌اید؟</h2>
          <p className="mt-2 text-core-muted">
            با یک حساب کاربری شروع کنید یا به عنوان ریسلر وارد شوید.
          </p>
          <a
            href="#auth"
            className="mt-6 inline-block rounded-xl bg-core-primary px-8 py-3 font-bold text-core-primaryFg transition hover:opacity-90"
          >
            ورود / ثبت‌نام
          </a>
        </section>
      </main>

      <footer className="mt-16 border-t py-8 text-center text-sm text-core-muted">
        {GUARDASLI.product} © ۱۴۰۵ — توسعه‌ی {GUARDASLI.developer}
      </footer>
    </div>
  );
}
