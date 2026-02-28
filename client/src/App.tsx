import { lazy, Suspense } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { SpeedInsights } from "@vercel/speed-insights/react";

// Lazy load route components for code splitting
const SelectYear = lazy(() => import("@/pages/SelectYear"));
const YearPage = lazy(() => import("@/pages/YearPage"));
const Login = lazy(() => import("@/pages/Login"));
const Settings = lazy(() => import("@/pages/Settings"));

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
        {/* Fallback to Select Year page for any unknown routes */}
        <Route component={SelectYear} />
      </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router />
      <Toaster />
      <SpeedInsights />
    </QueryClientProvider>
  );
}

export default App;
