/**
 * GuardAsli — تست‌های رندر nginx و پورت‌های نقش.
 *
 * رندرکننده‌ی واقعی (scripts/nginx-render.sh) اجرا می‌شود اما مسیرهایش به یک
 * ریشه‌ی موقت اشاره می‌کند (GA_ETC / GA_CERT_DIR)، پس نه nginx واقعی دست می‌خورد
 * نه گواهی واقعی. بررسی‌ها:
 *  - هر سه پورت (80 / 105 / 616) ساخته می‌شوند
 *  - هر سه به همان پورت داخلی پروکسی می‌شوند
 *  - وقتی گواهی هست، TLS روی هر سه پورت می‌نشیند (نه فقط 80)
 *  - بدون گواهی، HTTP معتبر به‌عنوان جایگزین
 *  - چالش ACME در هر دو حالت سالم می‌ماند (certbot باید بتواند تمدید کند)
 */
import { describe, expect, test, beforeEach, afterAll } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawnSync } from "child_process";

const SCRIPT = join(import.meta.dir, "..", "scripts", "nginx-render.sh");
const roots: string[] = [];

interface RenderResult {
  status: number;
  out: string;
  conf: string;
  etc: string;
}

/** رندر در یک ریشه‌ی ایزوله؛ isSecure تصمیم می‌گیرد گواهی بسازیم یا نه. */
function render(opts: { tls?: "auto" | "0" | "1"; secure?: boolean } = {}): RenderResult {
  const root = mkdtempSync(join(tmpdir(), "ga-nginx-"));
  roots.push(root);
  const etc = join(root, "etc");
  const certDir = join(root, "letsencrypt", "live", "panel.example.com");
  mkdirSync(join(etc, "conf.d"), { recursive: true });
  mkdirSync(join(root, "webroot"), { recursive: true });
  if (opts.secure) {
    mkdirSync(certDir, { recursive: true });
    writeFileSync(join(certDir, "fullchain.pem"), "-----FAKE CERT-----\n");
    writeFileSync(join(certDir, "privkey.pem"), "-----FAKE KEY-----\n");
  }
  const res = spawnSync("bash", [SCRIPT], {
    encoding: "utf8",
    env: {
      ...process.env,
      GA_DOMAIN: "panel.example.com",
      GA_PORT_UI: "4173",
      GA_PORT_RESELLER: "105",
      GA_PORT_SUPER: "616",
      GA_TLS: opts.tls ?? "auto",
      GA_ETC: etc,
      GA_WEBROOT: join(root, "webroot"),
      GA_CERT_DIR: certDir,
    },
  });
  const confPath = join(etc, "sites-available", "guardasli");
  return {
    status: res.status ?? -1,
    out: `${res.stdout ?? ""}${res.stderr ?? ""}`,
    conf: existsSync(confPath) ? readFileSync(confPath, "utf8") : "",
    etc,
  };
}

/** شمارش بلوک‌هایی که روی یک پورت گوش می‌دهند. */
function listenOn(conf: string, port: string): number {
  return (conf.match(new RegExp(`listen ${port};`, "g")) ?? []).length;
}

beforeEach(() => {
  // هر تست ریشه‌ی تازه می‌سازد؛ چیزی بین تست‌ها به اشتراک گذاشته نمی‌شود.
});

afterAll(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true });
});

describe("nginx · role ports exist", () => {
  test("all three entry ports are configured", () => {
    const r = render({ tls: "0", secure: false });
    expect(r.status).toBe(0);
    expect(listenOn(r.conf, "80")).toBe(1);
    expect(listenOn(r.conf, "105")).toBe(1);
    expect(listenOn(r.conf, "616")).toBe(1);
  });

  test("the port blocks are labelled in Persian so operators can recognise them", () => {
    const r = render({ tls: "0", secure: false });
    expect(r.conf).toContain("نمایندگان");
    expect(r.conf).toContain("سوپر ادمین");
  });

  test("all three ports proxy to the same internal UI port", () => {
    const r = render({ tls: "0", secure: false });
    const proxies = r.conf.match(/proxy_pass http:\/\/127\.0\.0\.1:4173;/g) ?? [];
    expect(proxies.length).toBe(3);
  });

  test("websocket upgrade headers are forwarded for the live Convex client", () => {
    const r = render({ tls: "0", secure: false });
    expect(r.conf).toContain("proxy_set_header Upgrade $http_upgrade;");
    expect(r.conf).toContain("proxy_set_header Connection $connection_upgrade;");
  });

  test("the map for $connection_upgrade is installed", () => {
    const r = render({ tls: "0", secure: false });
    const map = readFileSync(join(r.etc, "conf.d", "guardasli-map.conf"), "utf8");
    expect(map).toContain("map $http_upgrade $connection_upgrade");
  });
});

