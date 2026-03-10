import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Trophy, ArrowRight, LogOut, LogIn, Github, Settings } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { handleLogout } from "@/utils/auth";
import type { Year } from "@shared/schema";

export default function SelectYear() {
  const [selectedYear, setSelectedYear] = useState<string>("");
  const [, setLocation] = useLocation();
  const { user, isAuthenticated, isLoading } = useAuth();

  // Prefetch YearPage chunk on idle so navigation is instant on 3G
  useEffect(() => {
    const prefetch = () => { import("@/pages/YearPage"); };
    if ("requestIdleCallback" in window) {
      const id = requestIdleCallback(prefetch);
      return () => cancelIdleCallback(id);
    }
    const id = setTimeout(prefetch, 2000);
    return () => clearTimeout(id);
  }, []);

  const { data: years, isLoading: yearsLoading } = useQuery({
    queryKey: ["/api/years"],
    queryFn: async () => {
      const response = await fetch("/api/years");
      return response.json();
    },
  });

  const handleYearSelection = async () => {
    if (!selectedYear) return;
    const year = parseInt(selectedYear);
    const yearRecord = years?.find((y: Year) => y.year === year);
    if (yearRecord) {
      setLocation(`/year/${year}`);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header style={{ background: "var(--card)", borderBottom: "1px solid var(--border-hi)" }} className="py-3 px-4">
        <div className="max-w-7xl mx-auto flex items-center">
          <div className="flex items-center gap-2">
            <Trophy style={{ color: "var(--orange)" }} size={20} />
            <span style={{ fontFamily: "var(--font-display)", color: "var(--orange)", fontSize: "1rem", letterSpacing: "0.1em", textTransform: "uppercase" }}>
              KAK Cup
            </span>
          </div>

          <div className="flex items-center gap-3 ml-auto">
            <button
              onClick={() => setLocation('/kak-stats')}
              className="btn-ghost flex items-center gap-1.5 text-xs"
            >
              <Trophy size={14} />
              <span className="hidden sm:inline">KAK History</span>
            </button>

            {isAuthenticated ? (
              <>
                <span style={{ color: "var(--text-dim)", fontSize: "0.75rem", fontFamily: "var(--font-mono)" }}>
                  {user?.firstName || user?.username}
                  {user?.role === 'admin' && (
                    <span style={{ marginLeft: "0.5rem", padding: "0.1rem 0.4rem", background: "rgba(255,90,0,0.15)", color: "var(--orange)", fontSize: "0.65rem", fontFamily: "var(--font-display)", letterSpacing: "0.08em" }}>
                      ADMIN
                    </span>
                  )}
                </span>
                {user?.role === 'admin' && (
                  <button
                    onClick={() => setLocation('/settings')}
                    className="btn-ghost p-1.5"
                  >
                    <Settings size={14} style={{ color: "var(--ice)" }} />
                  </button>
                )}
                <button onClick={handleLogout} className="btn-ghost flex items-center gap-1.5 text-xs">
                  <LogOut size={14} />
                  <span className="hidden sm:inline">Logout</span>
                </button>
              </>
            ) : (
              <button onClick={() => setLocation('/login')} className="btn-ghost flex items-center gap-1.5 text-xs">
                <LogIn size={14} />
                <span>Login</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-lg text-center">

          {/* Logo mark */}
          <div className="mb-10 flex justify-center">
            <div style={{
              position: "relative",
              width: "96px",
              height: "96px",
              clipPath: "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)",
              background: "linear-gradient(135deg, rgba(255,90,0,0.15) 0%, rgba(255,90,0,0.05) 100%)",
              border: "1px solid rgba(255,90,0,0.4)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}>
              <Trophy size={40} style={{ color: "var(--orange)" }} />
            </div>
          </div>

          {/* Title */}
          <div className="mb-2">
            <h1
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "clamp(2.5rem, 8vw, 4.5rem)",
                fontWeight: 900,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                lineHeight: 1,
                WebkitTextStroke: "1px var(--orange)",
                color: "var(--orange)",
                textShadow: "0 0 20px rgba(255,90,0,0.4), 0 0 40px rgba(255,90,0,0.15)",
              }}
              data-testid="title-kak-cup"
            >
              KAK CUP
            </h1>
          </div>

          {/* Subtitle */}
          <div className="mb-10" style={{ fontFamily: "var(--font-display)", fontSize: "0.65rem", letterSpacing: "0.25em", color: "var(--ice)", textTransform: "uppercase", opacity: 0.7 }}>
            Est. 1999
          </div>

          {/* Poem */}
          <div className="mb-10 mx-auto max-w-sm" style={{
            padding: "1.25rem 1.5rem",
            border: "1px solid var(--border-hi)",
            borderLeft: "3px solid var(--orange)",
            background: "rgba(255,90,0,0.03)",
          }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.8rem", lineHeight: 1.9, color: "var(--text-dim)" }}>
              <div>We get together but once a year,</div>
              <div>To fish, to golf, to chug some beer,</div>
              <div>So raise your glasses for a cheers,</div>
              <div>We'll be KAKs for years and years</div>
            </div>
          </div>

          {/* Year selector */}
          <div className="mb-6">
            <select
              id="year-select"
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="b3-focus"
              style={{
                width: "100%",
                padding: "0.75rem 1rem",
                background: "var(--input)",
                color: "var(--foreground)",
                border: "1px solid var(--border-hi)",
                fontFamily: "var(--font-mono)",
                fontSize: "0.9rem",
                clipPath: "var(--clip-sm)",
                cursor: "pointer",
              }}
              data-testid="select-year"
            >
              <option value="">— SELECT YEAR —</option>
              {yearsLoading ? (
                <option disabled>LOADING...</option>
              ) : (
                (() => {
                  const currentYear = new Date().getFullYear();
                  const sortedYears = [...(years || [])].sort((a: Year, b: Year) => {
                    if (a.year === currentYear && b.year !== currentYear) return -1;
                    if (b.year === currentYear && a.year !== currentYear) return 1;
                    const aIsPast = a.year < currentYear;
                    const bIsPast = b.year < currentYear;
                    if (aIsPast && !bIsPast) return -1;
                    if (bIsPast && !aIsPast) return 1;
                    return b.year - a.year;
                  });

                  return sortedYears.map((yearData: Year) => {
                    let statusText = "";
                    if (yearData.year < currentYear) statusText = " [DONE]";
                    else if (yearData.year > currentYear) statusText = " [UPCOMING]";
                    return (
                      <option key={yearData.year} value={yearData.year} data-testid={`option-year-${yearData.year}`}>
                        {yearData.year} — {yearData.name}{statusText}
                      </option>
                    );
                  });
                })()
              )}
            </select>
          </div>

          {/* Enter button */}
          <button
            onClick={handleYearSelection}
            disabled={!selectedYear}
            className="btn-primary text-sm mx-auto flex items-center gap-3"
            style={{ padding: "0.875rem 2.5rem", fontSize: "0.8rem" }}
            data-testid="button-continue"
          >
            <span>ENTER TOURNAMENT</span>
            <ArrowRight size={16} />
          </button>

          {/* Event icons */}
          <div className="mt-16 grid grid-cols-3 gap-4">
            {[
              { emoji: "🎣", title: "FISHING", desc: "Top-3 fish by weight" },
              { emoji: "🍺", title: "BEER CHUG", desc: "4-man relay race" },
              { emoji: "⛳", title: "GOLF", desc: "4-man scramble" },
            ].map((item) => (
              <div key={item.title} style={{
                padding: "1rem",
                background: "var(--card)",
                border: "1px solid var(--border-hi)",
                clipPath: "var(--clip-sm)",
              }}>
                <div style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>{item.emoji}</div>
                <div style={{ fontFamily: "var(--font-display)", fontSize: "0.6rem", letterSpacing: "0.12em", color: "var(--orange)", marginBottom: "0.25rem" }}>
                  {item.title}
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
                  {item.desc}
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-6 text-center" style={{ borderTop: "1px solid var(--border)" }}>
        <div className="flex items-center justify-center gap-2">
          <a
            href="https://github.com/atulify/kakcup/"
            target="_blank"
            rel="noopener noreferrer"
            className="footer-link flex items-center gap-1.5"
            style={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem" }}
          >
            <Github size={12} />
            <span>atulify/kakcup</span>
          </a>
        </div>
        <p style={{ fontFamily: "var(--font-mono)", fontSize: "0.65rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
          {__COMMIT_HASH__}
        </p>
      </footer>
    </div>
  );
}
