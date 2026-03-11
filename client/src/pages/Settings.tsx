import React, { lazy, Suspense, useMemo, useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Settings as SettingsIcon, Home, Trash2, Plus } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Year } from "@shared/schema";
import { calculateTop3FishTotal, rankFishTeams, rankChugTeams, rankGolfTeams } from "@shared/scoring";

const KakManagement = lazy(() => import("@/components/KakManagement"));

type Section = "years" | "kaks";

const NAV_ITEMS: { id: Section; label: string; emoji: string }[] = [
  { id: "years", label: "Years", emoji: "📅" },
  { id: "kaks", label: "KAKs", emoji: "👥" },
];

// ---------------------------------------------------------------------------
// Years section
// ---------------------------------------------------------------------------

function YearsSection() {
  const { toast } = useToast();
  const [statusYearId, setStatusYearId] = useState("");
  const [clearYearId, setClearYearId] = useState("");
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [tieBreakYearId, setTieBreakYearId] = useState("");
  const [tieBreakTeamId, setTieBreakTeamId] = useState("");
  const [tieBreakReason, setTieBreakReason] = useState("");

  const { data: years } = useQuery<Year[]>({ queryKey: ["/api/years"] });

  const { data: tieBreakTeams } = useQuery({
    queryKey: ["/api/years", tieBreakYearId, "teams"],
    queryFn: async () => {
      const response = await fetch(`/api/years/${tieBreakYearId}/teams`);
      return response.json();
    },
    enabled: !!tieBreakYearId,
    staleTime: 2_000,
  });

  const { data: tieBreakFish } = useQuery({
    queryKey: ["/api/years", tieBreakYearId, "fish-weights"],
    queryFn: async () => {
      const response = await fetch(`/api/years/${tieBreakYearId}/fish-weights`);
      return response.json();
    },
    enabled: !!tieBreakYearId,
    staleTime: 2_000,
  });

  const { data: tieBreakChug } = useQuery({
    queryKey: ["/api/years", tieBreakYearId, "chug-times"],
    queryFn: async () => {
      const response = await fetch(`/api/years/${tieBreakYearId}/chug-times`);
      return response.json();
    },
    enabled: !!tieBreakYearId,
    staleTime: 2_000,
  });

  const { data: tieBreakGolf } = useQuery({
    queryKey: ["/api/years", tieBreakYearId, "golf-scores"],
    queryFn: async () => {
      const response = await fetch(`/api/years/${tieBreakYearId}/golf-scores`);
      return response.json();
    },
    enabled: !!tieBreakYearId,
    staleTime: 2_000,
  });

  const { data: tieBreaks } = useQuery({
    queryKey: ["/api/years", tieBreakYearId, "tie-breaks"],
    queryFn: async () => {
      const response = await fetch(`/api/years/${tieBreakYearId}/tie-breaks`);
      return response.json();
    },
    enabled: !!tieBreakYearId,
    staleTime: 2_000,
  });

  const statusMutation = useMutation({
    mutationFn: ({ yearId, status }: { yearId: string; status: string }) =>
      apiRequest(`/api/years/${yearId}`, "PATCH", { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/years"] });
      toast({ title: "Status updated" });
    },
    onError: (err: any) => {
      const body = err?.responseBody;
      const msg = body?.error ?? "Failed to update status";
      toast({ title: msg, variant: "destructive" });
    },
  });

  const clearMutation = useMutation({
    mutationFn: (yearId: string) =>
      apiRequest(`/api/years/${yearId}/scores`, "DELETE"),
    onSuccess: () => {
      queryClient.invalidateQueries();
      setConfirmingClear(false);
      setClearYearId("");
      toast({ title: "Scores cleared" });
    },
    onError: () => {
      toast({ title: "Error", variant: "destructive" });
    },
  });

  const createYearMutation = useMutation({
    mutationFn: () => apiRequest("/api/years", "POST"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/years"] });
      toast({ title: "Year created" });
    },
    onError: () => {
      toast({ title: "Failed to create year", variant: "destructive" });
    },
  });

  const tieBreakMutation = useMutation({
    mutationFn: async () => {
      return apiRequest(`/api/years/${tieBreakYearId}/tie-breaks`, "POST", {
        teamId: tieBreakTeamId,
        event: "golf",
        deltaPoints: 0.5,
        reason: tieBreakReason,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/years", tieBreakYearId, "tie-breaks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/years", tieBreakYearId, "teams"] });
      queryClient.invalidateQueries();
      setTieBreakReason("");
      toast({ title: "Tie-break applied" });
    },
    onError: (err: any) => {
      const body = err?.responseBody;
      const msg = body?.error ?? "Failed to apply tie-break";
      toast({ title: msg, variant: "destructive" });
    },
  });

  const deleteTieBreakMutation = useMutation({
    mutationFn: async () => {
      return apiRequest(`/api/years/${tieBreakYearId}/tie-breaks`, "DELETE");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/years", tieBreakYearId, "tie-breaks"] });
      queryClient.invalidateQueries();
      toast({ title: "Tie-break removed" });
    },
    onError: (err: any) => {
      const body = err?.responseBody;
      const msg = body?.error ?? "Failed to remove tie-break";
      toast({ title: msg, variant: "destructive" });
    },
  });

  const sortedYears = [...(years || [])].sort((a, b) => b.year - a.year);
  const selectedStatusYear = sortedYears.find((y) => y.id === statusYearId);
  const nonCompletedYears = sortedYears.filter((y) => y.status !== "completed");
  const tieBreakYear = sortedYears.find((y) => y.id === tieBreakYearId);
  const completedYears = sortedYears.filter((y) => y.status === "completed");

  const tieBreakInfo = useMemo(() => {
    if (!tieBreakYearId) return null;
    if (!tieBreakTeams || !Array.isArray(tieBreakTeams)) return null;

    const teams = tieBreakTeams as any[];
    const fishWeights = Array.isArray(tieBreakFish) ? tieBreakFish : [];
    const chugTimes = Array.isArray(tieBreakChug) ? tieBreakChug : [];
    const golfScores = Array.isArray(tieBreakGolf) ? tieBreakGolf : [];

    const fishByTeam = new Map<string, number[]>();
    fishWeights.forEach((fw: any) => {
      const weight = parseFloat(fw.weight?.toString() || "0");
      if (weight > 0) {
        if (!fishByTeam.has(fw.teamId)) fishByTeam.set(fw.teamId, []);
        fishByTeam.get(fw.teamId)!.push(weight);
      }
    });

    const chugAverages = new Map<string, number>();
    chugTimes
      .filter((ct: any) => ct.average && parseFloat(ct.average) > 0)
      .forEach((ct: any) => {
        chugAverages.set(ct.teamId, parseFloat(ct.average?.toString() || "999"));
      });

    const golfScoresMap = new Map<string, number>();
    golfScores
      .filter((gs: any) => gs.score !== null && gs.score !== undefined)
      .forEach((gs: any) => {
        golfScoresMap.set(gs.teamId, parseInt(gs.score?.toString() || "999"));
      });

    const completeTeams = teams.filter((t: any) => chugAverages.has(t.id) && golfScoresMap.has(t.id));
    if (completeTeams.length === 0) return { tiedTeams: [], maxPoints: 0 };

    const fishTotals = new Map(
      completeTeams.map((t: any) => [t.id, calculateTop3FishTotal(fishByTeam.get(t.id) ?? [])])
    );

    const fishPoints = new Map(rankFishTeams(fishTotals).map((p) => [p.teamId, p.points]));
    const chugPoints = new Map(
      rankChugTeams(new Map(completeTeams.map((t: any) => [t.id, chugAverages.get(t.id)!]))).map((p) => [p.teamId, p.points])
    );
    const golfPoints = new Map(
      rankGolfTeams(new Map(completeTeams.map((t: any) => [t.id, golfScoresMap.get(t.id)!]))).map((p) => [p.teamId, p.points])
    );

    const totals = new Map<string, number>();
    completeTeams.forEach((t: any) => {
      const total = (fishPoints.get(t.id) || 0) + (chugPoints.get(t.id) || 0) + (golfPoints.get(t.id) || 0);
      totals.set(t.id, total);
    });

    const totalsArray = Array.from(totals.values());
    const maxPoints = totalsArray.length > 0 ? Math.max(...totalsArray) : 0;
    const tiedTeams = completeTeams.filter((t: any) => (totals.get(t.id) || 0) === maxPoints);

    return { tiedTeams, maxPoints };
  }, [tieBreakYearId, tieBreakTeams, tieBreakFish, tieBreakChug, tieBreakGolf]);

  useEffect(() => {
    if (!tieBreakInfo || tieBreakInfo.tiedTeams.length === 0) {
      setTieBreakTeamId("");
      return;
    }
    if (!tieBreakInfo.tiedTeams.some((t: any) => t.id === tieBreakTeamId)) {
      setTieBreakTeamId(tieBreakInfo.tiedTeams[0].id);
    }
  }, [tieBreakInfo, tieBreakTeamId]);

  const sectionStyle: React.CSSProperties = {
    background: "var(--card)",
    border: "1px solid var(--border-hi)",
    clipPath: "var(--clip-md)",
    padding: "1.25rem 1.5rem",
    marginBottom: "1.25rem",
  };

  const sectionTitleStyle: React.CSSProperties = {
    fontFamily: "var(--font-display)",
    fontSize: "0.65rem",
    letterSpacing: "0.15em",
    textTransform: "uppercase",
    color: "var(--ice)",
    marginBottom: "1rem",
  };

  const selectStyle: React.CSSProperties = {
    width: "100%",
    padding: "0.5rem 0.75rem",
    background: "var(--input)",
    color: "var(--foreground)",
    border: "1px solid var(--border-hi)",
    fontFamily: "var(--font-mono)",
    fontSize: "0.85rem",
    clipPath: "var(--clip-sm)",
    outline: "none",
    marginBottom: "1rem",
    cursor: "pointer",
  };

  return (
    <div>
      {/* Year Status */}
      <section style={sectionStyle}>
        <h2 style={sectionTitleStyle}>⬡ Year Status</h2>
        <select value={statusYearId} onChange={(e) => setStatusYearId(e.target.value)} style={selectStyle}>
          <option value="">— Select a year —</option>
          {sortedYears.map((y) => (
            <option key={y.id} value={y.id}>{y.year} — {y.name}</option>
          ))}
        </select>

        {selectedStatusYear && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--text-dim)" }}>
              Current status:{" "}
              <span style={{ color: "var(--ice)", fontWeight: 600, textTransform: "uppercase" }}>
                {selectedStatusYear.status}
              </span>
            </div>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              {(["upcoming", "active", "completed"] as const).map((s) => (
                <Button
                  key={s}
                  size="sm"
                  variant={selectedStatusYear.status === s ? "default" : "outline"}
                  disabled={selectedStatusYear.status === s || statusMutation.isPending}
                  onClick={() => statusMutation.mutate({ yearId: statusYearId, status: s })}
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </Button>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Create Next Year */}
      <section style={sectionStyle}>
        <h2 style={sectionTitleStyle}>⬡ Create Next Year</h2>
        <Button
          size="sm"
          disabled={createYearMutation.isPending || !sortedYears.length}
          onClick={() => createYearMutation.mutate()}
          className="flex items-center gap-2"
        >
          <Plus size={14} />
          {createYearMutation.isPending
            ? "Creating..."
            : `Create ${sortedYears.length ? sortedYears[0].year + 1 : "Year"}`}
        </Button>
      </section>

      {/* Clear Scores */}
      <section style={sectionStyle}>
        <h2 style={sectionTitleStyle}>⬡ Clear Scores</h2>
        <select
          value={clearYearId}
          onChange={(e) => { setClearYearId(e.target.value); setConfirmingClear(false); }}
          style={selectStyle}
        >
          <option value="">— Select a year —</option>
          {nonCompletedYears.map((y) => (
            <option key={y.id} value={y.id}>{y.year} — {y.name}</option>
          ))}
        </select>

        {!confirmingClear ? (
          <Button
            variant="destructive"
            size="sm"
            disabled={!clearYearId}
            onClick={() => setConfirmingClear(true)}
            className="flex items-center gap-2"
          >
            <Trash2 size={14} />
            Clear Scores
          </Button>
        ) : (
          <div style={{ padding: "1rem", background: "rgba(204,34,0,0.08)", border: "1px solid rgba(204,34,0,0.3)", clipPath: "var(--clip-sm)", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <p style={{ fontFamily: "var(--font-mono)", fontSize: "0.8rem", color: "var(--foreground)" }}>
              Are you sure? This will delete all fish weights, chug times, and golf scores for this year.
            </p>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <Button
                variant="destructive"
                size="sm"
                disabled={clearMutation.isPending}
                onClick={() => clearMutation.mutate(clearYearId)}
              >
                {clearMutation.isPending ? "Clearing..." : "Confirm"}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setConfirmingClear(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </section>

      {/* Tie-break */}
      <section style={sectionStyle}>
        <h2 style={sectionTitleStyle}>⬡ Tie-Break</h2>
        <select
          value={tieBreakYearId}
          onChange={(e) => { setTieBreakYearId(e.target.value); setTieBreakTeamId(""); }}
          style={selectStyle}
        >
          <option value="">— Select a completed year —</option>
          {completedYears.map((y) => (
            <option key={y.id} value={y.id}>{y.year} — {y.name}</option>
          ))}
        </select>

        {tieBreakYear && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--text-dim)" }}>
              Status:{" "}
              <span style={{ color: "var(--ice)", fontWeight: 600, textTransform: "uppercase" }}>
                {tieBreakYear.status}
              </span>
            </div>

            {tieBreaks && Array.isArray(tieBreaks) && tieBreaks.length > 0 ? (
              <div style={{ padding: "0.75rem", background: "rgba(0,170,120,0.08)", border: "1px solid rgba(0,170,120,0.3)", clipPath: "var(--clip-sm)", fontFamily: "var(--font-mono)", fontSize: "0.75rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                <div>Tie-break already applied for this year.</div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={deleteTieBreakMutation.isPending}
                  onClick={() => deleteTieBreakMutation.mutate()}
                >
                  {deleteTieBreakMutation.isPending ? "Removing..." : "Remove Tie-break"}
                </Button>
              </div>
            ) : (
              <>
                {tieBreakInfo && tieBreakInfo.tiedTeams.length > 1 ? (
                  <>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--text-dim)" }}>
                      Tie detected at {tieBreakInfo.maxPoints} points.
                    </div>
                    <select
                      value={tieBreakTeamId}
                      onChange={(e) => setTieBreakTeamId(e.target.value)}
                      style={selectStyle}
                    >
                      {tieBreakInfo.tiedTeams.map((team: any) => (
                        <option key={team.id} value={team.id}>{team.name}</option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={tieBreakReason}
                      onChange={(e) => setTieBreakReason(e.target.value)}
                      placeholder="Reason (optional)"
                      style={{ ...selectStyle, marginBottom: 0, cursor: "text" }}
                    />
                    <Button
                      size="sm"
                      disabled={!tieBreakTeamId || tieBreakMutation.isPending || tieBreakYear.status !== "completed"}
                      onClick={() => tieBreakMutation.mutate()}
                    >
                      {tieBreakMutation.isPending ? "Applying..." : "Apply +0.5 Golf Bonus"}
                    </Button>
                  </>
                ) : (
                  <div style={{ padding: "0.75rem", background: "rgba(255,90,0,0.08)", border: "1px solid rgba(255,90,0,0.2)", clipPath: "var(--clip-sm)", fontFamily: "var(--font-mono)", fontSize: "0.75rem" }}>
                    No tie for first place detected.
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page shell
// ---------------------------------------------------------------------------

export default function Settings() {
  const [, setLocation] = useLocation();
  const { isAdmin, isLoading: authLoading } = useAuth();
  const [activeSection, setActiveSection] = useState<Section>("years");

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.8rem", color: "var(--text-dim)" }}>LOADING...</div>
      </div>
    );
  }

  if (!isAdmin) {
    setLocation("/");
    return null;
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header style={{ background: "var(--card)", borderBottom: "1px solid var(--border-hi)" }} className="py-3">
        <div className="max-w-5xl mx-auto px-3 sm:px-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <SettingsIcon size={16} style={{ color: "var(--ice)" }} />
              <h1 style={{ fontFamily: "var(--font-display)", color: "var(--orange)", fontSize: "0.85rem", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                Settings
              </h1>
            </div>
            <button onClick={() => setLocation("/")} className="btn-ghost flex items-center gap-1 text-xs">
              <Home size={14} />
              <span className="hidden sm:inline">Home</span>
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 max-w-5xl mx-auto w-full px-3 sm:px-6 py-6">
        <div className="flex gap-6">
          {/* Side nav */}
          <nav style={{ width: "9rem", flexShrink: 0 }} data-testid="settings-sidenav">
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.25rem" }}>
              {NAV_ITEMS.map((item) => {
                const isActive = activeSection === item.id;
                return (
                  <li key={item.id}>
                    <button
                      onClick={() => setActiveSection(item.id)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                        width: "100%",
                        padding: "0.5rem 0.75rem",
                        fontFamily: "var(--font-display)",
                        fontSize: "0.65rem",
                        letterSpacing: "0.1em",
                        textTransform: "uppercase",
                        background: isActive ? "rgba(255,90,0,0.1)" : "transparent",
                        color: isActive ? "var(--orange)" : "var(--text-dim)",
                        borderLeft: isActive ? "2px solid var(--orange)" : "2px solid transparent",
                        cursor: "pointer",
                        outline: "none",
                        transition: "all 0.15s",
                      }}
                      data-testid={`nav-${item.id}`}
                    >
                      <span>{item.emoji}</span>
                      {item.label}
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* Content */}
          <main className="flex-1 min-w-0">
            {activeSection === "years" && <YearsSection />}
            {activeSection === "kaks" && (
              <Suspense fallback={
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--text-dim)", textAlign: "center", padding: "2rem 0" }}>
                  LOADING...
                </div>
              }>
                <KakManagement />
              </Suspense>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
