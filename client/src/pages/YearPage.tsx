import { useState, useEffect, lazy, Suspense } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRoute, Link, useLocation } from "wouter";
import { Home, LogOut, LogIn, Settings, Github, Trophy } from "@/components/icons";
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
  icon: string;
};

const tabs: Tab[] = [
  { id: "teams",    name: "Teams",     icon: "👥" },
  { id: "fish",     name: "Fish",      icon: "🎣" },
  { id: "chug",     name: "Chug",      icon: "🍺" },
  { id: "golf",     name: "Golf",      icon: "⛳" },
  { id: "standings",name: "Standings", icon: "🏆" },
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
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div style={{ width: "40px", height: "40px", border: "2px solid var(--border-hi)", borderTop: "2px solid var(--orange)", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto" }} />
          <p style={{ marginTop: "1rem", fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--text-dim)" }}>
            LOADING KAK CUP {year}...
          </p>
        </div>
      </div>
    );
  }

  if (!yearData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: "1.5rem", color: "var(--orange)", marginBottom: "0.5rem" }}>
            YEAR NOT FOUND
          </h1>
          <p style={{ fontFamily: "var(--font-mono)", color: "var(--text-dim)" }}>
            KAK Cup {year} is not available.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header style={{ background: "var(--card)", borderBottom: "1px solid var(--border-hi)" }} className="py-3">
        <div className="max-w-7xl mx-auto px-3 sm:px-6">
          <div className="flex items-center justify-between">
            <h1
              style={{ fontFamily: "var(--font-display)", color: "var(--orange)", fontSize: "0.95rem", letterSpacing: "0.1em", textTransform: "uppercase", textShadow: "0 0 12px rgba(255,90,0,0.4)" }}
              data-testid="title-year"
            >
              KAK CUP <span style={{ color: "var(--ice)", textShadow: "0 0 12px rgba(136,204,255,0.4)" }}>{yearData.year}</span>
            </h1>

            <div className="flex items-center gap-2 sm:gap-3">
              <Link href="/" className="btn-ghost flex items-center gap-1 text-xs" data-testid="link-home">
                <Home size={14} />
                <span className="hidden sm:inline">Home</span>
              </Link>
              <Link href="/kak-stats" className="btn-ghost flex items-center gap-1 text-xs" data-testid="link-kak-stats">
                <Trophy size={14} />
                <span className="hidden sm:inline">KAK Stats</span>
              </Link>

              {isAuthenticated ? (
                <>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem", color: "var(--text-dim)" }}>
                    <span className="hidden sm:inline">{user?.firstName || user?.username}</span>
                    <span className="sm:hidden">{user?.username}</span>
                    {user?.role === 'admin' && (
                      <span style={{ marginLeft: "0.4rem", padding: "0.1rem 0.4rem", background: "rgba(255,90,0,0.15)", color: "var(--orange)", fontSize: "0.6rem", fontFamily: "var(--font-display)", letterSpacing: "0.08em" }}>
                        ADMIN
                      </span>
                    )}
                  </span>
                  {user?.role === 'admin' && (
                    <button onClick={() => setLocation('/settings')} className="btn-ghost p-1.5">
                      <Settings size={14} style={{ color: "var(--ice)" }} />
                    </button>
                  )}
                  <button onClick={handleLogout} className="btn-ghost flex items-center gap-1 text-xs">
                    <LogOut size={14} />
                    <span className="hidden sm:inline">Logout</span>
                  </button>
                </>
              ) : (
                <button onClick={() => setLocation('/login')} className="btn-ghost flex items-center gap-1 text-xs">
                  <LogIn size={14} />
                  <span className="hidden sm:inline">Login</span>
                </button>
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
              <div style={{ width: "32px", height: "32px", border: "2px solid var(--border-hi)", borderTop: "2px solid var(--orange)", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto" }} />
              <p style={{ marginTop: "0.75rem", fontFamily: "var(--font-mono)", fontSize: "0.7rem", color: "var(--text-dim)" }}>LOADING...</p>
            </div>
          </div>
        }>
          {activeTab === "teams"     && <TeamsTab yearId={yearData.id} />}
          {activeTab === "fish"      && <FishTab yearId={yearData.id} yearData={yearData} />}
          {activeTab === "chug"      && <ChugTab yearId={yearData.id} yearData={yearData} />}
          {activeTab === "golf"      && <GolfTab yearId={yearData.id} yearData={yearData} />}
          {activeTab === "standings" && <StandingsTab yearId={yearData.id} />}
        </Suspense>

        {/* Footer */}
        <footer className="py-3 text-center">
          <a
            href="https://github.com/atulify/kakcup/"
            target="_blank"
            rel="noopener noreferrer"
            className="footer-link inline-flex items-center gap-1.5"
            style={{ fontFamily: "var(--font-mono)", fontSize: "0.65rem" }}
          >
            <Github size={12} />
            <span>atulify/kakcup · {__COMMIT_HASH__}</span>
          </a>
        </footer>
      </main>

      {/* Bottom Tab Bar — fixed */}
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "var(--card)", borderTop: "1px solid var(--border-hi)", zIndex: 10 }} className="safe-area-pb">
        <div className="max-w-7xl mx-auto grid grid-cols-5">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "0.5rem 0.25rem",
                  transition: "all 0.15s",
                  borderTop: isActive ? "2px solid var(--orange)" : "2px solid transparent",
                  background: isActive ? "rgba(255,90,0,0.07)" : "transparent",
                  color: isActive ? "var(--orange)" : "var(--text-dim)",
                  borderRight: "1px solid var(--border)",
                }}
                className="last:border-r-0"
                data-testid={`tab-${tab.id}`}
              >
                <span style={{ fontSize: "1.1rem", lineHeight: 1, marginBottom: "0.2rem" }}>{tab.icon}</span>
                <span style={{ fontFamily: "var(--font-display)", fontSize: "0.55rem", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                  {tab.name}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
