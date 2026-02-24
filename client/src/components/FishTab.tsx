import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, memo } from "react";
import { Plus, Lock, Trash2 } from "@/components/icons";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { isUnauthorizedError, isAdminError } from "@/lib/authUtils";
import { useToast } from "@/hooks/use-toast";
import type { Team, FishWeight, Year } from "@shared/schema";
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
      
      // Handle server error response
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
    onSuccess: (updatedYear) => {
      // Invalidate the parent year query to trigger a fresh fetch
      const yearNumber = parentYearData?.year;
      if (yearNumber) {
        queryClient.invalidateQueries({ queryKey: ["/api/years", yearNumber.toString()] });
      }

      // Also invalidate general years queries
      queryClient.invalidateQueries({ queryKey: ["/api/years"] });

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

  // Use parent yearData if available, otherwise fall back to fetching
  const yearData = parentYearData;

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

  const sortedTeams = teams?.sort((a: Team, b: Team) => a.position - b.position) || [];

  // Group fish weights by team ID and get top 3 for each team
  const teamWeightsMap = new Map<string, number[]>();
  fishWeights?.forEach((fw: any) => {
    if (!teamWeightsMap.has(fw.teamId)) {
      teamWeightsMap.set(fw.teamId, []);
    }
    teamWeightsMap.get(fw.teamId)?.push(parseFloat(fw.weight?.toString() || '0') || 0);
  });

  // Calculate top 3 weights and totals for each team
  const teamStats = sortedTeams.map((team: Team) => {
    const weights = teamWeightsMap.get(team.id) || [];
    const sortedWeights = weights.sort((a: number, b: number) => b - a); // Sort descending
    const top3 = sortedWeights.slice(0, 3);
    const total = top3.reduce((sum: number, weight: number) => sum + weight, 0);
    
    return {
      team,
      weight1: top3[0] || 0,
      weight2: top3[1] || 0,
      weight3: top3[2] || 0,
      total,
      members: [team.kak1, team.kak2, team.kak3, team.kak4].filter(Boolean)
    };
  });

  // Calculate points based on rankings using shared scoring utility
  const teamWeights = new Map<string, number>();
  teamStats.forEach((teamStat: any) => {
    teamWeights.set(teamStat.team.id, teamStat.total);
  });

  const rankedPoints = rankFishTeams(teamWeights);
  const teamPoints = new Map<string, number>(
    rankedPoints.map(({ teamId, points }) => [teamId, points])
  );

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
                        {points > 0 ? points : "0"}
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
                          {isLowestScore && <span className="text-orange-500 text-lg">💩</span>}
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
                        <span className="text-muted-foreground font-medium">Top 3 Weights:</span>
                        <div className="space-y-1 mt-1">
                          <div>{teamStat.weight1 > 0 ? `${teamStat.weight1} lbs` : "-"}</div>
                          <div>{teamStat.weight2 > 0 ? `${teamStat.weight2} lbs` : "-"}</div>
                          <div>{teamStat.weight3 > 0 ? `${teamStat.weight3} lbs` : "-"}</div>
                        </div>
                      </div>
                      <div>
                        <span className="text-muted-foreground font-medium">Total:</span>
                        <div className="text-lg font-bold text-blue-400 mt-1">
                          {teamStat.total > 0 ? `${teamStat.total} lbs` : "-"}
                        </div>
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
                );
              })}
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