import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, memo, useMemo } from "react";
import { Plus, Lock, Trash2, ChevronDown } from "@/components/icons";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { isUnauthorizedError, isAdminError } from "@/lib/authUtils";
import { useToast } from "@/hooks/use-toast";
import type { Team } from "@shared/schema";
import { rankFishTeams } from "@shared/scoring";

interface FishTabProps {
  yearId: string;
  yearData?: any;
}

const FishTab = memo(function FishTab({ yearId, yearData: parentYearData }: FishTabProps) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [weight, setWeight] = useState("");
  const [notes, setNotes] = useState("");
  const [expandedWeights, setExpandedWeights] = useState<Set<string>>(new Set());
  const { toast } = useToast();
  const { isAdmin } = useAuth();

  const addWeightMutation = useMutation({
    mutationFn: async (data: { teamId: string; weight: number; notes?: string }) => {
      return await apiRequest(`/api/years/${yearId}/fish-weights`, "POST", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/years", yearId, "fish-weights"] });
      setShowAddModal(false);
      setSelectedTeamId("");
      setWeight("");
      setNotes("");
      toast({
        title: "Success",
        description: "Fish weight added successfully!",
      });
    },
    onError: (error: any) => {
      console.error("Add weight error:", error);

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
          description: "Only admin users can add fish weights.",
          variant: "destructive",
        });
        return;
      }

      if (error?.status === 403) {
        toast({
          title: "Competition Locked",
          description: "Fishing competition is locked. No more weights can be added.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Error",
          description: "Failed to add fish weight. Please try again.",
          variant: "destructive",
        });
      }
    }
  });

  const deleteTeamWeightsMutation = useMutation({
    mutationFn: async (teamId: string) => {
      return await apiRequest(`/api/years/${yearId}/teams/${teamId}/fish-weights`, "DELETE");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/years", yearId, "fish-weights"] });
      toast({
        title: "Success",
        description: "All fish weights for this team have been cleared.",
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

      if (error?.status === 403) {
        toast({
          title: "Competition Locked",
          description: "Fishing competition is locked. Cannot delete weights.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Error",
          description: "Failed to delete fish weights. Please try again.",
          variant: "destructive",
        });
      }
    }
  });

  const lockFishingMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest(`/api/years/${yearId}`, "PATCH", {
        fishing_locked: true
      });
    },
    onSuccess: () => {
      const yearNumber = parentYearData?.year;
      if (yearNumber) {
        queryClient.invalidateQueries({ queryKey: ["/api/years", yearNumber.toString()] });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/years", yearId] });
      toast({
        title: "Competition Locked",
        description: "Fishing competition has been locked successfully.",
      });
    },
    onError: (error: any) => {
      console.error("Lock fishing error:", error);

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
        description: "Failed to lock fishing competition. Please try again.",
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

  const { data: fishWeights, isLoading: fishLoading } = useQuery({
    queryKey: ["/api/years", yearId, "fish-weights"],
    queryFn: async () => {
      const response = await fetch(`/api/years/${yearId}/fish-weights`);
      return response.json();
    },
  });

  const yearData = parentYearData;

  // Memoized: sorted teams (fixes in-place mutation of query cache)
  const sortedTeams = useMemo(
    () => [...(teams ?? [])].sort((a: Team, b: Team) => a.position - b.position),
    [teams]
  );

  // Memoized: full sorted stats with points, rank, and highlight flags pre-computed
  const sortedStats = useMemo(() => {
    // Group weights by team
    const teamWeightsMap = new Map<string, number[]>();
    fishWeights?.forEach((fw: any) => {
      if (!teamWeightsMap.has(fw.teamId)) teamWeightsMap.set(fw.teamId, []);
      teamWeightsMap.get(fw.teamId)!.push(parseFloat(fw.weight?.toString() || '0') || 0);
    });

    const stats = sortedTeams.map((team: Team) => {
      const weights = teamWeightsMap.get(team.id) || [];
      // Use spread to avoid mutating the cached array
      const sortedWeights = [...weights].sort((a, b) => b - a);
      const top3 = sortedWeights.slice(0, 3);
      const total = top3.reduce((sum, w) => sum + w, 0);
      return {
        team,
        weight1: top3[0] || 0,
        weight2: top3[1] || 0,
        weight3: top3[2] || 0,
        total,
        weights, // raw array used for count display and delete button
        members: [team.kak1, team.kak2, team.kak3, team.kak4].filter(Boolean),
      };
    });

    const teamWeights = new Map<string, number>();
    stats.forEach((s: any) => teamWeights.set(s.team.id, s.total));
    const rankedPoints = rankFishTeams(teamWeights);
    const teamPoints = new Map<string, number>(rankedPoints.map(({ teamId, points }) => [teamId, points]));

    const sorted = stats
      .map((s: any) => ({ ...s, points: teamPoints.get(s.team.id) || 0 }))
      .sort((a: any, b: any) => b.points - a.points);

    // Compute rank/highlight values once for the whole array
    const teamsWithPoints = sorted.filter((t: any) => t.points > 0);
    const maxPoints = teamsWithPoints.length > 0 ? Math.max(...teamsWithPoints.map((t: any) => t.points)) : 0;
    const minPoints = teamsWithPoints.length > 0 ? Math.min(...teamsWithPoints.map((t: any) => t.points)) : 0;

    const rankByPoints = new Map<number, string>();
    sorted.forEach((t: any, i: number) => {
      if (t.points > 0 && !rankByPoints.has(t.points)) {
        const tiedCount = teamsWithPoints.filter((x: any) => x.points === t.points).length;
        rankByPoints.set(t.points, tiedCount > 1 ? `T-${i + 1}` : `${i + 1}`);
      }
    });

    return sorted.map((t: any) => ({
      ...t,
      displayRank: t.points > 0 ? (rankByPoints.get(t.points) ?? '-') : '-',
      isHighestScore: t.points === maxPoints && t.points > 0,
      isLowestScore: t.points === minPoints && t.points > 0 && teamsWithPoints.length > 1,
    }));
  }, [sortedTeams, fishWeights]);

  const handleAddWeight = () => {
    if (!selectedTeamId || weight === "") return;

    const weightValue = parseFloat(weight);
    if (isNaN(weightValue) || weightValue < 0) return;

    addWeightMutation.mutate({
      teamId: selectedTeamId,
      weight: weightValue,
      notes: notes.trim() || undefined
    });
  };

  if (teamsLoading || fishLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-slate-600">Loading fish weights...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-2 sm:p-4 bg-background">
      <div className="mb-3 flex justify-end">
        {isAdmin && (
          <div className="flex gap-2">
            <button
              onClick={() => setShowAddModal(true)}
              disabled={sortedTeams.length === 0 || yearData?.fishing_locked}
              className={`flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg transition-colors ${
                yearData?.fishing_locked
                  ? 'bg-muted text-muted-foreground cursor-not-allowed'
                  : 'btn-primary'
              } ${sortedTeams.length === 0 ? 'bg-muted cursor-not-allowed' : ''}`}
              data-testid="button-add-weight"
              title={yearData?.fishing_locked ? "Competition is locked - no more weights can be added" : ""}
            >
              <Plus size={16} />
              <span className="hidden sm:inline">{yearData?.fishing_locked ? "Locked - No More Weights" : "Add Weight"}</span>
              <span className="sm:hidden">{yearData?.fishing_locked ? "Locked" : "Add"}</span>
            </button>
            <button
              onClick={() => lockFishingMutation.mutate()}
              disabled={yearData?.fishing_locked || lockFishingMutation.isPending}
              className={`flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg transition-colors ${
                yearData?.fishing_locked
                  ? 'bg-muted text-muted-foreground cursor-not-allowed'
                  : 'btn-destructive'
              }`}
              data-testid="button-lock-fishing"
            >
              <Lock size={16} />
              {yearData?.fishing_locked ? "Competition Locked" : "Lock Competition"}
            </button>
          </div>
        )}
      </div>

      <div className="w-full">
        <h2 className="text-lg font-semibold text-foreground mb-4 text-center">Fish Weights</h2>
        {sortedTeams.length === 0 ? (
          <div className="text-center py-12 bg-card border border-border rounded-lg mx-4">
            <div className="text-muted-foreground">
              <p className="text-lg font-medium">No teams yet</p>
              <p className="mt-2">Teams must be created before fish weights can be recorded</p>
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
                      <th className="border border-border px-2 py-2 text-center font-medium text-foreground text-xs" style={{width: '80px'}}>
                        Weight 1
                      </th>
                      <th className="border border-border px-2 py-2 text-center font-medium text-foreground text-xs" style={{width: '80px'}}>
                        Weight 2
                      </th>
                      <th className="border border-border px-2 py-2 text-center font-medium text-foreground text-xs" style={{width: '80px'}}>
                        Weight 3
                      </th>
                      <th className="border border-border px-2 py-2 text-center font-medium text-foreground" style={{width: '110px'}}>
                        Total Weight
                      </th>
                      <th className="border border-border px-2 py-2 text-center font-medium text-foreground" style={{width: '70px'}}>
                        Points
                      </th>
                      {isAdmin && !yearData?.fishing_locked && (
                        <th className="border border-border px-2 py-2 text-center font-medium text-foreground" style={{width: '90px'}}>
                          Actions
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedStats.map((teamStat: any) => (
                      <tr key={teamStat.team.id} className="hover:bg-accent/50">
                        {/* Rank */}
                        <td className="border border-border px-2 py-2 text-center" style={{width: '60px'}}>
                          <span className="text-sm font-bold text-foreground">
                            {teamStat.points > 0 ? teamStat.displayRank : "-"}
                          </span>
                        </td>

                        {/* Team & Members */}
                        <td className="border border-border px-2 py-2" style={{minWidth: '240px', maxWidth: '360px'}}>
                          <div>
                            <div className="font-semibold text-foreground mb-1 text-sm">
                              {teamStat.team.name}
                              {teamStat.isHighestScore && (
                                <span className="ml-2 text-yellow-400 text-lg">🏆</span>
                              )}
                              {teamStat.isLowestScore && (
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

                        {/* Weight 1 */}
                        <td className="border border-border px-2 py-2 text-center" style={{width: '80px'}}>
                          <span className="text-sm font-medium">
                            {teamStat.weight1 > 0 ? `${teamStat.weight1}` : "-"}
                          </span>
                        </td>

                        {/* Weight 2 */}
                        <td className="border border-border px-2 py-2 text-center" style={{width: '80px'}}>
                          <span className="text-sm font-medium">
                            {teamStat.weight2 > 0 ? `${teamStat.weight2}` : "-"}
                          </span>
                        </td>

                        {/* Weight 3 */}
                        <td className="border border-border px-2 py-2 text-center" style={{width: '80px'}}>
                          <span className="text-sm font-medium">
                            {teamStat.weight3 > 0 ? `${teamStat.weight3}` : "-"}
                          </span>
                        </td>

                        {/* Total */}
                        <td className="border border-border px-2 py-2 text-center" style={{width: '110px'}}>
                          <span className="font-bold text-blue-400">
                            {teamStat.total > 0 ? `${teamStat.total}` : "-"}
                          </span>
                        </td>

                        {/* Points */}
                        <td className="border border-border px-2 py-2 text-center" style={{width: '70px'}}>
                          <span className="font-bold text-green-400">
                            {teamStat.points > 0 ? teamStat.points : "0"}
                          </span>
                        </td>

                        {/* Actions */}
                        {isAdmin && !yearData?.fishing_locked && (
                          <td className="border border-border px-2 py-2 text-center" style={{width: '90px'}}>
                            {teamStat.weights.length > 0 && (
                              <button
                                onClick={() => {
                                  if (window.confirm(`Clear all ${teamStat.weights.length} fish weight(s) for ${teamStat.team.name}?`)) {
                                    deleteTeamWeightsMutation.mutate(teamStat.team.id);
                                  }
                                }}
                                disabled={deleteTeamWeightsMutation.isPending}
                                className="text-red-500 hover:text-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Clear all fish weights for this team"
                              >
                                <Trash2 size={16} className="mx-auto" />
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden space-y-3 mx-4">
              {sortedStats.map((teamStat: any) => (
                <div key={teamStat.team.id} className="bg-card border border-border rounded-lg p-4">
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-foreground">{teamStat.team.name}</h3>
                        {teamStat.isHighestScore && <span className="text-yellow-400 text-lg">🏆</span>}
                        {teamStat.isLowestScore && <span className="text-orange-500 text-lg">💩</span>}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {teamStat.members.join(' • ')}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold text-foreground">
                        Rank: {teamStat.displayRank}
                      </div>
                      <div className="text-lg font-bold text-green-400">
                        {teamStat.points > 0 ? teamStat.points : "0"} pts
                      </div>
                    </div>
                  </div>

                  <div className="text-sm space-y-2">
                    <div>
                      <div className="text-xs text-muted-foreground">Total:</div>
                      <div className="text-lg font-bold text-blue-400">
                        {teamStat.total > 0 ? `${teamStat.total} lbs` : "-"}
                      </div>
                    </div>

                    <div>
                      <button
                        onClick={() => {
                          const newExpanded = new Set(expandedWeights);
                          if (newExpanded.has(teamStat.team.id)) {
                            newExpanded.delete(teamStat.team.id);
                          } else {
                            newExpanded.add(teamStat.team.id);
                          }
                          setExpandedWeights(newExpanded);
                        }}
                        className="flex items-center gap-1 text-muted-foreground font-medium hover:text-foreground transition-colors"
                      >
                        <ChevronDown
                          className={`w-4 h-4 transition-transform ${
                            expandedWeights.has(teamStat.team.id) ? 'rotate-180' : ''
                          }`}
                        />
                        <span>Top 3 Weights</span>
                      </button>
                      {expandedWeights.has(teamStat.team.id) && (
                        <div className="space-y-1 mt-2 ml-5">
                          <div>{teamStat.weight1 > 0 ? `${teamStat.weight1} lbs` : "-"}</div>
                          <div>{teamStat.weight2 > 0 ? `${teamStat.weight2} lbs` : "-"}</div>
                          <div>{teamStat.weight3 > 0 ? `${teamStat.weight3} lbs` : "-"}</div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Clear All Button (Mobile) */}
                  {isAdmin && !yearData?.fishing_locked && teamStat.weights.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-border">
                      <button
                        onClick={() => {
                          if (window.confirm(`Clear all ${teamStat.weights.length} fish weight(s) for ${teamStat.team.name}?`)) {
                            deleteTeamWeightsMutation.mutate(teamStat.team.id);
                          }
                        }}
                        disabled={deleteTeamWeightsMutation.isPending}
                        className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Trash2 size={16} />
                        <span>Clear All Fish ({teamStat.weights.length})</span>
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Add Weight Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-card border border-border rounded-lg p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold mb-4 text-foreground">Add Fish Weight</h3>

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
                    return (
                      <option key={team.id} value={team.id}>
                        {team.name}{membersList}
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Weight Input */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Weight (lbs)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  placeholder="Enter weight..."
                  className="w-full px-3 py-2 bg-input border border-border rounded-md text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  data-testid="input-weight"
                />
              </div>

              {/* Notes Input */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Notes (optional)
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add notes about the catch..."
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
                onClick={handleAddWeight}
                disabled={!selectedTeamId || weight === "" || addWeightMutation.isPending}
                className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:bg-muted disabled:cursor-not-allowed transition-colors"
                data-testid="button-save-weight"
              >
                {addWeightMutation.isPending ? "Adding..." : "Add Weight"}
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

export default FishTab;
