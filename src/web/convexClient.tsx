/** GuardAsli — ارائه‌دهنده Convex برای React. */
import { createContext, useContext, type ReactNode } from "react";
import { ConvexReactClient } from "convex/react";
import { api } from "../convex/_generated/api";

const rawUrl =
  (import.meta as unknown as { env: Record<string, string> }).env.VITE_CONVEX_URL ?? "";

/**
 * URL فقط در صورت واقعی بودن معتبر است — لوکال‌هاست یا fallback ساختگی به‌عنوان
 * بک‌اند زنده شناخته نمی‌شود. UI با useConvexUrl وضعیت اتصال را نشان می‌دهد.
 */
export const convexUrl =
  rawUrl && !rawUrl.includes("//127.0.0.1") && !rawUrl.includes("//localhost") ? rawUrl : "";
export const backendLive = convexUrl.length > 0;

const client = new ConvexReactClient(backendLive ? convexUrl : "http://127.0.0.1:3210");

const Ctx = createContext<{ api: typeof api }>({ api });

export function ConvexProvider({ children }: { children: ReactNode }) {
  return (
    <ConvexReactClientWrapper>
      <Ctx.Provider value={{ api }}>{children}</Ctx.Provider>
    </ConvexReactClientWrapper>
  );
}

import { ConvexProvider as ConvexProviderImpl } from "convex/react";

function ConvexReactClientWrapper({ children }: { children: ReactNode }) {
  return <ConvexProviderImpl client={client}>{children}</ConvexProviderImpl>;
}

export function useApi() {
  return useContext(Ctx).api;
}

/** وضعیت زنده بودن بک‌اند — برای بنر شفاف «بک‌اند متصل نیست» در UI. */
export function useBackendLive(): boolean {
  return backendLive;
}
