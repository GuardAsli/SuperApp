/**
 * GuardAsli Core Identity — ثابت و غیرقابل تغییر.
 * تنها هویت مرکزی مجاز در کل سیستم. هیچ لایه tenant یا reseller
 * حق تغییر، حذف یا پنهان‌سازی کامل این مقادیر را ندارد.
 *
 * هر جزء نسخهٔ مستقل با قالب isMAJOR.MINOR.PATCH دارد تا بتوان
 * بدون شکستن بقیه، فقط همان جزء را به‌روز کرد (سازگاری: major یکسان).
 */
export const GUARDASLI = Object.freeze({
  product: "GuardAsli",
  developer: "AsliCode",
  versionFormat: "isMAJOR.MINOR.PATCH",
  initialVersion: "is0.1.0",
} as const);

export type Component =
  | "core"
  | "api"
  | "web"
  | "bot"
  | "miniapp"
  | "mainapp"
  | "dedicated"
  | "installer"
  | "payment"
  | "providers"
  | "build"
  | "releases";

export const COMPONENTS: readonly Component[] = [
  "core",
  "api",
  "web",
  "bot",
  "miniapp",
  "mainapp",
  "dedicated",
  "installer",
  "payment",
  "providers",
  "build",
  "releases",
] as const;

/**
 * نسخهٔ هر جزء — تنها منبع حقیقت برای API /version و UI.
 * برای به‌روزرسانی مستقل یک جزء، فقط مقدار همان کلید را bump کنید
 * (مثلاً payment → is0.0.2) و major را در صورت شکستن سازگاری افزایش دهید.
 */
export const COMPONENT_VERSIONS: Readonly<Record<Component, string>> = Object.freeze({
  core: "is0.1.0",
  api: "is0.1.0",
  web: "is0.1.0",
  bot: "is0.1.0",
  miniapp: "is0.1.0",
  mainapp: "is0.1.0",
  dedicated: "is0.1.0",
  installer: "is0.1.0",
  payment: "is0.1.0",
  providers: "is0.1.0",
  build: "is0.1.0",
  releases: "is0.1.0",
});

/** سازگاری با کد/تست‌های قبلی */
export const INITIAL_VERSIONS = COMPONENT_VERSIONS;

export const VERSION_FORMAT_PATTERN = /^is\d+\.\d+\.\d+$/;

/** اسنپ‌شات برای endpoint نسخه و داشبورد — همیشه از COMPONENT_VERSIONS بخوانید. */
export function getVersionSnapshot(): {
  product: string;
  developer: string;
  format: string;
  components: Record<Component, string>;
} {
  return {
    product: GUARDASLI.product,
    developer: GUARDASLI.developer,
    format: GUARDASLI.versionFormat,
    components: { ...COMPONENT_VERSIONS },
  };
}
