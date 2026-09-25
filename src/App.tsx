/** GuardAsli — پوسته اپ و مسیرها. هویت Core در نقاط مرکزی ثابت می‌ماند. */
import { useEffect, useMemo, useState } from "react";
import LandingPage from "./web/LandingPage";
import AuthPage from "./web/AuthPage";
import DashboardPage from "./web/DashboardPage";
import MiniAppPage from "./web/MiniAppPage";
import ApiDocsPage from "./web/ApiDocsPage";
import { ConvexProvider, useBackendLive } from "./web/convexClient";
import { readBranding, applyBranding, type TenantBranding } from "./web/branding";

type Route = { name: "landing" } | { name: "auth" } | { name: "dashboard" } | { name: "miniapp" } | { name: "apidocs" };

function parseHash(): Route {
  const h = window.location.hash.replace(/^#\/?/, "");
  if (h === "auth") return { name: "auth" };
  if (h === "dashboard") return { name: "dashboard" };
  if (h === "miniapp") return { name: "miniapp" };
  if (h === "api") return { name: "apidocs" };
  return { name: "landing" };
}

export default function App() {
  const [route, setRoute] = useState<Route>(parseHash);
  const [branding, setBranding] = useState<TenantBranding>(readBranding);
  const live = useBackendLive();

  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    applyBranding(branding);
  }, [branding]);

  const content = useMemo(() => {
    switch (route.name) {
      case "auth":
        return <AuthPage />;
      case "dashboard":
        return <DashboardPage branding={branding} onBrandingChange={setBranding} />;
      case "miniapp":
        return <MiniAppPage />;
      case "apidocs":
        return <ApiDocsPage />;
      default:
        return <LandingPage />;
    }
  }, [route, branding]);

  return (
    <ConvexProvider>
      <div className="min-h-full bg-core-bg text-core-text">
        {!live && (
          <div className="bg-core-surface border-b border-core-border px-4 py-2 text-center text-sm text-core-muted">
            بک‌اند متصل نیست — برای اتصال، یک‌بار <code className="px-1">bunx convex dev</code> اجرا کنید یا
            <code className="px-1">VITE_CONVEX_URL</code> را تنظیم کنید.
          </div>
        )}
        {content}
      </div>
    </ConvexProvider>
  );
}
