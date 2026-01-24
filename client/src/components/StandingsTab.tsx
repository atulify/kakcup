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
  });

  const { data: fishWeights, isLoading: fishLoading } = useQuery({
    queryKey: ["/api/years", yearId, "fish-weights"],
    queryFn: async () => {
      const response = await fetch(`/api/years/${yearId}/fish-weights`);
      return response.json();
    },
  });

  const { data: chugTimes, isLoading: chugLoading } = useQuery({
    queryKey: ["/api/years", yearId, "chug-times"],
    queryFn: async () => {
      const response = await fetch(`/api/years/${yearId}/chug-times`);
      return response.json();
    },
  });

  const { data: golfScores, isLoading: golfLoading } = useQuery({
    queryKey: ["/api/years", yearId, "golf-scores"],
    queryFn: async () => {
      const response = await fetch(`/api/years/${yearId}/golf-scores`);
      return response.json();
    },
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

    // Calculate total standings
    const standingsData = sortedTeams.map((team: Team) => {
      const members = [team.kak1, team.kak2, team.kak3, team.kak4].filter(Boolean);
      const fishPoints = fishPointsMap.get(team.id) || 0;
      const chugPoints = chugPointsMap.get(team.id) || 0;
      const golfPoints = golfPointsMap.get(team.id) || 0;
      const totalPoints = fishPoints + chugPoints + golfPoints;

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

    return standingsData;
  }, [sortedTeams, fishWeights, chugTimes, golfScores]);

  // Now check loading state - AFTER all hooks
  const isLoading = teamsLoading || fishLoading || chugLoading || golfLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-slate-600">Loading standings...</p>
        </div>
      </div>
    );
  }

  // Helper function to get rank display
  const getRankDisplay = (index: number, standing: any) => {
    if (standing.totalPoints === 0) return "-";

    const tiedTeams = standings.filter((s: any) => s.totalPoints === standing.totalPoints);
    if (tiedTeams.length > 1) {
      const firstTiedIndex = standings.findIndex((s: any) => s.totalPoints === standing.totalPoints);
      return `T-${firstTiedIndex + 1}`;
    }
    return `${index + 1}`;
  };

  // Helper to check if team is first/last place
  const getPlaceInfo = (standing: any) => {
    const teamsWithPoints = standings.filter((s: any) => s.totalPoints > 0);
    if (teamsWithPoints.length === 0) return { isFirst: false, isLast: false };

    const maxPoints = Math.max(...teamsWithPoints.map((s: any) => s.totalPoints));
    const minPoints = Math.min(...teamsWithPoints.map((s: any) => s.totalPoints));

    return {
      isFirst: standing.totalPoints === maxPoints && standing.totalPoints > 0,
      isLast: standing.totalPoints === minPoints && standing.totalPoints > 0 && teamsWithPoints.length > 1
    };
  };

  return (
    <div className="p-4 bg-background">
      <div className="w-full">
        <h2 className="text-xl font-semibold text-foreground mb-2 text-center">Tournament Standings</h2>
        <p className="text-sm text-muted-foreground mb-4 text-center">
          Combined points from Fish, Chug, and Golf competitions
        </p>

        {sortedTeams.length === 0 ? (
          <div className="text-center py-12 bg-card border border-border rounded-lg mx-4">
            <div className="text-muted-foreground">
              <p className="text-lg font-medium">No teams yet</p>
              <p className="mt-2">Create teams to see standings</p>
            </div>
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden md:flex md:justify-center">
              <div className="overflow-x-auto">
                <table className="border-collapse border border-border text-sm bg-card" style={{width: 'auto'}}>
                  <thead>
                    <tr className="table-header">
                      <th className="border border-border px-2 py-2 text-center font-medium text-foreground" style={{width: '60px'}}>Rank</th>
                      <th className="border border-border px-2 py-2 text-left font-medium text-foreground" style={{minWidth: '240px', maxWidth: '360px'}}>Team & Members</th>
                      <th className="border border-border px-2 py-2 text-center font-medium text-foreground" style={{width: '70px'}}>🎣 Pts</th>
                      <th className="border border-border px-2 py-2 text-center font-medium text-foreground" style={{width: '70px'}}>🍺 Pts</th>
                      <th className="border border-border px-2 py-2 text-center font-medium text-foreground" style={{width: '70px'}}>⛳ Pts</th>
                      <th className="border border-border px-2 py-2 text-center font-medium text-foreground" style={{width: '80px'}}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {standings.map((standing: any, index: number) => {
                      const { isFirst, isLast } = getPlaceInfo(standing);
                      const displayRank = getRankDisplay(index, standing);

                      return (
                        <tr key={standing.team.id} className={`hover:bg-accent/50 ${isFirst ? 'bg-primary/20' : ''}`}>
                          <td className="border border-border px-2 py-2 text-center">
                            <span className={`text-lg font-bold ${isFirst ? 'text-white' : 'text-foreground'}`}>
                              {displayRank}
                            </span>
                          </td>
                          <td className="border border-border px-2 py-2">
                            <div>
                              <div className={`font-bold mb-1 text-sm ${isFirst ? 'text-white' : 'text-foreground'}`}>
                                {standing.team.name}
                                {isFirst && standing.totalPoints > 0 && <span className="ml-2">🏆</span>}
                                {isLast && <span className="ml-2">🥾</span>}
                              </div>
                              <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                                {standing.members.map((member: string, i: number) => (
                                  <div key={i} className={`text-xs truncate ${isFirst ? 'text-gray-200' : 'text-muted-foreground'}`}>
                                    {member}
                                  </div>
                                ))}
                              </div>
                            </div>
                          </td>
                          <td className="border border-border px-2 py-2 text-center">
                            <span className={`text-sm font-medium ${isFirst ? 'text-orange-200' : 'text-orange-400'}`}>
                              {standing.fishPoints || 0}
                            </span>
                          </td>
                          <td className="border border-border px-2 py-2 text-center">
                            <span className={`text-sm font-medium ${isFirst ? 'text-amber-200' : 'text-amber-400'}`}>
                              {standing.chugPoints || 0}
                            </span>
                          </td>
                          <td className="border border-border px-2 py-2 text-center">
                            <span className={`text-sm font-medium ${isFirst ? 'text-green-300' : 'text-green-400'}`}>
                              {standing.golfPoints || 0}
                            </span>
                          </td>
                          <td className="border border-border px-2 py-2 text-center">
                            <span className={`text-lg font-bold ${isFirst ? 'text-blue-200' : 'text-foreground'}`}>
                              {standing.totalPoints || 0}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden space-y-3 mx-4">
              {standings.map((standing: any, index: number) => {
                const { isFirst, isLast } = getPlaceInfo(standing);
                const displayRank = getRankDisplay(index, standing);

                return (
                  <div key={standing.team.id} className={`bg-card border border-border rounded-lg p-4 ${isFirst ? 'bg-primary/20' : ''}`}>
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className={`font-bold ${isFirst ? 'text-white' : 'text-foreground'}`}>
                            {standing.team.name}
                          </h3>
                          {isFirst && standing.totalPoints > 0 && <span>🏆</span>}
                          {isLast && <span>🥾</span>}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {standing.members.join(' • ')}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`text-sm font-bold ${isFirst ? 'text-white' : 'text-foreground'}`}>
                          Rank: {displayRank}
                        </div>
                        <div className={`text-xl font-bold ${isFirst ? 'text-blue-200' : 'text-foreground'}`}>
                          {standing.totalPoints || 0} pts
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3 text-sm">
                      <div className="text-center">
                        <span className="text-xs text-muted-foreground font-medium block">🐟 Fish</span>
                        <div className={`text-lg font-bold ${isFirst ? 'text-orange-200' : 'text-orange-400'} mt-1`}>
                          {standing.fishPoints || 0}
                        </div>
                      </div>
                      <div className="text-center">
                        <span className="text-xs text-muted-foreground font-medium block">🍺 Chug</span>
                        <div className={`text-lg font-bold ${isFirst ? 'text-amber-200' : 'text-amber-400'} mt-1`}>
                          {standing.chugPoints || 0}
                        </div>
                      </div>
                      <div className="text-center">
                        <span className="text-xs text-muted-foreground font-medium block">⛳ Golf</span>
                        <div className={`text-lg font-bold ${isFirst ? 'text-green-300' : 'text-green-400'} mt-1`}>
                          {standing.golfPoints || 0}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
});

export default StandingsTab;
