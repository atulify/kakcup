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
// StatsTable — used for both Champs and Boot sections
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
    return <div className="px-4 py-8 text-center text-muted-foreground">{emptyMessage}</div>;
  }

  return (
    <table className="text-sm" style={{ width: "auto" }}>
      <thead>
        <tr className="border-b border-border bg-muted/40">
          <th className="px-4 py-2 text-left font-medium text-foreground w-12">Rank</th>
          <th className="px-4 py-2 text-left font-medium text-foreground whitespace-nowrap">KAK</th>
          <th className="px-4 py-2 text-right font-medium text-foreground w-20">Count</th>
        </tr>
      </thead>
      <tbody>
        {ranked.map((row) => {
          const isFirst = row.rank === 1;
          const rankLabel = row.tied ? `T-${row.rank}` : `${row.rank}`;
          return (
            <tr key={row.kakId} className={`border-b border-border last:border-0 hover:bg-accent/30 ${isFirst ? "bg-primary/30" : ""}`}>
              <td className={`px-4 py-2 font-extrabold ${isFirst ? "text-white" : "text-foreground"}`}>
                {rankLabel}
              </td>
              <td className={`px-4 py-2 font-medium whitespace-nowrap ${isFirst ? "text-white" : "text-foreground"}`}>
                {row.name}
              </td>
              <td className={`px-4 py-2 text-right font-medium ${isFirst ? "text-blue-200" : "text-foreground"}`}>
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
// ResultCard — one card per champ or boot group in a year
// ---------------------------------------------------------------------------
function ResultCard({ label, emoji, names, highlight }: { label: string; emoji: string; names: string[]; highlight?: boolean }) {
  const nameColor = highlight ? "text-white" : "text-foreground";
  // Split into columns of 4 when there are more than 4 names
  const columns: string[][] = [];
  for (let i = 0; i < names.length; i += 4) {
    columns.push(names.slice(i, i + 4));
  }

  return (
    <div className={`rounded-lg border p-3 flex-shrink-0 ${highlight ? "bg-primary/20 border-primary/40" : "bg-card border-border"}`}>
      <div className={`text-xs font-semibold mb-2 ${highlight ? "text-green-400" : "text-muted-foreground"}`}>
        {emoji} {label}
      </div>
      <div className="flex gap-4">
        {columns.map((col, ci) => (
          <ul key={ci} className="space-y-0.5">
            {col.map((name) => (
              <li key={name} className={`text-sm font-medium whitespace-nowrap ${nameColor}`}>
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

  const navItems: { id: Section; label: string; emoji: string }[] = [
    { id: "results", label: "Results", emoji: "📋" },
    { id: "champs", label: "Champs", emoji: "🏆" },
    { id: "boots", label: "Boot", emoji: "🥾" },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="bg-card border-b border-border py-3">
        <div className="max-w-5xl mx-auto px-4 flex items-center gap-3">
          <button
            onClick={() => setLocation("/")}
            className="btn-ghost flex items-center gap-1 px-2 py-1"
          >
            <Home size={18} />
            <span className="text-sm font-medium hidden sm:inline">Home</span>
          </button>
          <h1 className="text-xl font-bold text-primary flex items-center gap-2">
            <Trophy size={20} />
            KAK Stats
          </h1>
        </div>
      </header>

      <div className="flex flex-1 max-w-5xl mx-auto w-full">
        {/* Left nav */}
        <nav className="w-32 shrink-0 border-r border-border pt-6 px-2 space-y-1">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setSection(item.id)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                section === item.id
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              }`}
            >
              {item.emoji} {item.label}
            </button>
          ))}
        </nav>

        {/* Content */}
        <main className="flex-1 px-6 py-6 min-w-0">
          {isLoading && (
            <div className="flex items-center justify-center py-16">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
                <p className="mt-3 text-sm text-muted-foreground">Loading stats…</p>
              </div>
            </div>
          )}

          {!isLoading && section === "champs" && stats && (
            <div className="bg-card border border-border rounded-lg overflow-hidden w-fit">
              <div className="px-4 py-3 border-b border-border">
                <h2 className="text-lg font-semibold text-foreground">🏆 KAK Champs</h2>
              </div>
              <StatsTable rows={stats.champs} emptyMessage="No championship data yet." />
            </div>
          )}

          {!isLoading && section === "boots" && stats && (
            <div className="bg-card border border-border rounded-lg overflow-hidden w-fit">
              <div className="px-4 py-3 border-b border-border">
                <h2 className="text-lg font-semibold text-foreground">🥾 KAK Boot</h2>
              </div>
              <StatsTable rows={stats.boots} emptyMessage="No boot data yet." />
            </div>
          )}

          {!isLoading && section === "results" && results && (
            <div className="space-y-6">
              <h2 className="text-lg font-semibold text-foreground">📋 Results by Year</h2>
              {results.length === 0 && (
                <p className="text-muted-foreground">No results recorded yet.</p>
              )}
              {results.map((yr) => (
                <div key={yr.year}>
                  <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wide mb-2">
                    {yr.year}
                  </h3>
                  <div className="flex flex-wrap gap-3">
                    {yr.champs.length > 0 && (
                      <ResultCard label="Champs" emoji="🏆" names={yr.champs} highlight />
                    )}
                    {yr.boots.length > 0 && (
                      <ResultCard label="Boot" emoji="🥾" names={yr.boots} />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
