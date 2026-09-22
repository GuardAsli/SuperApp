/** GuardAsli — مقایسه و رفتار مقاوم در برابر side-channel زمانی. */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * مقایسه ثابت‌زمان دو رشته با طول دلخواه.
 * طول‌های متفاوت → false بدون نشت طول دقیق از طریق short-circuit روی محتوا
 * (طول ممکن است از زمان قابل استنتاج باشد؛ برای توکن‌های با طول ثابت ایده‌آل است).
 */
export function constantTimeEqualString(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  // هش هر دو تا طول خروجی ثابت شود — جلوگیری از نشت روی محتوای متفاوت‌طول
  const ha = createHash("sha256").update(ba).digest();
  const hb = createHash("sha256").update(bb).digest();
  const contentEq = timingSafeEqual(ha, hb);
  // همچنین طول را به‌صورت ثابت‌زمان چک می‌کنیم (یک بایت)
  const la = Buffer.alloc(4);
  const lb = Buffer.alloc(4);
  la.writeUInt32BE(ba.length >>> 0);
  lb.writeUInt32BE(bb.length >>> 0);
  const lenEq = timingSafeEqual(la, lb);
  return contentEq && lenEq;
}

export function constantTimeEqualHex(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a, "hex");
    const bb = Buffer.from(b, "hex");
    if (ba.length !== bb.length || ba.length === 0) {
      // کار ساختگی برای نزدیک کردن زمان به مسیر موفق
      void timingSafeEqual(Buffer.alloc(32), Buffer.alloc(32));
      return false;
    }
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

/**
 * تأخیر تصادفی کوچک پس از شکست احراز هویت — کاهش تمایز زمانی
 * user-exists vs not (بهترین‌تلاش در JS تک‌نخی).
 */
export async function authFailureDelay(baseMs = 50, jitterMs = 50): Promise<void> {
  const j = randomBytes(1)[0] % (jitterMs + 1);
  await new Promise((r) => setTimeout(r, baseMs + j));
}

/** پاک‌سازی بافر حساس (بهترین‌تلاش؛ GC همچنان کپی دارد). */
export function zeroBuffer(buf: Buffer): void {
  if (buf && buf.length) buf.fill(0);
}
