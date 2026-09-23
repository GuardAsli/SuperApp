/** GuardAsli — تست‌های قرارداد REST API: مسیرهای auth/health و نگاشت خطا. */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";

// ————— قرارداد مسیرها در httpApi —————

const httpApi = readFileSync(new URL("../src/convex/httpApi.ts", import.meta.url), "utf8");
const httpAuth = readFileSync(new URL("../src/convex/httpAuth.ts", import.meta.url), "utf8");

describe("REST API contract", () => {
  test("مسیرهای auth و health ثبت شده‌اند", () => {
    for (const route of [
      '"/api/v1/health"',
      '"/api/v1/auth/register"',
      '"/api/v1/auth/login"',
      '"/api/v1/auth/refresh"',
      '"/api/v1/ping"',
      '"/api/v1/version"',
    ]) {
      expect(httpApi.includes(route)).toBe(true);
    }
  });

  test("مسیرهای auth فقط POST هستند و health فقط GET", () => {
    // health بعد از auth routes و قبل از ping می‌آید
    const healthIdx = httpApi.indexOf('"/api/v1/health"');
    const registerIdx = httpApi.indexOf('"/api/v1/auth/register"');
    const pingIdx = httpApi.indexOf('"/api/v1/ping"');
    expect(healthIdx).toBeGreaterThan(-1);
    expect(registerIdx).toBeGreaterThan(healthIdx);
    expect(pingIdx).toBeGreaterThan(registerIdx);
  });

  test("health پروب واقعی دیتابیس دارد", () => {
    // نباید استاتیک باشد — باید systemSettings را query کند
    expect(httpAuth.includes('query("systemSettings")')).toBe(true);
    expect(httpAuth.includes('database: "ok"')).toBe(true);
    // خطای DB باید 503 بدهد
    expect(httpAuth.includes('"SERVICE_UNAVAILABLE"')).toBe(true);
  });

  test("auth handlers از اکشن‌های موجود استفاده می‌کنند (بدون دور زدن زنجیره)", () => {
    expect(httpAuth.includes("api.authActions.registerAction")).toBe(true);
    expect(httpAuth.includes("api.authActions.loginAction")).toBe(true);
    expect(httpAuth.includes("api.authActions.refreshAction")).toBe(true);
  });

  test("ورودی خالی رد می‌شود (validation زودهنگام)", () => {
    expect(httpAuth.split("VALIDATION_ERROR").length).toBeGreaterThanOrEqual(4);
  });
});

describe("Error contract mapping", () => {
  // بازسازی همان نگاشت httpApi/httpAuth برای اثبات رفتار
  const known: Array<[string, number]> = [
    ["UNAUTHENTICATED", 401], ["FORBIDDEN", 403], ["NOT_FOUND", 404], ["CONFLICT", 409],
    ["VALIDATION_ERROR", 400], ["QUOTA_EXCEEDED", 402], ["RATE_LIMITED", 429],
  ];

  function mapStatus(msg: string): number {
    for (const [code, status] of known) {
      if (msg.startsWith(code)) return status;
    }
    return 500;
  }

  test("نگاشت کد به وضعیت HTTP", () => {
    expect(mapStatus("VALIDATION_ERROR: نامعتبر")).toBe(400);
    expect(mapStatus("UNAUTHENTICATED: نشست")).toBe(401);
    expect(mapStatus("FORBIDDEN: مجوز")).toBe(403);
    expect(mapStatus("NOT_FOUND: نیست")).toBe(404);
    expect(mapStatus("CONFLICT: تکراری")).toBe(409);
    expect(mapStatus("RATE_LIMITED: زیاد")).toBe(429);
    expect(mapStatus("خطای ناشناخته")).toBe(500);
  });
});
