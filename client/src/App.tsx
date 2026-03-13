import { lazy, Suspense } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { SpeedInsights } from "@vercel/speed-insights/react";

// Retry dynamic imports once then reload — handles stale chunk hashes after deploys
function lazyWithRetry(factory: () => Promise<{ default: any }>) {
  return lazy(() =>
    factory().catch(() => {
      // Chunk probably 404'd due to a new deploy. Reload to get fresh HTML + chunks.
      window.location.reload();
      // Return a never-resolving promise so React doesn't render before reload
      return new Promise(() => {});
    })
  );
}

const Toaster = lazy(() => import("@/components/ui/toaster").then(m => ({ default: m.Toaster })));

// Lazy load route components for code splitting
const SelectYear = lazyWithRetry(() => import("@/pages/SelectYear"));
const YearPage = lazyWithRetry(() => import("@/pages/YearPage"));
const Login = lazyWithRetry(() => import("@/pages/Login"));
const Settings = lazyWithRetry(() => import("@/pages/Settings"));
const KakStatsPage = lazyWithRetry(() => import("@/pages/KakStatsPage"));

function Router() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Loading...</div>
      </div>
    }>
      <Switch>
        <Route path="/" component={SelectYear} />
        <Route path="/select-year" component={SelectYear} />
        <Route path="/year/:year" component={YearPage} />
        <Route path="/login" component={Login} />
        <Route path="/settings" component={Settings} />
        <Route path="/kak-stats" component={KakStatsPage} />
        {/* Fallback to Select Year page for any unknown routes */}
        <Route component={SelectYear} />
      </Switch>
    </Suspense>
  );
}

// Eagerly prefetch years so the data is ready before the lazy SelectYear chunk loads.
// This eliminates the waterfall: chunk download + years fetch happen in parallel.
queryClient.prefetchQuery({
  queryKey: ["/api/years"],
  queryFn: async () => {
    const response = await fetch("/api/years");
    return response.json();
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router />
      <Suspense fallback={null}><Toaster /></Suspense>
      <SpeedInsights />
    </QueryClientProvider>
  );
}

export default App;
