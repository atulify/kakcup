import { useMemo, memo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Team } from "@shared/schema";
import { calculateTop3FishTotal, rankFishTeams, rankChugTeams, rankGolfTeams } from "@shared/scoring";

interface StandingsTabProps {
  yearId: string;
}

const StandingsTab = memo(function StandingsTab({ yearId }: StandingsTabProps) {
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

  if (teamsLoading || fishLoading || chugLoading || golfLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-slate-600">Loading standings...</p>
        </div>
      </div>
    );
  }

  const sortedTeams = teams?.sort((a: Team, b: Team) => a.position - b.position) || [];

  // Memoize standings calculation to avoid recalculating on every render
  const standings = useMemo(() => {

    // Calculate Fish Points using shared utility
    const fishPointsMap = new Map<string, number>();
    if (fishWeights && fishWeights.length > 0) {
      // Group weights by team and calculate top 3 total for each team
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

      // Calculate totals for each team using shared utility (top 3 weights)
      const teamTotals = new Map<string, number>();
      teamWeights.forEach((weights, teamId) => {
        const total = calculateTop3FishTotal(weights);
        teamTotals.set(teamId, total);
      });

      // Rank teams and assign points using shared utility
      const teamPoints = rankFishTeams(teamTotals);
      teamPoints.forEach(({ teamId, points }) => {
        fishPointsMap.set(teamId, points);
      });
    }

    // Calculate Chug Points using shared utility
    const chugPointsMap = new Map<string, number>();
    if (chugTimes && chugTimes.length > 0) {
      const teamAverages = new Map<string, number>();
      chugTimes
        .filter((ct: any) => ct.average && parseFloat(ct.average) > 0)
        .forEach((ct: any) => {
          teamAverages.set(ct.teamId, parseFloat(ct.average?.toString() || '999'));
        });

      // Rank teams and assign points using shared utility
      const teamPoints = rankChugTeams(teamAverages);
      teamPoints.forEach(({ teamId, points }) => {
        chugPointsMap.set(teamId, points);
      });
    }

    // Calculate Golf Points using shared utility
    const golfPointsMap = new Map<string, number>();
    if (golfScores && golfScores.length > 0) {
      const teamScores = new Map<string, number>();
      golfScores
        .filter((gs: any) => gs.score !== null && gs.score !== undefined)
        .forEach((gs: any) => {
          teamScores.set(gs.teamId, parseInt(gs.score?.toString() || '999'));
        });

      // Rank teams and assign points using shared utility
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
    standingsData.sort((a: typeof standingsData[0], b: typeof standingsData[0]) => b.totalPoints - a.totalPoints);

    return standingsData;
  }, [teams, fishWeights, chugTimes, golfScores]);

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
                <th className="border border-border px-2 py-2 text-center font-medium text-foreground" style={{width: '60px'}}>
                  Rank
                </th>
                <th className="border border-border px-2 py-2 text-left font-medium text-foreground" style={{minWidth: '240px', maxWidth: '360px'}}>
                  Team & Members
                </th>
                <th className="border border-border px-2 py-2 text-center font-medium text-foreground" style={{width: '70px'}}>
                  🎣 Points
                </th>
                <th className="border border-border px-2 py-2 text-center font-medium text-foreground" style={{width: '70px'}}>
                  🍺 Points
                </th>
                <th className="border border-border px-2 py-2 text-center font-medium text-foreground" style={{width: '70px'}}>
                  ⛳ Points
                </th>
                <th className="border border-border px-2 py-2 text-center font-medium text-foreground" style={{width: '80px'}}>
                  Total Pts
                </th>
              </tr>
            </thead>
            <tbody>
              {standings.map((standing: typeof standings[0], index: number) => {
                // Calculate rank with tie handling
                let displayRank = (index + 1).toString();
                
                if (standing.totalPoints > 0) {
                  const tiedTeams = standings.filter((s: any) => s.totalPoints === standing.totalPoints);
                  if (tiedTeams.length > 1) {
                    // Find the starting rank for this tie group
                    const firstTiedIndex = standings.findIndex((s: any) => s.totalPoints === standing.totalPoints);
                    displayRank = `T-${firstTiedIndex + 1}`;
                  }
                }

                const isFirstPlace = index === 0 && standing.totalPoints > 0;
                
                // Find teams with the fewest points (but greater than 0)
                const teamsWithPoints = standings.filter((s: any) => s.totalPoints > 0);
                const minPoints = teamsWithPoints.length > 0 ? Math.min(...teamsWithPoints.map((s: any) => s.totalPoints)) : 0;
                const isLastPlace = standing.totalPoints === minPoints && standing.totalPoints > 0 && teamsWithPoints.length > 1;
                
                return (
                  <tr 
                    key={standing.team.id} 
                    className={`hover:bg-accent/50 ${isFirstPlace ? 'bg-primary/20' : ''}`}
                  >
                    {/* Rank */}
                    <td className="border border-border px-2 py-2 text-center" style={{width: '60px'}}>
                      <span className={`text-lg font-bold ${isFirstPlace ? 'text-white' : 'text-foreground'}`}>
                        {standing.totalPoints > 0 ? displayRank : "-"}
                      </span>
                    </td>

                    {/* Team & Members */}
                    <td className="border border-border px-2 py-2" style={{minWidth: '240px', maxWidth: '360px'}}>
                      <div>
                        <div className={`font-bold mb-1 text-sm ${isFirstPlace ? 'text-white' : 'text-foreground'}`}>
                          {standing.team.name}
                          {isFirstPlace && standing.totalPoints > 0 && (
                            <span className="ml-2 text-yellow-400 text-lg">🏆</span>
                          )}
                          {isLastPlace && (
                            <span className="ml-2 text-gray-400 text-lg">🥾</span>
                          )}
                        </div>
                        <div className="space-y-0.5">
                          {standing.members.map((member: string, memberIndex: number) => (
                            <div key={memberIndex} className={`text-xs truncate ${isFirstPlace ? 'text-gray-200' : 'text-muted-foreground'}`}>
                              {member}
                            </div>
                          ))}
                        </div>
                      </div>
                    </td>

                    {/* Fish Points */}
                    <td className="border border-border px-2 py-2 text-center" style={{width: '70px'}}>
                      <span className={`text-sm font-medium ${isFirstPlace ? 'text-orange-200' : 'text-orange-400'}`}>
                        {standing.fishPoints > 0 ? standing.fishPoints : "0"}
                      </span>
                    </td>

                    {/* Chug Points */}
                    <td className="border border-border px-2 py-2 text-center" style={{width: '70px'}}>
                      <span className={`text-sm font-medium ${isFirstPlace ? 'text-amber-200' : 'text-amber-400'}`}>
                        {standing.chugPoints > 0 ? standing.chugPoints : "0"}
                      </span>
                    </td>

                    {/* Golf Points */}
                    <td className="border border-border px-2 py-2 text-center" style={{width: '70px'}}>
                      <span className={`text-sm font-medium ${isFirstPlace ? 'text-green-300' : 'text-green-400'}`}>
                        {standing.golfPoints > 0 ? standing.golfPoints : "0"}
                      </span>
                    </td>

                    {/* Total Points */}
                    <td className="border border-border px-2 py-2 text-center" style={{width: '80px'}}>
                      <span className={`text-lg font-bold ${isFirstPlace ? 'text-blue-200' : 'text-foreground'}`}>
                        {standing.totalPoints > 0 ? standing.totalPoints : "0"}
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
              {standings
                .map((standing: any, index: number) => {
                const teamsWithPoints = standings.filter((s: any) => s.totalPoints > 0);
                const maxPoints = teamsWithPoints.length > 0 ? Math.max(...teamsWithPoints.map((s: any) => s.totalPoints)) : 0;
                const minPoints = teamsWithPoints.length > 0 ? Math.min(...teamsWithPoints.map((s: any) => s.totalPoints)) : 0;
                const isFirstPlace = standing.totalPoints === maxPoints && standing.totalPoints > 0;
                const isLastPlace = standing.totalPoints === minPoints && standing.totalPoints > 0 && teamsWithPoints.length > 1;
                
                // Calculate proper rank with ties
                let displayRank = "-";
                if (standing.totalPoints > 0) {
                  // Find this team's position in the sorted standings
                  let currentRank = 1;
                  for (let i = 0; i < index; i++) {
                    if (standings[i].totalPoints !== standings[i + 1]?.totalPoints) {
                      currentRank = i + 2; // Next rank after this group
                    }
                  }
                  
                  // Check if there are ties at this rank
                  const tiedCount = standings.filter((s: any) => s.totalPoints === standing.totalPoints).length;
                  if (tiedCount > 1) {
                    // Find the starting position of this tie group
                    const firstTiedIndex = standings.findIndex((s: any) => s.totalPoints === standing.totalPoints);
                    displayRank = `T-${firstTiedIndex + 1}`;
                  } else {
                    displayRank = `${index + 1}`;
                  }
                }
                
                return (
                  <div key={standing.team.id} className={`bg-card border border-border rounded-lg p-4 ${isFirstPlace ? 'bg-primary/20' : ''}`}>
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className={`font-bold ${isFirstPlace ? 'text-white' : 'text-foreground'}`}>
                            {standing.team.name}
                          </h3>
                          {isFirstPlace && standing.totalPoints > 0 && <span className="text-yellow-400 text-lg">🏆</span>}
                          {isLastPlace && <span className="text-gray-400 text-lg">🥾</span>}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {standing.members.join(' • ')}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`text-sm font-bold ${isFirstPlace ? 'text-white' : 'text-foreground'}`}>
                          Rank: {displayRank}
                        </div>
                        <div className={`text-xl font-bold ${isFirstPlace ? 'text-blue-200' : 'text-foreground'}`}>
                          {standing.totalPoints > 0 ? standing.totalPoints : "0"} pts
                        </div>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-3 gap-3 text-sm">
                      <div className="text-center">
                        <span className="text-xs text-muted-foreground font-medium block">🐟 Fish</span>
                        <div className={`text-lg font-bold ${isFirstPlace ? 'text-orange-200' : 'text-orange-400'} mt-1`}>
                          {standing.fishPoints > 0 ? standing.fishPoints : "0"}
                        </div>
                      </div>
                      <div className="text-center">
                        <span className="text-xs text-muted-foreground font-medium block">🍺 Chug</span>
                        <div className={`text-lg font-bold ${isFirstPlace ? 'text-amber-200' : 'text-amber-400'} mt-1`}>
                          {standing.chugPoints > 0 ? standing.chugPoints : "0"}
                        </div>
                      </div>
                      <div className="text-center">
                        <span className="text-xs text-muted-foreground font-medium block">⛳ Golf</span>
                        <div className={`text-lg font-bold ${isFirstPlace ? 'text-green-300' : 'text-green-400'} mt-1`}>
                          {standing.golfPoints > 0 ? standing.golfPoints : "0"}
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