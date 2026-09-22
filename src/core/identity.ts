/**
 * GuardAsli Core Identity — ثابت و غیرقابل تغییر.
 * تنها هویت مرکزی مجاز در کل سیستم. هیچ لایه tenant یا reseller
 * حق تغییر، حذف یا پنهان‌سازی کامل این مقادیر را ندارد.
 */
export const GUARDASLI = {
  product: "GuardAsli",
  developer: "AsliCode",
  versionFormat: "isMAJOR.MINOR.PATCH",
} as const;

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
];

export const INITIAL_VERSIONS: Record<Component, string> = Object.freeze(
  COMPONENTS.reduce(
    (acc, c) => ({ ...acc, [c]: "is0.0.1" }),
    {} as Record<Component, string>,
  ),
);

export const VERSION_FORMAT_PATTERN = /^is\d+\.\d+\.\d+$/;
