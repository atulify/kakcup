import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Trophy, ArrowRight, LogOut, LogIn, Github, Settings } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { apiRequest, publicFetchJson } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { handleLogout } from "@/utils/auth";
import type { Year } from "@/lib/api-types";

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

  const { data: years = [], isLoading: yearsLoading } = useQuery<Year[]>({
    queryKey: ["/api/years"],
    queryFn: ({ signal }) => publicFetchJson("/api/years", { signal }),
  });
  const [showYearsLoader, setShowYearsLoader] = useState(yearsLoading);

  useEffect(() => {
    if (yearsLoading) {
      setShowYearsLoader(true);
      return;
    }

    if (!showYearsLoader) return;

    const timeoutId = window.setTimeout(() => setShowYearsLoader(false), 260);
    return () => window.clearTimeout(timeoutId);
  }, [yearsLoading, showYearsLoader]);

  const visibleYears = [...years]
    .filter((yearData) => yearData.status !== "archived")
    .sort((a, b) => b.year - a.year);

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
      <header style={{ background: "var(--card)", borderTop: "4px solid var(--orange)", borderBottom: "1px solid var(--border-hi)" }} className="py-3 px-4">
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
              className="btn-ghost flex items-center gap-1.5 text-xs" aria-label="KAK History"
            >
              <Trophy size={14} />
              <span className="hidden sm:inline">KAK History</span>
            </button>

            {isAuthenticated ? (
              <>
                <span style={{ color: "var(--text-dim)", fontSize: "0.75rem", fontFamily: "var(--font-mono)" }}>
                  {user?.username}
                  {user?.role === 'admin' && (
                    <span style={{ marginLeft: "0.5rem", padding: "0.1rem 0.4rem", background: "rgba(255,90,0,0.15)", color: "var(--orange)", fontSize: "0.65rem", fontFamily: "var(--font-display)", letterSpacing: "0.08em" }}>
                      ADMIN
                    </span>
                  )}
                </span>
                {user?.role === 'admin' && (
                  <button
                    onClick={() => setLocation('/settings')}
                    className="btn-ghost p-1.5" aria-label="Settings"
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
      <main className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-lg text-center">

          {/* Title */}
          <div className="mb-2">
            <h1
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "clamp(2.5rem, 8vw, 4.5rem)",
                fontWeight: 900,
                letterSpacing: "0.02em",
                textTransform: "uppercase",
                lineHeight: 1,
                color: "var(--foreground)",
              }}
              data-testid="title-kak-cup"
            >
              KAK CUP
            </h1>
          </div>

          {/* Subtitle */}
          <div className="mb-6" style={{ fontFamily: "var(--font-display)", fontSize: "0.75rem", letterSpacing: "0.08em", color: "var(--text-dim)", textTransform: "uppercase" }}>
            Est. 1999
          </div>


          {/* Year selector */}
          <div className="mb-6">
            <div className="relative" aria-busy={showYearsLoader}>
              <select
                id="year-select"
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                disabled={showYearsLoader}
                aria-label="Year"
                className={`b3-focus year-select-control${yearsLoading ? " year-select-control--loading" : ""}`}
                style={{
                  width: "100%",
                  padding: "0.75rem 1rem",
                  background: "var(--input)",
                  color: "var(--foreground)",
                  border: "1px solid var(--border-hi)",
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.9rem",
                  borderRadius: "6px",
                  minHeight: "44px",
                  cursor: showYearsLoader ? "wait" : "pointer",
                }}
                data-testid="select-year"
              >
                <option value="">— SELECT YEAR —</option>
                {visibleYears.map((yearData) => (
                  <option key={yearData.year} value={yearData.year} data-testid={`option-year-${yearData.year}`}>
                    {yearData.year} — {yearData.name}
                  </option>
                ))}
              </select>

              {showYearsLoader && (
                <div
                  className={`year-select-loader${yearsLoading ? "" : " year-select-loader--complete"}`}
                  role="status"
                  aria-live="polite"
                  aria-label={yearsLoading ? "Loading years" : "Years loaded"}
                >
                  <svg className="year-select-ring" viewBox="0 0 24 24" aria-hidden="true">
                    <circle className="year-select-ring__track" cx="12" cy="12" r="9" pathLength="100" />
                    <circle className="year-select-ring__progress" cx="12" cy="12" r="9" pathLength="100" />
                  </svg>
                  <span>{yearsLoading ? "LOADING YEARS..." : "YEARS READY"}</span>
                </div>
              )}
            </div>
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
          {/* Poem */}
          <div className="mt-8 mx-auto max-w-sm">
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.8rem", lineHeight: 1.7, color: "var(--text-dim)" }}>
              <div>We get together but once a year,</div>
              <div>To fish, to golf, to chug some beer,</div>
              <div>So raise your glasses for a cheers,</div>
              <div>We'll be KAKs for years and years</div>
            </div>
          </div>

          {/* Event summary */}
          <div className="mt-7 grid grid-cols-3 gap-3">
            {[
              { title: "Fishing", desc: "Top 3 fish by weight" },
              { title: "Beer chug", desc: "4-person relay" },
              { title: "Golf", desc: "4-person scramble" },
            ].map((item) => (
              <div key={item.title}>
                <div style={{ fontWeight: 700, fontSize: "0.8rem", color: "var(--foreground)" }}>{item.title}</div>
                <div style={{ fontSize: "0.7rem", color: "var(--text-dim)", marginTop: "0.25rem" }}>{item.desc}</div>
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
