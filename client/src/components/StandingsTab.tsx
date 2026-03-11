import { useMemo, memo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Team } from "@shared/schema";
import { calculateTop3FishTotal, rankFishTeams, rankChugTeams, rankGolfTeams } from "@shared/scoring";

interface StandingsTabProps {
  yearId: string;
}

const StandingsTab = memo(function StandingsTab({ yearId }: StandingsTabProps) {
  // All useQuery hooks first
  const { data: teams, isLoading: teamsLoading } = useQuery({
    queryKey: ["/api/years", yearId, "teams"],
    queryFn: async () => {
      const response = await fetch(`/api/years/${yearId}/teams`);
      return response.json();
    },
    staleTime: 2_000,
  });

  const { data: fishWeights, isLoading: fishLoading } = useQuery({
    queryKey: ["/api/years", yearId, "fish-weights"],
    queryFn: async () => {
      const response = await fetch(`/api/years/${yearId}/fish-weights`);
      return response.json();
    },
    staleTime: 2_000,
  });

  const { data: chugTimes, isLoading: chugLoading } = useQuery({
    queryKey: ["/api/years", yearId, "chug-times"],
    queryFn: async () => {
      const response = await fetch(`/api/years/${yearId}/chug-times`);
      return response.json();
    },
    staleTime: 2_000,
  });

  const { data: golfScores, isLoading: golfLoading } = useQuery({
    queryKey: ["/api/years", yearId, "golf-scores"],
    queryFn: async () => {
      const response = await fetch(`/api/years/${yearId}/golf-scores`);
      return response.json();
    },
    staleTime: 2_000,
  });

  const { data: tieBreaks, isLoading: tieBreaksLoading } = useQuery({
    queryKey: ["/api/years", yearId, "tie-breaks"],
    queryFn: async () => {
      const response = await fetch(`/api/years/${yearId}/tie-breaks`);
      return response.json();
    },
    staleTime: 2_000,
  });

  // All useMemo hooks - must be called unconditionally
  const sortedTeams = useMemo(() => {
    if (!teams || !Array.isArray(teams)) return [];
    return [...teams].sort((a: Team, b: Team) => a.position - b.position);
  }, [teams]);

  const standings = useMemo(() => {
    if (sortedTeams.length === 0) return [];

    // Calculate Fish Points
    const fishPointsMap = new Map<string, number>();
    if (fishWeights && Array.isArray(fishWeights) && fishWeights.length > 0) {
      const teamWeights = new Map<string, number[]>();
      fishWeights.forEach((fw: any) => {
        const weight = parseFloat(fw.weight?.toString() || '0');
        if (weight > 0) {
          if (!teamWeights.has(fw.teamId)) {
            teamWeights.set(fw.teamId, []);
          }
          teamWeights.get(fw.teamId)!.push(weight);
        }
      });

      const teamTotals = new Map<string, number>();
      teamWeights.forEach((weights, teamId) => {
        const total = calculateTop3FishTotal(weights);
        teamTotals.set(teamId, total);
      });

      const teamPoints = rankFishTeams(teamTotals);
      teamPoints.forEach(({ teamId, points }) => {
        fishPointsMap.set(teamId, points);
      });
    }

    // Calculate Chug Points
    const chugPointsMap = new Map<string, number>();
    if (chugTimes && Array.isArray(chugTimes) && chugTimes.length > 0) {
      const teamAverages = new Map<string, number>();
      chugTimes
        .filter((ct: any) => ct.average && parseFloat(ct.average) > 0)
        .forEach((ct: any) => {
          teamAverages.set(ct.teamId, parseFloat(ct.average?.toString() || '999'));
        });

      const teamPoints = rankChugTeams(teamAverages);
      teamPoints.forEach(({ teamId, points }) => {
        chugPointsMap.set(teamId, points);
      });
    }

    // Calculate Golf Points
    const golfPointsMap = new Map<string, number>();
    if (golfScores && Array.isArray(golfScores) && golfScores.length > 0) {
      const teamScores = new Map<string, number>();
      golfScores
        .filter((gs: any) => gs.score !== null && gs.score !== undefined)
        .forEach((gs: any) => {
          teamScores.set(gs.teamId, parseInt(gs.score?.toString() || '999'));
        });

      const teamPoints = rankGolfTeams(teamScores);
      teamPoints.forEach(({ teamId, points }) => {
        golfPointsMap.set(teamId, points);
      });
    }

    // Apply tie-break adjustments
    const fishAdjustments = new Map<string, number>();
    const chugAdjustments = new Map<string, number>();
    const golfAdjustments = new Map<string, number>();
    const totalAdjustments = new Map<string, number>();
    if (tieBreaks && Array.isArray(tieBreaks)) {
      tieBreaks.forEach((tb: any) => {
        const teamId = tb.teamId;
        const delta = parseFloat(tb.deltaPoints?.toString() || "0");
        if (!teamId || !Number.isFinite(delta)) return;
        const event = tb.event;
        if (event === "fish") {
          fishAdjustments.set(teamId, (fishAdjustments.get(teamId) || 0) + delta);
        } else if (event === "chug") {
          chugAdjustments.set(teamId, (chugAdjustments.get(teamId) || 0) + delta);
        } else if (event === "golf") {
          golfAdjustments.set(teamId, (golfAdjustments.get(teamId) || 0) + delta);
        } else {
          totalAdjustments.set(teamId, (totalAdjustments.get(teamId) || 0) + delta);
        }
      });
    }

    // Calculate total standings
    const standingsData = sortedTeams.map((team: Team) => {
      const members = [team.kak1, team.kak2, team.kak3, team.kak4].filter(Boolean);
      const fishPoints = (fishPointsMap.get(team.id) || 0) + (fishAdjustments.get(team.id) || 0);
      const chugPoints = (chugPointsMap.get(team.id) || 0) + (chugAdjustments.get(team.id) || 0);
      const golfPoints = (golfPointsMap.get(team.id) || 0) + (golfAdjustments.get(team.id) || 0);
      const totalPoints = fishPoints + chugPoints + golfPoints + (totalAdjustments.get(team.id) || 0);

      return {
        team,
        members,
        fishPoints,
        chugPoints,
        golfPoints,
        totalPoints
      };
    });

    // Sort by total points (highest first)
    standingsData.sort((a, b) => b.totalPoints - a.totalPoints);

    // Pre-calculate rank information and place info to avoid repeated filtering during render
    const teamsWithPoints = standingsData.filter(s => s.totalPoints > 0);
    const maxPoints = teamsWithPoints.length > 0 ? Math.max(...teamsWithPoints.map(s => s.totalPoints)) : 0;
    const minPoints = teamsWithPoints.length > 0 ? Math.min(...teamsWithPoints.map(s => s.totalPoints)) : 0;

    // Enrich standings with rank display and place info
    return standingsData.map((standing, index) => {
      let rankDisplay = "-";
      if (standing.totalPoints > 0) {
        const tiedTeams = standingsData.filter(s => s.totalPoints === standing.totalPoints);
        if (tiedTeams.length > 1) {
          const firstTiedIndex = standingsData.findIndex(s => s.totalPoints === standing.totalPoints);
          rankDisplay = `T-${firstTiedIndex + 1}`;
        } else {
          rankDisplay = `${index + 1}`;
        }
      }

      return {
        ...standing,
        rankDisplay,
        isFirst: standing.totalPoints === maxPoints && standing.totalPoints > 0,
        isLast: standing.totalPoints === minPoints && standing.totalPoints > 0 && teamsWithPoints.length > 1
      };
    });
  }, [sortedTeams, fishWeights, chugTimes, golfScores, tieBreaks]);

  const tieBreakSummary = useMemo(() => {
    if (!tieBreaks || !Array.isArray(tieBreaks) || tieBreaks.length === 0) return null;
    const teamNameById = new Map<string, string>();
    sortedTeams.forEach((t: Team) => teamNameById.set(t.id, t.name));
    const parts = tieBreaks.map((tb: any) => {
      const teamName = teamNameById.get(tb.teamId) || "Unknown Team";
      const delta = parseFloat(tb.deltaPoints?.toString() || "0");
      const event = tb.event ? tb.event.toString().toUpperCase() : "TOTAL";
      const reason = tb.reason ? ` (${tb.reason})` : "";
      return `${teamName}: +${delta} ${event}${reason}`;
    });
    return parts.join(" · ");
  }, [tieBreaks, sortedTeams]);

  // Now check loading state - AFTER all hooks
  const isLoading = teamsLoading || fishLoading || chugLoading || golfLoading || tieBreaksLoading;

  if (isLoading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", padding: "2rem" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: "32px", height: "32px", border: "2px solid var(--border-hi)", borderTop: "2px solid var(--orange)", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto" }} />
          <p style={{ marginTop: "0.75rem", fontFamily: "var(--font-mono)", fontSize: "0.7rem", color: "var(--text-dim)" }}>LOADING STANDINGS...</p>
        </div>
        <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ padding: "1rem", background: "var(--background)" }}>
      <div style={{ width: "100%" }}>
        <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: "0.8rem", letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--orange)", textShadow: "0 0 12px rgba(255,90,0,0.4)" }}>
            Tournament Standings
          </h2>
          <p style={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem", color: "var(--text-dim)", marginTop: "0.25rem" }}>
            Combined points from Fish · Chug · Golf
          </p>
          {tieBreakSummary && (
            <div style={{ marginTop: "0.6rem", fontFamily: "var(--font-mono)", fontSize: "0.7rem", color: "var(--ice)" }}>
              Tie-break applied: {tieBreakSummary}
            </div>
          )}
        </div>

        {sortedTeams.length === 0 ? (
          <div style={{ textAlign: "center", padding: "3rem", background: "var(--card)", border: "1px solid var(--border-hi)", clipPath: "var(--clip-md)", margin: "0 1rem" }}>
            <p style={{ fontFamily: "var(--font-display)", fontSize: "0.7rem", letterSpacing: "0.1em", color: "var(--text-dim)" }}>NO TEAMS YET</p>
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden md:flex md:justify-center">
              <div style={{ overflowX: "auto" }}>
                <table style={{ borderCollapse: "collapse", background: "var(--card)", border: "1px solid var(--border-hi)", fontSize: "0.85rem", width: "auto", fontFamily: "var(--font-mono)" }}>
                  <thead>
                    <tr style={{ background: "rgba(255,90,0,0.06)", borderBottom: "1px solid rgba(255,90,0,0.2)" }}>
                      {[
                        { label: "RANK",       style: { width: "60px",   textAlign: "center" as const } },
                        { label: "TEAM",       style: { minWidth: "240px", maxWidth: "360px", textAlign: "left" as const } },
                        { label: "🎣 PTS",    style: { width: "70px",   textAlign: "center" as const } },
                        { label: "🍺 PTS",    style: { width: "70px",   textAlign: "center" as const } },
                        { label: "⛳ PTS",    style: { width: "70px",   textAlign: "center" as const } },
                        { label: "TOTAL",      style: { width: "80px",   textAlign: "center" as const } },
                      ].map((h) => (
                        <th key={h.label} style={{ padding: "0.5rem 0.75rem", ...h.style, fontFamily: "var(--font-display)", fontSize: "0.6rem", letterSpacing: "0.1em", color: "var(--ice)", fontWeight: 600, borderRight: "1px solid var(--border)" }}>
                          {h.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {standings.map((standing: any) => {
                      const { isFirst, isLast, rankDisplay: displayRank } = standing;
                      const rowBg = isFirst ? "rgba(255,90,0,0.1)" : "transparent";

                      return (
                        <tr
                          key={standing.team.id}
                          style={{ background: rowBg, borderBottom: "1px solid var(--border)", transition: "background 0.15s" }}
                          onMouseEnter={(e) => { if (!isFirst) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.03)"; }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = rowBg; }}
                        >
                          <td style={{ padding: "0.5rem 0.75rem", textAlign: "center", borderRight: "1px solid var(--border)", fontWeight: 700, color: isFirst ? "var(--orange)" : "var(--text-dim)", fontSize: "0.85rem" }}>
                            {displayRank}
                          </td>
                          <td style={{ padding: "0.5rem 0.75rem", borderRight: "1px solid var(--border)" }}>
                            <div>
                              <div style={{ fontWeight: 700, marginBottom: "0.25rem", fontSize: "0.85rem", color: isFirst ? "var(--foreground)" : "var(--foreground)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                {standing.team.name}
                                {isFirst && standing.totalPoints > 0 && <span>🏆</span>}
                                {isLast && <span>🥾</span>}
                              </div>
                              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 0.75rem" }}>
                                {standing.members.map((member: string, i: number) => (
                                  <div key={i} style={{ fontSize: "0.7rem", color: "var(--orange-hi)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {member}
                                  </div>
                                ))}
                              </div>
                            </div>
                          </td>
                          <td style={{ padding: "0.5rem 0.75rem", textAlign: "center", borderRight: "1px solid var(--border)", color: "var(--fish)", fontWeight: 600 }}>
                            {standing.fishPoints || 0}
                          </td>
                          <td style={{ padding: "0.5rem 0.75rem", textAlign: "center", borderRight: "1px solid var(--border)", color: "var(--chug)", fontWeight: 600 }}>
                            {standing.chugPoints || 0}
                          </td>
                          <td style={{ padding: "0.5rem 0.75rem", textAlign: "center", borderRight: "1px solid var(--border)", color: "var(--golf)", fontWeight: 600 }}>
                            {standing.golfPoints || 0}
                          </td>
                          <td style={{ padding: "0.5rem 0.75rem", textAlign: "center", fontWeight: 700, fontSize: "1rem", color: isFirst ? "var(--ice)" : "var(--foreground)" }}>
                            {standing.totalPoints || 0}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden flex flex-col gap-3 px-2">
              {standings.map((standing: any) => {
                const { isFirst, isLast, rankDisplay: displayRank } = standing;
                const highlightBg = "rgba(255,90,0,0.1)";
                const highlightBorder = "rgba(255,90,0,0.25)";
                const highlightGlow = "0 0 22px rgba(255,90,0,0.25)";

                return (
                  <div
                    key={standing.team.id}
                    style={{
                      background: isFirst ? highlightBg : "var(--card)",
                      border: `1px solid ${isFirst ? highlightBorder : "var(--border-hi)"}`,
                      boxShadow: isFirst ? highlightGlow : "none",
                      clipPath: "var(--clip-sm)",
                      padding: "1rem",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.75rem" }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
                          <h3 style={{ fontFamily: "var(--font-display)", fontSize: "0.75rem", letterSpacing: "0.05em", color: "var(--foreground)", fontWeight: 700 }}>
                            {standing.team.name}
                          </h3>
                          {isFirst && standing.totalPoints > 0 && <span>🏆</span>}
                          {isLast && <span>🥾</span>}
                        </div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem", color: "var(--orange-hi)" }}>
                          {standing.members.join(' · ')}
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.65rem", color: "var(--text-dim)" }}>
                          RANK: <span style={{ color: isFirst ? "var(--orange)" : "var(--foreground)", fontWeight: 700 }}>{displayRank}</span>
                        </div>
                        <div style={{ fontFamily: "var(--font-display)", fontSize: "1.1rem", fontWeight: 700, color: isFirst ? "var(--ice)" : "var(--foreground)", letterSpacing: "0.05em" }}>
                          {standing.totalPoints || 0}
                        </div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.6rem", color: "var(--text-dim)" }}>pts</div>
                      </div>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.5rem", fontFamily: "var(--font-mono)" }}>
                      {[
                        { icon: "🎣", label: "Fish",  pts: standing.fishPoints || 0,  color: "var(--fish)" },
                        { icon: "🍺", label: "Chug",  pts: standing.chugPoints || 0,  color: "var(--chug)" },
                        { icon: "⛳", label: "Golf",  pts: standing.golfPoints || 0,  color: "var(--golf)" },
                      ].map((ev) => (
                        <div key={ev.label} style={{ textAlign: "center", background: "rgba(0,0,0,0.3)", border: "1px solid var(--border)", padding: "0.4rem 0.25rem" }}>
                          <span style={{ fontSize: "0.7rem", color: "var(--text-dim)", display: "block" }}>{ev.icon} {ev.label}</span>
                          <div style={{ fontSize: "1rem", fontWeight: 700, color: ev.color, marginTop: "0.2rem" }}>{ev.pts}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
      <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
    </div>
  );
});

export default StandingsTab;
