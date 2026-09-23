/** GuardAsli — ارائه‌دهنده Convex برای React. */
import { createContext, useContext, type ReactNode } from "react";
import { ConvexReactClient } from "convex/react";
import { api } from "../convex/_generated/api";

const rawUrl =
  (import.meta as unknown as { env: Record<string, string> }).env.VITE_CONVEX_URL ?? "";

/**
 * هر URL غیرخالی معتبر است — چه بک‌اند ابری (*.convex.cloud) و چه بک‌اند لوکال
 * (127.0.0.1:3210 هنگام توسعه). فقط وقتی URL اصلاً تنظیم نشده بک‌اند «زنده» نیست
 * و UI بنر شفاف نشان می‌دهد.
 */
export const convexUrl = rawUrl.trim();
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