describe("nginx · TLS on the role ports", () => {
  test("with a certificate, TLS is applied to 105 and 616 — not only to 80", () => {
    const r = render({ secure: true });
    expect(r.status).toBe(0);
    // پورت ۸۰ فقط ریدایرکت می‌کند؛ گواهی باید روی هر دو پورت نقش بنشیند
    const sslCount = (r.conf.match(/ssl_certificate /g) ?? []).length;
    expect(sslCount).toBe(2);
    expect(r.conf).toContain("/live/panel.example.com/fullchain.pem");
    expect(r.conf).toContain("/live/panel.example.com/privkey.pem");
    // هر دو پورت نقش باید داخل بلوک TLS باشند، نه فقط یکی
    const block105 = r.conf.slice(r.conf.indexOf("listen 105;"), r.conf.indexOf("listen 616;"));
    const block616 = r.conf.slice(r.conf.indexOf("listen 616;"));
    expect(block105).toContain("ssl_certificate");
    expect(block616).toContain("ssl_certificate");
  });

  test("the health endpoint `guardasli ports` relies on exists on every port", () => {
    const r = render({ secure: true });
    const health = (r.conf.match(/location = \/nginx-health/g) ?? []).length;
    // ۸۰ (HTTP) + ۱۰۵ + ۶۱۶ — پورت ۸۰ وقتی TLS دارد ریدایرکت است و health ندارد
    expect(health).toBe(2);
  });

  test("with a certificate, port 80 only redirects (the ACME challenge stays reachable)", () => {
    const r = render({ secure: true });
    expect(r.conf).toContain("return 301 https://");
    const acme = r.conf.indexOf("acme-challenge");
    const redirect = r.conf.indexOf("return 301");
    expect(acme).toBeGreaterThan(-1);
    expect(acme).toBeLessThan(redirect);
  });

  test("without a certificate the config is valid plain HTTP", () => {
    const r = render({ secure: false });
    expect(r.status).toBe(0);
    expect(r.conf).not.toContain("ssl_certificate");
    expect(r.conf).not.toContain("return 301");
    expect(listenOn(r.conf, "105")).toBe(1);
    expect(listenOn(r.conf, "616")).toBe(1);
  });

  test("GA_TLS=0 forces HTTP even when a certificate exists", () => {
    const r = render({ tls: "0", secure: true });
    expect(r.conf).not.toContain("ssl_certificate");
  });
});

describe("nginx · self-healing", () => {
  test("re-rendering twice keeps all three ports (an update cannot drop them)", () => {
    const root = mkdtempSync(join(tmpdir(), "ga-nginx-keep-"));
    roots.push(root);
    const etc = join(root, "etc");
    const confPath = join(etc, "sites-available", "guardasli");
    mkdirSync(join(etc, "conf.d"), { recursive: true });
    mkdirSync(join(root, "webroot"), { recursive: true });
    // شبیه‌سازی یک کانفیگ قدیمی که فقط پورت ۸۰ داشت
    mkdirSync(join(etc, "sites-available"), { recursive: true });
    writeFileSync(confPath, "server {\n  listen 80;\n  server_name panel.example.com;\n}\n");

    for (let i = 0; i < 2; i++) {
      const res = spawnSync("bash", [SCRIPT], {
        encoding: "utf8",
        env: {
          ...process.env,
          GA_DOMAIN: "panel.example.com",
          GA_PORT_UI: "4173",
          GA_TLS: "0",
          GA_ETC: etc,
          GA_WEBROOT: join(root, "webroot"),
          GA_CERT_DIR: join(root, "none"),
        },
      });
      expect(res.status).toBe(0);
    }
    const conf = readFileSync(confPath, "utf8");
    expect(listenOn(conf, "105")).toBe(1);
    expect(listenOn(conf, "616")).toBe(1);
  });

  test("a missing domain is rejected with a clear error instead of a broken config", () => {
    const res = spawnSync("bash", [SCRIPT], {
      encoding: "utf8",
      env: { ...process.env, GA_DOMAIN: "", GA_ETC: mkdtempSync(join(tmpdir(), "ga-nginx-")) },
    });
    expect(res.status).not.toBe(0);
    expect(`${res.stdout}${res.stderr}`).toContain("GA_DOMAIN is required");
  });
});
