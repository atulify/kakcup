import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import SelectYear from "@/pages/SelectYear";
import YearPage from "@/pages/YearPage";
import Login from "@/pages/Login";

function Router() {
  return (
    <Switch>
      <Route path="/" component={SelectYear} />
      <Route path="/select-year" component={SelectYear} />
      <Route path="/year/:year" component={YearPage} />
      <Route path="/login" component={Login} />
      {/* Fallback to Select Year page for any unknown routes */}
      <Route component={SelectYear} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Router />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
