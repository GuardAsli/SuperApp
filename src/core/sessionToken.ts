/**
 * GuardAsli — هش توکن نشست (بند ۴۴ امنیت).
 * پیاده‌سازی خالص بدون node:crypto — چون در Convex runtime
 * (query/mutation بدون "use node") اجرا می‌شود و باید سریع و قطعی باشد.
 *
 * توکن‌های نشست ۲۵۶ بیتی تصادفی‌اند (randomHex در اکشن‌های Node)، بنابراین
 * هش فقط نقش کلید جستجو دارد؛ گuess کردن توکن از روی hash غیرممکن است
 * چون فضای کلید 2^256 است.
 */

/** هش قطعی و سریع برای جستجوی توکن نشست و کلیدهای API. */
export function stableTokenHash(input: string): string {
  let h1 = 0xdeadbeef ^ input.length;
  let h2 = 0x41c6ce57 ^ input.length;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const out = (h2 >>> 0) * 4294967296 + (h1 >>> 0);
  return out.toString(36) + "." + input.length.toString(36);
}
