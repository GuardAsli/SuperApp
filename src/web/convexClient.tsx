/** GuardAsli — ارائه‌دهنده Convex برای React. */
import { createContext, useContext, type ReactNode } from "react";
import { ConvexReactClient } from "convex/react";
import { api } from "../convex/_generated/api";

const client = new ConvexReactClient(
  (import.meta as unknown as { env: Record<string, string> }).env.VITE_CONVEX_URL ??
    "http://127.0.0.1:3210",
);

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
