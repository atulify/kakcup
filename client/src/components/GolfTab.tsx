import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, memo } from "react";
import { Plus, Lock, Trash2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { isUnauthorizedError, isAdminError } from "@/lib/authUtils";
import { useToast } from "@/hooks/use-toast";
import type { Team } from "@shared/schema";

interface GolfTabProps {
  yearId: string;
  yearData?: any;
}

const GolfTab = memo(function GolfTab({ yearId, yearData }: GolfTabProps) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [score, setScore] = useState("");
  const [notes, setNotes] = useState("");
  const { isAdmin } = useAuth();
  const { toast } = useToast();

  const addGolfMutation = useMutation({
    mutationFn: async (data: { teamId: string; score: number; notes?: string }) => {
      return await apiRequest(`/api/years/${yearId}/golf-scores`, "POST", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/years", yearId, "golf-scores"] });
      setShowAddModal(false);
      setSelectedTeamId("");
      setScore("");
      setNotes("");
      toast({
        title: "Success",
        description: "Golf score added successfully!",
      });
    },
    onError: (error: any) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }

      if (isAdminError(error)) {
        toast({
          title: "Admin Access Required",
          description: "Only admin users can add golf scores.",
          variant: "destructive",
        });
        return;
      }

      if (error?.status === 403) {
        toast({
          title: "Competition Locked",
          description: "Golf competition is locked. Cannot add scores.",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Error",
        description: "Failed to add golf score. Please try again.",
        variant: "destructive",
      });
    }
  });

  const deleteGolfMutation = useMutation({
    mutationFn: async (teamId: string) => {
      return await apiRequest(`/api/years/${yearId}/teams/${teamId}/golf-scores`, "DELETE");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/years", yearId, "golf-scores"] });
      toast({
        title: "Success",
        description: "Golf score cleared successfully.",
      });
    },
    onError: (error: any) => {
      if (error?.status === 403) {
        toast({
          title: "Competition Locked",
          description: "Golf competition is locked. Cannot delete scores.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Error",
          description: "Failed to clear golf score.",
          variant: "destructive",
        });
      }
    }
  });

  const lockGolfMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest(`/api/years/${yearId}`, "PATCH", {
        golf_locked: true
      });
    },
    onSuccess: () => {
      // Invalidate the parent year query to trigger a fresh fetch
      const yearNumber = yearData?.year;
      if (yearNumber) {
        queryClient.invalidateQueries({ queryKey: ["/api/years", yearNumber.toString()] });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/years"] });
      toast({
        title: "Competition Locked",
        description: "Golf competition has been locked successfully.",
      });
    },
    onError: (error: any) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }

      if (isAdminError(error)) {
        toast({
          title: "Admin Access Required",
          description: "Only admin users can lock competitions.",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Error",
        description: "Failed to lock golf competition. Please try again.",
        variant: "destructive",
      });
    }
  });



  const { data: teams, isLoading: teamsLoading } = useQuery({
    queryKey: ["/api/years", yearId, "teams"],
    queryFn: async () => {
      const response = await fetch(`/api/years/${yearId}/teams`);
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



  const handleAddGolf = () => {
    if (!selectedTeamId || score === "") return;
    
    const scoreValue = score === "E" ? 0 : parseInt(score);
    if (isNaN(scoreValue) && score !== "E") return;
    
    addGolfMutation.mutate({
      teamId: selectedTeamId,
      score: scoreValue,
      notes: notes.trim() || undefined
    });
  };

  // Generate score options from -20 to +20 with "E" for even par
  const scoreOptions = [];
  for (let i = -20; i <= 20; i++) {
    if (i === 0) {
      scoreOptions.push({ value: "E", display: "E (Even Par)" });
    } else {
      const display = i > 0 ? `+${i}` : `${i}`;
      scoreOptions.push({ value: i.toString(), display });
    }
  }

  if (teamsLoading || golfLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-slate-600">Loading golf scores...</p>
        </div>
      </div>
    );
  }

  const sortedTeams = teams?.sort((a: Team, b: Team) => a.position - b.position) || [];

  // Create a map of team ID to golf score for easy lookup
  const golfScoreMap = new Map<string, any>();
  golfScores?.forEach((gs: any) => {
    golfScoreMap.set(gs.teamId, gs);
  });

  // Calculate team stats with points
  const teamStats = sortedTeams.map((team: Team) => {
    const golfScore = golfScoreMap.get(team.id);
    const members = [team.kak1, team.kak2, team.kak3, team.kak4].filter(Boolean);
    
    return {
      team,
      score: golfScore ? parseInt(golfScore.score?.toString() || '999') : 999, // 999 = no score yet
      members,
      hasScore: !!golfScore
    };
  });

  // Calculate points based on rankings (lowest score gets most points)
  const rankedTeams = [...teamStats]
    .filter(stat => stat.hasScore)
    .sort((a, b) => a.score - b.score); // Sort ascending (lowest score first)
  
  const teamPoints = new Map<string, number>();
  
  let currentRank = 1;
  let i = 0;
  while (i < rankedTeams.length) {
    const currentScore = rankedTeams[i].score;
    
    // Find all teams with the same score (tied teams)
    const tiedTeams: typeof teamStats = [];
    let j = i;
    while (j < rankedTeams.length && rankedTeams[j].score === currentScore) {
      tiedTeams.push(rankedTeams[j]);
      j++;
    }
    
    // Calculate points for tied teams
    let totalPoints = 0;
    for (let rank = currentRank; rank < currentRank + tiedTeams.length; rank++) {
      totalPoints += Math.max(1, 8 - rank); // Points: 7, 6, 5, 4, 3, 2, 1
    }
    const pointsPerTeam = totalPoints / tiedTeams.length;
    
    // Assign points to tied teams
    tiedTeams.forEach((teamStat: any) => {
      teamPoints.set(teamStat.team.id, pointsPerTeam);
    });
    
    currentRank += tiedTeams.length;
    i = j;
  }

  // Format score display
  const formatScore = (score: number, hasScore: boolean) => {
    if (!hasScore) return "-";
    if (score === 0) return "E";
    return score > 0 ? `+${score}` : `${score}`;
  };

  return (
    <div className="p-2 sm:p-4 bg-background">
      <div className="mb-3 flex justify-end">
        {isAdmin && (
          <div className="flex gap-2">
            <button
              onClick={() => setShowAddModal(true)}
              disabled={sortedTeams.length === 0 || yearData?.golf_locked}
              className={`flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg transition-colors ${
                yearData?.golf_locked
                  ? 'bg-muted text-muted-foreground cursor-not-allowed'
                  : 'btn-primary'
              } ${sortedTeams.length === 0 ? 'bg-muted cursor-not-allowed' : ''}`}
              data-testid="button-add-golf"
              title={yearData?.golf_locked ? "Competition is locked - no more scores can be added" : ""}
            >
              <Plus size={16} />
              <span className="hidden sm:inline">{yearData?.golf_locked ? "Locked - No More Scores" : "Add Golf Score"}</span>
              <span className="sm:hidden">{yearData?.golf_locked ? "Locked" : "Add"}</span>
            </button>
            <button
              onClick={() => lockGolfMutation.mutate()}
              disabled={yearData?.golf_locked || lockGolfMutation.isPending}
              className={`flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg transition-colors ${
                yearData?.golf_locked
                  ? 'bg-muted text-muted-foreground cursor-not-allowed'
                  : 'btn-destructive'
              }`}
              data-testid="button-lock-golf"
            >
              <Lock size={16} />
              {yearData?.golf_locked ? "Competition Locked" : "Lock Competition"}
            </button>
          </div>
        )}
      </div>

      <div className="w-full">
        <h2 className="text-lg font-semibold text-foreground mb-4 text-center">Golf Scores</h2>
        {sortedTeams.length === 0 ? (
          <div className="text-center py-12 bg-card border border-border rounded-lg mx-4">
            <div className="text-muted-foreground">
              <p className="text-lg font-medium">No teams yet</p>
              <p className="mt-2">Teams must be created before golf scores can be recorded</p>
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
                        Score
                      </th>
                      <th className="border border-border px-2 py-2 text-center font-medium text-foreground" style={{width: '70px'}}>
                        Points
                      </th>
                      {isAdmin && !yearData?.golf_locked && (
                        <th className="border border-border px-2 py-2 text-center font-medium text-foreground" style={{width: '90px'}}>
                          Actions
                        </th>
                      )}
                    </tr>
                  </thead>
            <tbody>
              {teamStats
                .map((teamStat: any) => ({
                  ...teamStat,
                  points: teamPoints.get(teamStat.team.id) || 0
                }))
                .sort((a: any, b: any) => b.points - a.points)
                .map((teamStat: any, index: number, sortedArray: any[]) => {
                const points = teamStat.points;
                
                // Calculate rank with tie handling
                let displayRank = (index + 1).toString();
                
                if (points > 0) {
                  const tiedTeams = sortedArray.filter((t: any) => t.points === points);
                  if (tiedTeams.length > 1) {
                    // Find the starting rank for this tie group
                    const firstTiedIndex = sortedArray.findIndex((t: any) => t.points === points);
                    displayRank = `T-${firstTiedIndex + 1}`;
                  }
                }
                
                // Find teams with highest and lowest points (but greater than 0)
                const teamsWithPoints = sortedArray.filter((t: any) => t.points > 0);
                const maxPoints = teamsWithPoints.length > 0 ? Math.max(...teamsWithPoints.map((t: any) => t.points)) : 0;
                const minPoints = teamsWithPoints.length > 0 ? Math.min(...teamsWithPoints.map((t: any) => t.points)) : 0;
                const isHighestScore = points === maxPoints && points > 0;
                const isLowestScore = points === minPoints && points > 0 && teamsWithPoints.length > 1;
                
                return (
                  <tr key={teamStat.team.id} className="hover:bg-accent/50">
                    {/* Rank */}
                    <td className="border border-border px-2 py-2 text-center" style={{width: '60px'}}>
                      <span className="text-sm font-bold text-foreground">
                        {points > 0 ? displayRank : "-"}
                      </span>
                    </td>
                    
                    {/* Team & Members */}
                    <td className="border border-border px-2 py-2" style={{minWidth: '240px', maxWidth: '360px'}}>
                      <div>
                        <div className="font-semibold text-foreground mb-1 text-sm">
                          {teamStat.team.name}
                          {isHighestScore && (
                            <span className="ml-2 text-yellow-400 text-lg">🏆</span>
                          )}
                          {isLowestScore && (
                            <span className="ml-2 text-amber-600 text-lg">💩</span>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                          {teamStat.members.map((member: string, index: number) => (
                            <div key={index} className="text-xs text-muted-foreground truncate">
                              {member}
                            </div>
                          ))}
                        </div>
                      </div>
                    </td>

                    {/* Golf Score */}
                    <td className="border border-border px-2 py-2 text-center" style={{width: '70px'}}>
                      <span className="font-bold text-blue-400">
                        {formatScore(teamStat.score, teamStat.hasScore)}
                      </span>
                    </td>

                    {/* Points */}
                    <td className="border border-border px-2 py-2 text-center" style={{width: '70px'}}>
                      <span className="font-bold text-green-400">
                        {points > 0 ? points : "0"}
                      </span>
                    </td>

                    {/* Actions */}
                    {isAdmin && !yearData?.golf_locked && (
                      <td className="border border-border px-2 py-2 text-center" style={{width: '90px'}}>
                        {teamStat.hasScore && (
                          <button
                            onClick={() => {
                              if (window.confirm(`Clear golf score for ${teamStat.team.name}?`)) {
                                deleteGolfMutation.mutate(teamStat.team.id);
                              }
                            }}
                            disabled={deleteGolfMutation.isPending}
                            className="text-red-500 hover:text-red-700"
                            title="Clear golf score for this team"
                          >
                            <Trash2 size={16} className="mx-auto" />
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                );
                  })}
                </tbody>
              </table>
              </div>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden space-y-3 mx-4">
              {teamStats
                .map((teamStat: any) => ({
                  ...teamStat,
                  points: teamPoints.get(teamStat.team.id) || 0
                }))
                .sort((a: any, b: any) => b.points - a.points)
                .map((teamStat: any, index: number, sortedArray: any[]) => {
                const points = teamStat.points;
                const teamsWithPoints = sortedArray.filter((t: any) => t.points > 0);
                const maxPoints = teamsWithPoints.length > 0 ? Math.max(...teamsWithPoints.map((t: any) => t.points)) : 0;
                const minPoints = teamsWithPoints.length > 0 ? Math.min(...teamsWithPoints.map((t: any) => t.points)) : 0;
                const isHighestScore = points === maxPoints && points > 0;
                const isLowestScore = points === minPoints && points > 0 && teamsWithPoints.length > 1;
                
                // Calculate proper rank with ties
                let displayRank = "-";
                if (points > 0) {
                  // Check if there are ties at this rank
                  const tiedCount = sortedArray.filter((t: any) => t.points === points).length;
                  if (tiedCount > 1) {
                    // Find the starting position of this tie group
                    const firstTiedIndex = sortedArray.findIndex((t: any) => t.points === points);
                    displayRank = `T-${firstTiedIndex + 1}`;
                  } else {
                    displayRank = `${index + 1}`;
                  }
                }
                
                return (
                  <div key={teamStat.team.id} className="bg-card border border-border rounded-lg p-4">
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-foreground">{teamStat.team.name}</h3>
                          {isHighestScore && <span className="text-yellow-400 text-lg">🏆</span>}
                          {isLowestScore && <span className="text-amber-600 text-lg">💩</span>}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {teamStat.members.join(' • ')}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-bold text-foreground">
                          Rank: {displayRank}
                        </div>
                        <div className="text-lg font-bold text-green-400">
                          {points > 0 ? points : "0"} pts
                        </div>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="text-muted-foreground font-medium">Golf Score:</span>
                        <div className="text-lg font-bold text-blue-400 mt-1">
                          {formatScore(teamStat.score, teamStat.hasScore)}
                        </div>
                      </div>
                      <div>
                        <span className="text-muted-foreground font-medium">Points:</span>
                        <div className="text-lg font-bold text-green-400 mt-1">
                          {points > 0 ? points : "0"}
                        </div>
                      </div>
                    </div>

                    {isAdmin && !yearData?.golf_locked && teamStat.hasScore && (
                      <div className="mt-3 pt-3 border-t border-border">
                        <button
                          onClick={() => {
                            if (window.confirm(`Clear golf score for ${teamStat.team.name}?`)) {
                              deleteGolfMutation.mutate(teamStat.team.id);
                            }
                          }}
                          disabled={deleteGolfMutation.isPending}
                          className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm text-red-500"
                        >
                          <Trash2 size={16} />
                          <span>Clear Golf Score</span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Add Golf Score Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-card border border-border rounded-lg p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold mb-4 text-foreground">Add Golf Score</h3>
            
            <div className="space-y-4">
              {/* Team Selection */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Select Team
                </label>
                <select
                  value={selectedTeamId}
                  onChange={(e) => setSelectedTeamId(e.target.value)}
                  className="w-full px-3 py-2 bg-input border border-border rounded-md text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  data-testid="select-team"
                >
                  <option value="">Choose a team...</option>
                  {sortedTeams.map((team: Team) => {
                    const members = [team.kak1, team.kak2, team.kak3, team.kak4].filter(Boolean);
                    const membersList = members.length > 0 ? ` (${members.join(', ')})` : '';
                    const hasGolfScore = golfScoreMap.has(team.id);
                    const indicator = hasGolfScore ? ' ✓' : '';
                    return (
                      <option key={team.id} value={team.id}>
                        {team.name}{membersList}{indicator}
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Score Selection */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Golf Score
                </label>
                <select
                  value={score}
                  onChange={(e) => setScore(e.target.value)}
                  className="w-full px-3 py-2 bg-input border border-border rounded-md text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  data-testid="select-score"
                >
                  <option value="">Choose a score...</option>
                  {scoreOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.display}
                    </option>
                  ))}
                </select>
              </div>

              {/* Notes Input */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Notes (optional)
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add notes about the golf round..."
                  rows={3}
                  className="w-full px-3 py-2 bg-input border border-border rounded-md text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  data-testid="input-notes"
                />
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowAddModal(false)}
                className="flex-1 px-4 py-2 text-muted-foreground border border-border rounded-lg hover:bg-accent transition-colors"
                data-testid="button-cancel"
              >
                Cancel
              </button>
              <button
                onClick={handleAddGolf}
                disabled={!selectedTeamId || score === "" || addGolfMutation.isPending}
                className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:bg-muted disabled:cursor-not-allowed transition-colors"
                data-testid="button-save-golf"
              >
                {addGolfMutation.isPending ? "Adding..." : "Add Score"}
              </button>
            </div>
          </div>
        </div>
      )}

      {sortedTeams.length > 0 && (
        <div className="mt-4 text-sm text-muted-foreground">
          <p>
            <strong>Scoring:</strong> 7 points for 1st place down to 1 point for 7th place. 
            Tied teams split the available points equally.
          </p>
        </div>
      )}
    </div>
  );
});

export default GolfTab;