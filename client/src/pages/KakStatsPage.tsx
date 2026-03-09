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

function StatsTable({
  title,
  emoji,
  rows,
  emptyMessage,
}: {
  title: string;
  emoji: string;
  rows: KakStatRow[];
  emptyMessage: string;
}) {
  // Assign display rank (tied entries share the same rank)
  const ranked = rows.map((row, i, arr) => {
    const rank = i === 0 ? 1 : arr[i - 1].total === row.total
      ? -1  // will be resolved below
      : i + 1;
    return { ...row, rank };
  });
  // Second pass: fill in tied ranks
  let lastRank = 1;
  for (let i = 0; i < ranked.length; i++) {
    if (i === 0) { lastRank = 1; continue; }
    if (ranked[i].total === ranked[i - 1].total) {
      ranked[i].rank = ranked[i - 1].rank;
    } else {
      lastRank = i + 1;
      ranked[i].rank = lastRank;
    }
  }

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-border bg-card">
        <h2 className="text-lg font-semibold text-foreground">
          {emoji} {title}
        </h2>
      </div>

      {rows.length === 0 ? (
        <div className="px-4 py-8 text-center text-muted-foreground">{emptyMessage}</div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="px-4 py-2 text-left font-medium text-foreground w-12">Rank</th>
              <th className="px-4 py-2 text-left font-medium text-foreground">KAK</th>
              <th className="px-4 py-2 text-right font-medium text-foreground w-24">Count</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((row, i) => (
              <tr key={row.kakId} className="border-b border-border last:border-0 hover:bg-accent/30">
                <td className="px-4 py-2 text-muted-foreground font-medium">
                  {row.rank}
                  {i > 0 && ranked[i - 1].total === row.total ? "" : ""}
                </td>
                <td className="px-4 py-2 text-foreground font-medium">{row.name}</td>
                <td className="px-4 py-2 text-right text-foreground">{row.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default function KakStatsPage() {
  const [, setLocation] = useLocation();

  const { data: stats, isLoading, isError } = useQuery<KakStats>({
    queryKey: ["/api/kak-stats"],
    queryFn: () => apiRequest("/api/kak-stats"),
    staleTime: 30_000,
  });

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="bg-card border-b border-border py-3">
        <div className="max-w-3xl mx-auto px-4 flex items-center gap-3">
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

      <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-6 space-y-6">
        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
              <p className="mt-3 text-sm text-muted-foreground">Loading stats…</p>
            </div>
          </div>
        )}

        {isError && (
          <div className="text-center py-16 text-destructive">
            Failed to load KAK stats. Please try again.
          </div>
        )}

        {stats && (
          <>
            <StatsTable
              title="KAK Champs"
              emoji="🏆"
              rows={stats.champs}
              emptyMessage="No championship data yet."
            />
            <StatsTable
              title="KAK Boot"
              emoji="🥾"
              rows={stats.boots}
              emptyMessage="No boot data yet."
            />
          </>
        )}
      </main>
    </div>
  );
}
