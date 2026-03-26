import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Trophy, Home } from "@/components/icons";
import { apiRequest } from "@/lib/queryClient";

interface KakStatRow {
  kakId: string;
  name: string;
  total: number;
}

interface KakStats {
  champs: KakStatRow[];
  boots: KakStatRow[];
}

interface YearResult {
  year: number;
  champs: string[];
  boots: string[];
}

type Section = "champs" | "boots" | "results";

// ---------------------------------------------------------------------------
// StatsTable
// ---------------------------------------------------------------------------
function StatsTable({ rows, emptyMessage }: { rows: KakStatRow[]; emptyMessage: string }) {
  const ranked = rows.map((row, i) => ({ ...row, rank: i + 1, tied: false }));
  for (let i = 1; i < ranked.length; i++) {
    if (ranked[i].total === ranked[i - 1].total) {
      ranked[i].rank = ranked[i - 1].rank;
      ranked[i].tied = true;
      ranked[i - 1].tied = true;
    }
  }

  if (rows.length === 0) {
    return (
      <div style={{ padding: "2rem", textAlign: "center", fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--text-dim)" }}>
        {emptyMessage}
      </div>
    );
  }

  return (
    <table style={{ width: "auto", fontSize: "0.85rem", fontFamily: "var(--font-mono)" }}>
      <thead>
        <tr style={{ background: "rgba(255,90,0,0.06)", borderBottom: "1px solid rgba(255,90,0,0.2)" }}>
          <th style={{ padding: "0.5rem 1rem", textAlign: "left", fontFamily: "var(--font-display)", fontSize: "0.6rem", letterSpacing: "0.1em", color: "var(--ice)", width: "4.5rem", whiteSpace: "nowrap" }}>RANK</th>
          <th style={{ padding: "0.5rem 1rem", textAlign: "left", fontFamily: "var(--font-display)", fontSize: "0.6rem", letterSpacing: "0.1em", color: "var(--ice)", whiteSpace: "nowrap" }}>KAK</th>
          <th style={{ padding: "0.5rem 1rem", textAlign: "right", fontFamily: "var(--font-display)", fontSize: "0.6rem", letterSpacing: "0.1em", color: "var(--ice)", width: "5rem" }}>COUNT</th>
        </tr>
      </thead>
      <tbody>
        {ranked.map((row) => {
          const isFirst = row.rank === 1;
          const rankLabel = row.tied ? `T-${row.rank}` : `${row.rank}`;
          return (
            <tr
              key={row.kakId}
              style={{
                borderBottom: "1px solid var(--border)",
                background: isFirst ? "rgba(255,90,0,0.12)" : "transparent",
                transition: "background 0.15s",
              }}
              onMouseEnter={(e) => { if (!isFirst) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.03)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = isFirst ? "rgba(255,90,0,0.12)" : "transparent"; }}
            >
              <td style={{ padding: "0.5rem 1rem", fontWeight: 700, color: isFirst ? "var(--orange)" : "var(--text-dim)", whiteSpace: "nowrap" }}>
                {rankLabel}
              </td>
              <td style={{ padding: "0.5rem 1rem", fontWeight: 500, whiteSpace: "nowrap", color: isFirst ? "var(--foreground)" : "var(--foreground)" }}>
                {row.name}
              </td>
              <td style={{ padding: "0.5rem 1rem", textAlign: "right", fontWeight: 600, color: isFirst ? "var(--ice)" : "var(--foreground)" }}>
                {row.total}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ---------------------------------------------------------------------------
// ResultCard
// ---------------------------------------------------------------------------
function ResultCard({ label, icon, names, highlight }: { label: string; icon: string; names: string[]; highlight?: boolean }) {
  const columns: string[][] = [];
  for (let i = 0; i < names.length; i += 4) {
    columns.push(names.slice(i, i + 4));
  }

  return (
    <div style={{
      padding: "0.75rem 1rem",
      background: highlight ? "rgba(255,90,0,0.08)" : "var(--card)",
      border: `1px solid ${highlight ? "rgba(255,90,0,0.3)" : "var(--border-hi)"}`,
      clipPath: "var(--clip-sm)",
      flexShrink: 0,
    }}>
      <div style={{ fontFamily: "var(--font-display)", fontSize: "0.6rem", letterSpacing: "0.12em", color: highlight ? "var(--orange)" : "var(--text-dim)", marginBottom: "0.5rem" }}>
        {icon} {label.toUpperCase()}
      </div>
      <div style={{ display: "flex", gap: "1rem" }}>
        {columns.map((col, ci) => (
          <ul key={ci} style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {col.map((name) => (
              <li key={name} style={{ fontFamily: "var(--font-mono)", fontSize: "0.8rem", fontWeight: 500, whiteSpace: "nowrap", color: highlight ? "var(--foreground)" : "var(--foreground)", lineHeight: 1.6 }}>
                {name}
              </li>
            ))}
          </ul>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function KakStatsPage() {
  const [, setLocation] = useLocation();
  const [section, setSection] = useState<Section>("results");

  const { data: stats, isLoading: statsLoading } = useQuery<KakStats>({
    queryKey: ["/api/kak-stats"],
    queryFn: () => apiRequest("/api/kak-stats"),
    staleTime: 30_000,
  });

  const { data: results, isLoading: resultsLoading } = useQuery<YearResult[]>({
    queryKey: ["/api/kak-results"],
    queryFn: () => apiRequest("/api/kak-results"),
    staleTime: 30_000,
  });

  const isLoading = statsLoading || resultsLoading;

  const navItems: { id: Section; label: string; icon: string }[] = [
    { id: "results", label: "Results", icon: "📋" },
    { id: "champs",  label: "Champs",  icon: "🏆" },
    { id: "boots",   label: "Boot",    icon: "🥾" },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header style={{ background: "var(--card)", borderBottom: "1px solid var(--border-hi)" }} className="py-3">
        <div className="max-w-5xl mx-auto px-4 flex items-center gap-3">
          <button
            onClick={() => setLocation("/")}
            className="btn-ghost flex items-center gap-1 text-xs"
          >
            <Home size={14} />
            <span className="hidden sm:inline">Home</span>
          </button>
          <div style={{ width: "1px", height: "16px", background: "var(--border-hi)" }} />
          <h1 style={{ fontFamily: "var(--font-display)", color: "var(--orange)", fontSize: "0.85rem", letterSpacing: "0.1em", textTransform: "uppercase", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Trophy size={16} style={{ color: "var(--orange)" }} />
            KAK <span style={{ color: "var(--ice)" }}>STATS</span>
          </h1>
        </div>
      </header>

      <div className="flex flex-1 max-w-5xl mx-auto w-full">
        {/* Left nav */}
        <nav style={{ width: "9rem", flexShrink: 0, borderRight: "1px solid var(--border-hi)", paddingTop: "1.5rem", paddingLeft: "0.5rem", paddingRight: "0.5rem" }}>
          {navItems.map((item) => {
            const isActive = section === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setSection(item.id)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "0.5rem 0.75rem",
                  marginBottom: "0.25rem",
                  fontFamily: "var(--font-display)",
                  fontSize: "0.65rem",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  background: isActive ? "rgba(255,90,0,0.1)" : "transparent",
                  color: isActive ? "var(--orange)" : "var(--text-dim)",
                  borderLeft: isActive ? "2px solid var(--orange)" : "2px solid transparent",
                  transition: "all 0.15s",
                  cursor: "pointer",
                  outline: "none",
                }}
                onMouseEnter={(e) => { if (!isActive) { (e.currentTarget as HTMLElement).style.color = "var(--foreground)"; (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.03)"; }}}
                onMouseLeave={(e) => { if (!isActive) { (e.currentTarget as HTMLElement).style.color = "var(--text-dim)"; (e.currentTarget as HTMLElement).style.background = "transparent"; }}}
              >
                {item.icon} {item.label}
              </button>
            );
          })}
        </nav>

        {/* Content */}
        <main className="flex-1 min-w-0" style={{ padding: "1.5rem" }}>
          {isLoading && (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", padding: "4rem 0" }}>
              <div className="text-center">
                <div style={{ width: "32px", height: "32px", border: "2px solid var(--border-hi)", borderTop: "2px solid var(--orange)", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto" }} />
                <p style={{ marginTop: "0.75rem", fontFamily: "var(--font-mono)", fontSize: "0.7rem", color: "var(--text-dim)" }}>LOADING STATS...</p>
              </div>
            </div>
          )}

          {!isLoading && section === "champs" && stats && (
            <div style={{ background: "var(--card)", border: "1px solid var(--border-hi)", clipPath: "var(--clip-md)", overflow: "hidden", width: "fit-content" }}>
              <div style={{ padding: "0.75rem 1rem", borderBottom: "1px solid rgba(255,90,0,0.2)", background: "rgba(255,90,0,0.06)" }}>
                <h2 style={{ fontFamily: "var(--font-display)", fontSize: "0.7rem", letterSpacing: "0.12em", color: "var(--ice)" }}>🏆 KAK CHAMPS</h2>
              </div>
              <StatsTable rows={stats.champs} emptyMessage="No championship data yet." />
            </div>
          )}

          {!isLoading && section === "boots" && stats && (
            <div style={{ background: "var(--card)", border: "1px solid var(--border-hi)", clipPath: "var(--clip-md)", overflow: "hidden", width: "fit-content" }}>
              <div style={{ padding: "0.75rem 1rem", borderBottom: "1px solid rgba(255,90,0,0.2)", background: "rgba(255,90,0,0.06)" }}>
                <h2 style={{ fontFamily: "var(--font-display)", fontSize: "0.7rem", letterSpacing: "0.12em", color: "var(--ice)" }}>🥾 KAK BOOT</h2>
              </div>
              <StatsTable rows={stats.boots} emptyMessage="No boot data yet." />
            </div>
          )}

          {!isLoading && section === "results" && results && (
            <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
              <h2 style={{ fontFamily: "var(--font-display)", fontSize: "0.7rem", letterSpacing: "0.12em", color: "var(--ice)" }}>
                📋 RESULTS BY YEAR
              </h2>
              {results.length === 0 && (
                <p style={{ fontFamily: "var(--font-mono)", fontSize: "0.8rem", color: "var(--text-dim)" }}>No results recorded yet.</p>
              )}
              {results.map((yr) => (
                <div key={yr.year}>
                  <h3 style={{ fontFamily: "var(--font-display)", fontSize: "0.6rem", letterSpacing: "0.18em", color: "var(--text-dim)", textTransform: "uppercase", marginBottom: "0.5rem" }}>
                    — {yr.year} —
                  </h3>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem" }}>
                    {yr.champs.length > 0 && (
                      <ResultCard label="Champs" icon="🏆" names={yr.champs} highlight />
                    )}
                    {yr.boots.length > 0 && (
                      <ResultCard label="Boot" icon="🥾" names={yr.boots} />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
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
