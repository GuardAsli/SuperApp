/**
 * GuardAsli — هش توکن نشست (بند ۴۴ امنیت).
 * SHA-256: توکن‌های ۲۵۶ بیتی تصادفی‌اند، بنابراین سرعت هش اهمیت
 * آفلاین ندارد؛ هش رمزنگارانه تضمین می‌کند بازیابی توکن از روی
 * hash غیرممکن باشد و برخورد (collision) محاسباتی نداشته باشیم.
 */
import { createHash, timingSafeEqual } from "node:crypto";

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** مقایسه زمان-ثابت دو هش — جلوگیری از timing attack. */
export function hashEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
  } catch {
    return false;
  }
}
