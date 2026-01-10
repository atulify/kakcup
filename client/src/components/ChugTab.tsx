import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Plus } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { isUnauthorizedError, isAdminError } from "@/lib/authUtils";
import { useToast } from "@/hooks/use-toast";
import type { Team } from "@shared/schema";

interface ChugTabProps {
  yearId: string;
}

export default function ChugTab({ yearId }: ChugTabProps) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [time1, setTime1] = useState("");
  const [time2, setTime2] = useState("");
  const [notes, setNotes] = useState("");
  const { isAdmin } = useAuth();
  const { toast } = useToast();

  const addChugMutation = useMutation({
    mutationFn: async (data: { teamId: string; chug1: number; chug2: number; average: number; notes?: string }) => {
      return await apiRequest(`/api/years/${yearId}/chug-times`, "POST", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/years", yearId, "chug-times"] });
      setShowAddModal(false);
      setSelectedTeamId("");
      setTime1("");
      setTime2("");
      setNotes("");
      toast({
        title: "Success",
        description: "Chug time added successfully!",
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
          description: "Only admin users can add chug times.",
          variant: "destructive",
        });
        return;
      }
      
      toast({
        title: "Error",
        description: "Failed to add chug time. Please try again.",
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

  const { data: chugTimes, isLoading: chugLoading } = useQuery({
    queryKey: ["/api/years", yearId, "chug-times"],
    queryFn: async () => {
      const response = await fetch(`/api/years/${yearId}/chug-times`);
      return response.json();
    },
  });



  const handleAddChug = () => {
    if (!selectedTeamId || !time1 || !time2) return;
    
    const chug1Value = parseFloat(time1);
    const chug2Value = parseFloat(time2);
    if (isNaN(chug1Value) || isNaN(chug2Value) || chug1Value <= 0 || chug2Value <= 0) return;
    
    const average = (chug1Value + chug2Value) / 2;
    
    addChugMutation.mutate({
      teamId: selectedTeamId,
      chug1: chug1Value,
      chug2: chug2Value,
      average: average,
      notes: notes.trim() || undefined
    });
  };

  if (teamsLoading || chugLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-slate-600">Loading chug times...</p>
        </div>
      </div>
    );
  }

  const sortedTeams = teams?.sort((a: Team, b: Team) => a.position - b.position) || [];

  // Create a map of team ID to chug time for easy lookup
  const chugTimeMap = new Map<string, any>();
  chugTimes?.forEach((ct: any) => {
    chugTimeMap.set(ct.teamId, ct);
  });

  // Calculate team stats with points
  const teamStats = sortedTeams.map((team: Team) => {
    const chugTime = chugTimeMap.get(team.id);
    const members = [team.kak1, team.kak2, team.kak3, team.kak4].filter(Boolean);
    
    return {
      team,
      chug1: chugTime ? parseFloat(chugTime.chug1?.toString() || '0') : 0,
      chug2: chugTime ? parseFloat(chugTime.chug2?.toString() || '0') : 0,
      average: chugTime ? parseFloat(chugTime.average?.toString() || '0') : 0,
      members
    };
  });

  // Calculate points based on rankings (fastest time gets most points)
  const rankedTeams = [...teamStats]
    .filter(stat => stat.average > 0)
    .sort((a, b) => a.average - b.average); // Sort ascending (fastest first)
  
  const teamPoints = new Map<string, number>();
  
  let currentRank = 1;
  let i = 0;
  while (i < rankedTeams.length) {
    const currentAverage = rankedTeams[i].average;
    
    // Find all teams with the same average (tied teams)
    const tiedTeams: typeof teamStats = [];
    let j = i;
    while (j < rankedTeams.length && rankedTeams[j].average === currentAverage) {
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

  return (
    <div className="p-2 sm:p-4 bg-background">
      <div className="mb-3 flex justify-end">
        {isAdmin && (
          <button
            onClick={() => setShowAddModal(true)}
            disabled={sortedTeams.length === 0 || (chugTimes?.length || 0) >= 7}
            className="btn-primary flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg disabled:cursor-not-allowed"
            data-testid="button-add-chug"
          >
            <Plus size={16} />
            <span className="hidden sm:inline">Add Chug</span>
            <span className="sm:hidden">Add</span>
          </button>
        )}
      </div>

      <div className="w-full">
        <h2 className="text-lg font-semibold text-foreground mb-4 text-center">Beer Chug Relay</h2>
        <p className="text-sm text-muted-foreground text-center mb-4">4-man relay</p>
        {sortedTeams.length === 0 ? (
          <div className="text-center py-12 bg-card border border-border rounded-lg mx-4">
            <div className="text-muted-foreground">
              <p className="text-lg font-medium">No teams yet</p>
              <p className="mt-2">Teams must be created before chug times can be recorded</p>
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
                        Time 1
                      </th>
                      <th className="border border-border px-2 py-2 text-center font-medium text-foreground text-xs" style={{width: '80px'}}>
                        Time 2
                      </th>
                      <th className="border border-border px-2 py-2 text-center font-medium text-foreground" style={{width: '120px'}}>
                        Average Time (s)
                      </th>
                      <th className="border border-border px-2 py-2 text-center font-medium text-foreground" style={{width: '70px'}}>
                        Points
                      </th>
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
                        <div className="space-y-0.5">
                          {teamStat.members.map((member: string, index: number) => (
                            <div key={index} className="text-xs text-muted-foreground truncate">
                              {member}
                            </div>
                          ))}
                        </div>
                      </div>
                    </td>

                    {/* Time 1 */}
                    <td className="border border-border px-2 py-2 text-center" style={{width: '80px'}}>
                      <span className="text-sm font-medium">
                        {teamStat.chug1 > 0 ? `${teamStat.chug1}s` : "-"}
                      </span>
                    </td>

                    {/* Time 2 */}
                    <td className="border border-border px-2 py-2 text-center" style={{width: '80px'}}>
                      <span className="text-sm font-medium">
                        {teamStat.chug2 > 0 ? `${teamStat.chug2}s` : "-"}
                      </span>
                    </td>

                    {/* Average */}
                    <td className="border border-border px-2 py-2 text-center" style={{width: '120px'}}>
                      <span className="font-bold text-blue-400">
                        {teamStat.average > 0 ? `${teamStat.average}s` : "-"}
                      </span>
                    </td>

                    {/* Points */}
                    <td className="border border-border px-2 py-2 text-center" style={{width: '70px'}}>
                      <span className="font-bold text-green-400">
                        {points > 0 ? points : "0"}
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
                        <span className="text-muted-foreground font-medium">Times:</span>
                        <div className="space-y-1 mt-1">
                          <div>Time 1: {teamStat.chug1 > 0 ? `${teamStat.chug1}s` : "-"}</div>
                          <div>Time 2: {teamStat.chug2 > 0 ? `${teamStat.chug2}s` : "-"}</div>
                        </div>
                      </div>
                      <div>
                        <span className="text-muted-foreground font-medium">Average:</span>
                        <div className="text-lg font-bold text-blue-400 mt-1">
                          {teamStat.average > 0 ? `${teamStat.average}s` : "-"}
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

      {/* Add Chug Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-card border border-border rounded-lg p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold mb-4 text-foreground">Add Chug Times</h3>
            
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

              {/* Time 1 Input */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Time 1 (seconds)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={time1}
                  onChange={(e) => setTime1(e.target.value)}
                  placeholder="Enter time in seconds..."
                  className="w-full px-3 py-2 bg-input border border-border rounded-md text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  data-testid="input-time1"
                />
              </div>

              {/* Time 2 Input */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Time 2 (seconds)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={time2}
                  onChange={(e) => setTime2(e.target.value)}
                  placeholder="Enter time in seconds..."
                  className="w-full px-3 py-2 bg-input border border-border rounded-md text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  data-testid="input-time2"
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
                  placeholder="Add notes about the chug..."
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
                onClick={handleAddChug}
                disabled={!selectedTeamId || !time1 || !time2 || addChugMutation.isPending}
                className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:bg-muted disabled:cursor-not-allowed transition-colors"
                data-testid="button-save-chug"
              >
                {addChugMutation.isPending ? "Adding..." : "Add Times"}
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
}