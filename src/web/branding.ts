/** GuardAsli — لایه برندینگ tenant: کاملاً قابل شخصی‌سازی از طریق API پایدار. */

export interface TenantBranding {
  displayName: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  backgroundColor: string;
  theme: "light" | "dark" | "system";
}

/** برندینگ پیش‌فرض = هویت Core؛ tenant می‌تواند آن را override کند اما Core ثابت می‌ماند. */
export const CORE_BRANDING: TenantBranding = {
  displayName: "GuardAsli",
  primaryColor: "#0f766e",
  secondaryColor: "#0ea5e9",
  accentColor: "#b45309",
  backgroundColor: "#0b1220",
  theme: "dark",
};

const STORAGE_KEY = "guardasli.branding";

export function readBranding(): TenantBranding {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return CORE_BRANDING;
    const parsed = JSON.parse(raw) as Partial<TenantBranding>;
    return { ...CORE_BRANDING, ...parsed };
  } catch {
    return CORE_BRANDING;
  }
}

export function saveBranding(b: TenantBranding): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(b));
}

export function applyBranding(b: TenantBranding): void {
  const root = document.documentElement;
  const dark =
    b.theme === "dark" ||
    (b.theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  root.classList.toggle("dark", dark);
  root.style.setProperty("--ga-primary", b.primaryColor);
  root.style.setProperty("--ga-secondary", b.secondaryColor);
  root.style.setProperty("--ga-accent", b.accentColor);
  if (b.theme !== "system") {
    // رنگ پس‌زمینه tenant فقط در حالت صریح اعمال می‌شود
    root.style.setProperty("--ga-bg", b.backgroundColor);
  } else {
    root.style.removeProperty("--ga-bg");
  }
  document.title = `${b.displayName} — GuardAsli`;
}
