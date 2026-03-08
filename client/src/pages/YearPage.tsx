import { useState, useEffect, lazy, Suspense } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRoute, Link, useLocation } from "wouter";
import { Home, LogOut, LogIn, Settings, Github } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { handleLogout } from "@/utils/auth";
import type { Year } from "@shared/schema";

// Lazy load tab components for better code splitting
const TeamsTab = lazy(() => import("@/components/TeamsTab"));
const FishTab = lazy(() => import("@/components/FishTab"));
const ChugTab = lazy(() => import("@/components/ChugTab"));
const GolfTab = lazy(() => import("@/components/GolfTab"));
const StandingsTab = lazy(() => import("@/components/StandingsTab"));

type Tab = {
  id: string;
  name: string;
  emoji: string;
};

const tabs: Tab[] = [
  { id: "teams", name: "Teams", emoji: "👥" },
  { id: "fish", name: "Fish", emoji: "🎣" },
  { id: "chug", name: "Chug", emoji: "🍺" },
  { id: "golf", name: "Golf", emoji: "⛳" },
  { id: "standings", name: "Standings", emoji: "🏆" },
];

export default function YearPage() {
  const [, params] = useRoute("/year/:year");
  const [, setLocation] = useLocation();
  const year = params?.year;
  const [activeTab, setActiveTab] = useState("teams");
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();

  const queryClient = useQueryClient();

  const { data: yearData, isLoading } = useQuery<Year>({
    queryKey: ["/api/years", year],
    queryFn: async () => {
      return await apiRequest(`/api/years/${year}`);
    },
    enabled: !!year,
  });

  // Prefetch all tab data in parallel as soon as we have the yearId
  const yearId = yearData?.id;
  useEffect(() => {
    if (!yearId) return;
    const fetchJson = (url: string) => () => fetch(url).then(r => r.json());
    const staleTime = 2_000;
    queryClient.prefetchQuery({ queryKey: ["/api/years", yearId, "teams"], queryFn: fetchJson(`/api/years/${yearId}/teams`), staleTime });
    queryClient.prefetchQuery({ queryKey: ["/api/years", yearId, "fish-weights"], queryFn: fetchJson(`/api/years/${yearId}/fish-weights`), staleTime });
    queryClient.prefetchQuery({ queryKey: ["/api/years", yearId, "chug-times"], queryFn: fetchJson(`/api/years/${yearId}/chug-times`), staleTime });
    queryClient.prefetchQuery({ queryKey: ["/api/years", yearId, "golf-scores"], queryFn: fetchJson(`/api/years/${yearId}/golf-scores`), staleTime });
  }, [yearId, queryClient]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-slate-600">Loading KAK Cup {year}...</p>
        </div>
      </div>
    );
  }

  if (!yearData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-800 mb-4">Year Not Found</h1>
          <p className="text-slate-600">KAK Cup {year} is not available.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="bg-card border-b border-border py-3">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <h1 className="text-xl sm:text-2xl font-bold text-primary" data-testid="title-year">
              KAK Cup {yearData.year}
            </h1>
            
            <div className="flex items-center gap-2 sm:gap-4">
              <Link
                href="/"
                className="btn-ghost flex items-center gap-1 px-2 py-1"
                data-testid="link-home"
              >
                <Home size={18} />
                <span className="text-sm font-medium hidden sm:inline">Home</span>
              </Link>
              
              {isAuthenticated ? (
                <>
                  <span className="text-xs sm:text-sm text-muted-foreground">
                    <span className="hidden sm:inline text-foreground">{user?.firstName || user?.username}</span>
                    <span className="sm:hidden text-foreground">{user?.username}</span>
                    {user?.role === 'admin' && (
                      <span className="ml-1 px-1.5 py-0.5 text-xs bg-primary/20 text-primary rounded-full">
                        Admin
                      </span>
                    )}
                  </span>
                  {user?.role === 'admin' && (
                    <Button
                      onClick={() => setLocation('/settings')}
                      variant="outline"
                      size="sm"
                      className="flex items-center gap-1 px-2 py-1"
                    >
                      <Settings size={14} />
                    </Button>
                  )}
                  <Button
                    onClick={handleLogout}
                    variant="outline"
                    size="sm"
                    className="flex items-center gap-1 px-2 py-1 text-xs sm:text-sm"
                  >
                    <LogOut size={14} />
                    <span className="hidden sm:inline">Logout</span>
                  </Button>
                </>
              ) : (
                <Button
                  onClick={() => setLocation('/login')}
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-1 px-2 py-1 text-xs sm:text-sm"
                >
                  <LogIn size={14} />
                  <span className="hidden sm:inline">Login</span>
                </Button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto pb-nav-safe">
        <Suspense fallback={
          <div className="flex items-center justify-center min-h-[50vh]">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
              <p className="mt-3 text-sm text-muted-foreground">Loading...</p>
            </div>
          </div>
        }>
          {activeTab === "teams" && <TeamsTab yearId={yearData.id} />}
          {activeTab === "fish" && <FishTab yearId={yearData.id} yearData={yearData} />}
          {activeTab === "chug" && <ChugTab yearId={yearData.id} yearData={yearData} />}
          {activeTab === "golf" && <GolfTab yearId={yearData.id} yearData={yearData} />}
          {activeTab === "standings" && <StandingsTab yearId={yearData.id} />}
        </Suspense>

        {/* Footer */}
        <footer className="py-3 text-center">
          <a
            href="https://github.com/atulify/kakcup/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors"
          >
            <Github size={14} />
            <span>atulify/kakcup</span>
            <span>{__COMMIT_HASH__}</span>
          </a>
        </footer>
      </main>

      {/* Bottom Tabs - Fixed to bottom */}
      <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-border safe-area-pb z-10">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-5 gap-0">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex flex-col items-center justify-center py-2 px-1 transition-colors duration-200 border-r border-border last:border-r-0 ${
                  activeTab === tab.id
                    ? "text-primary bg-primary/10 border-t-2 border-t-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                }`}
                data-testid={`tab-${tab.id}`}
              >
                <span className="text-xl mb-0.5 leading-none">{tab.emoji}</span>
                <span className="text-xs font-medium">{tab.name}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}