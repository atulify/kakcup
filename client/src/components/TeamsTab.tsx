import { useState, useEffect, memo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { isUnauthorizedError, isAdminError } from "@/lib/authUtils";
import { useToast } from "@/hooks/use-toast";
import { Edit, X, Lock, Unlock, Plus } from "@/components/icons";
import type { Team } from "@shared/schema";

interface TeamsTabProps {
  yearId: string;
}

const TeamsTab = memo(function TeamsTab({ yearId }: TeamsTabProps) {
  const queryClient = useQueryClient();
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const [editingTeam, setEditingTeam] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [modalForm, setModalForm] = useState({
    name: "",
    kak1: "",
    kak2: "",
    kak3: "",
    kak4: ""
  });

  const { data: teams, isLoading } = useQuery<Team[]>({
    queryKey: ["/api/years", yearId, "teams"],
    queryFn: async () => {
      return await apiRequest(`/api/years/${yearId}/teams`);
    },
  });



  const updateTeamMutation = useMutation({
    mutationFn: async ({ teamId, data }: { teamId: string; data: any }) => {
      return await apiRequest(`/api/teams/${teamId}`, "PUT", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/years", yearId, "teams"] });
      setEditingTeam(null);
      setEditingField(null);
      setEditValue("");
      setShowEditModal(false);
      setSelectedTeam(null);
      toast({
        title: "Success",
        description: "Team updated successfully!",
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
          description: "Only admin users can edit teams.",
          variant: "destructive",
        });
        return;
      }
      
      toast({
        title: "Error",
        description: "Failed to update team. Please try again.",
        variant: "destructive",
      });
    }
  });



  // Remove automatic team initialization - let user manually add teams

  const handleEdit = (teamId: string, field: string, currentValue: string) => {
    const team = teams?.find(t => t.id === teamId);
    if (team?.locked) return; // Prevent editing locked teams
    setEditingTeam(teamId);
    setEditingField(field);
    setEditValue(currentValue || "");
  };

  const handleSave = () => {
    if (!editingTeam || !editingField) return;
    
    updateTeamMutation.mutate({
      teamId: editingTeam,
      data: { [editingField]: editValue }
    });
  };

  const handleCancel = () => {
    setEditingTeam(null);
    setEditingField(null);
    setEditValue("");
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSave();
    } else if (e.key === "Escape") {
      handleCancel();
    }
  };

  const resetModalForm = () => {
    setModalForm({
      name: "",
      kak1: "",
      kak2: "",
      kak3: "",
      kak4: ""
    });
  };

  const openEditModal = (team: Team) => {
    if (team.locked) return; // Prevent editing locked teams
    setSelectedTeam(team);
    setModalForm({
      name: team.name,
      kak1: team.kak1 || "",
      kak2: team.kak2 || "",
      kak3: team.kak3 || "",
      kak4: team.kak4 || ""
    });
    setShowEditModal(true);
  };

  const handleToggleLock = async (team: Team) => {
    updateTeamMutation.mutate({
      teamId: team.id,
      data: { locked: !team.locked }
    });
  };

  const isTeamFilled = (team: Team) => {
    return team.kak1 && team.kak2 && team.kak3 && team.kak4;
  };

  const createTeamMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest(`/api/years/${yearId}/teams`, "POST", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/years", yearId, "teams"] });
      setShowAddModal(false);
      resetModalForm();
      toast({
        title: "Success",
        description: "Team created successfully!",
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
          description: "Only admin users can create teams.",
          variant: "destructive",
        });
        return;
      }
      
      toast({
        title: "Error",
        description: "Failed to create team. Please try again.",
        variant: "destructive",
      });
    }
  });

  const openAddModal = () => {
    resetModalForm();
    setShowAddModal(true);
  };

  const handleCreateTeam = () => {
    if (!validateForm()) return;
    
    // Find the next available position
    const existingPositions = teams?.map(t => t.position) || [];
    let nextPosition = 1;
    while (existingPositions.includes(nextPosition) && nextPosition <= 7) {
      nextPosition++;
    }
    
    if (nextPosition > 7) {
      console.error("Cannot create more than 7 teams");
      return;
    }
    
    createTeamMutation.mutate({
      yearId,
      name: modalForm.name.trim(),
      position: nextPosition,
      kak1: modalForm.kak1.trim(),
      kak2: modalForm.kak2.trim(),
      kak3: modalForm.kak3.trim(),
      kak4: modalForm.kak4.trim(),
      locked: false
    });
  };

  const validateForm = () => {
    return modalForm.name.trim() !== "" && 
           modalForm.kak1.trim() !== "" && 
           modalForm.kak2.trim() !== "" && 
           modalForm.kak3.trim() !== "" && 
           modalForm.kak4.trim() !== "";
  };



  const handleUpdateTeam = () => {
    if (!validateForm() || !selectedTeam) return;
    
    updateTeamMutation.mutate({
      teamId: selectedTeam.id,
      data: {
        name: modalForm.name.trim(),
        kak1: modalForm.kak1.trim(),
        kak2: modalForm.kak2.trim(),
        kak3: modalForm.kak3.trim(),
        kak4: modalForm.kak4.trim()
      }
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-slate-600">Loading teams...</p>
        </div>
      </div>
    );
  }

  const sortedTeams = teams?.sort((a: Team, b: Team) => a.position - b.position) || [];

  return (
    <div className="p-4 bg-background">
      {/* Add Team Button */}
      <div className="mb-4 flex justify-end">
        {isAdmin && (
          <button
            onClick={openAddModal}
            disabled={(teams?.length || 0) >= 7}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors"
            data-testid="button-add-team"
          >
            <Plus size={20} />
            Add Team
          </button>
        )}
      </div>

      <div className="w-full">
        <h2 className="text-xl font-semibold text-foreground mb-4 text-center">Teams</h2>
        {sortedTeams.length === 0 ? (
          <div className="text-center py-12 bg-card border border-border rounded-lg mx-4">
            <div className="text-muted-foreground">
              <p className="text-lg font-medium">No teams yet</p>
              <p className="mt-2">Click "Add Team" to create your first team</p>
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
                      <th className="border border-border px-2 py-2 text-left font-medium text-foreground" style={{minWidth: '150px', maxWidth: '220px'}}>
                        Team Name
                      </th>
                      <th className="border border-border px-2 py-2 text-center font-medium text-foreground" style={{width: '100px'}}>
                        KAK 1
                      </th>
                      <th className="border border-border px-2 py-2 text-center font-medium text-foreground" style={{width: '100px'}}>
                        KAK 2
                      </th>
                      <th className="border border-border px-2 py-2 text-center font-medium text-foreground" style={{width: '100px'}}>
                        KAK 3
                      </th>
                      <th className="border border-border px-2 py-2 text-center font-medium text-foreground" style={{width: '100px'}}>
                        KAK 4
                      </th>
                      {isAdmin && (
                        <th className="border border-border px-2 py-2 text-center font-medium text-foreground" style={{width: '100px'}}>
                          Actions
                        </th>
                      )}
                    </tr>
                  </thead>
            <tbody>
              {sortedTeams.map((team: Team) => (
              <tr key={team.id} className="hover:bg-accent/50">
                {/* Team Name */}
                <td className="border border-border px-2 py-2" style={{minWidth: '150px', maxWidth: '220px'}}>
                  {editingTeam === team.id && editingField === "name" ? (
                    <input
                      type="text"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={handleKeyPress}
                      onBlur={handleSave}
                      className="input w-full px-2 py-1"
                      autoFocus
                      data-testid={`input-team-name-${team.position}`}
                    />
                  ) : (
                    <button
                      onClick={() => handleEdit(team.id, "name", team.name)}
                      disabled={team.locked}
                      className={`w-full text-left px-2 py-1 rounded transition-colors ${
                        team.locked 
                          ? "cursor-not-allowed text-foreground font-bold" 
                          : "text-foreground hover:bg-accent"
                      }`}
                      data-testid={`team-name-${team.position}`}
                    >
                      {team.name}
                    </button>
                  )}
                </td>
                
                {/* KAK 1 */}
                <td className="border border-border px-2 py-2 text-center" style={{width: '100px'}}>
                  {editingTeam === team.id && editingField === "kak1" ? (
                    <input
                      type="text"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={handleKeyPress}
                      onBlur={handleSave}
                      className="input w-full px-1 py-1 text-center text-sm"
                      autoFocus
                      data-testid={`input-kak1-${team.position}`}
                    />
                  ) : (
                    <button
                      onClick={() => handleEdit(team.id, "kak1", team.kak1 || "")}
                      disabled={team.locked}
                      className={`w-full px-1 py-1 rounded transition-colors text-sm ${
                        team.locked 
                          ? "cursor-not-allowed text-foreground font-bold" 
                          : "text-muted-foreground hover:bg-accent"
                      }`}
                      data-testid={`kak1-${team.position}`}
                    >
                      {team.kak1 || "-"}
                    </button>
                  )}
                </td>

                {/* KAK 2 */}
                <td className="border border-border px-2 py-2 text-center" style={{width: '100px'}}>
                  {editingTeam === team.id && editingField === "kak2" ? (
                    <input
                      type="text"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={handleKeyPress}
                      onBlur={handleSave}
                      className="input w-full px-1 py-1 text-center text-sm"
                      autoFocus
                      data-testid={`input-kak2-${team.position}`}
                    />
                  ) : (
                    <button
                      onClick={() => handleEdit(team.id, "kak2", team.kak2 || "")}
                      disabled={team.locked}
                      className={`w-full px-1 py-1 rounded transition-colors text-sm ${
                        team.locked 
                          ? "cursor-not-allowed text-foreground font-bold" 
                          : "text-muted-foreground hover:bg-accent"
                      }`}
                      data-testid={`kak2-${team.position}`}
                    >
                      {team.kak2 || "-"}
                    </button>
                  )}
                </td>

                {/* KAK 3 */}
                <td className="border border-border px-2 py-2 text-center" style={{width: '100px'}}>
                  {editingTeam === team.id && editingField === "kak3" ? (
                    <input
                      type="text"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={handleKeyPress}
                      onBlur={handleSave}
                      className="input w-full px-1 py-1 text-center text-sm"
                      autoFocus
                      data-testid={`input-kak3-${team.position}`}
                    />
                  ) : (
                    <button
                      onClick={() => handleEdit(team.id, "kak3", team.kak3 || "")}
                      disabled={team.locked}
                      className={`w-full px-1 py-1 rounded transition-colors text-sm ${
                        team.locked 
                          ? "cursor-not-allowed text-foreground font-bold" 
                          : "text-muted-foreground hover:bg-accent"
                      }`}
                      data-testid={`kak3-${team.position}`}
                    >
                      {team.kak3 || "-"}
                    </button>
                  )}
                </td>

                {/* KAK 4 */}
                <td className="border border-border px-2 py-2 text-center" style={{width: '100px'}}>
                  {editingTeam === team.id && editingField === "kak4" ? (
                    <input
                      type="text"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={handleKeyPress}
                      onBlur={handleSave}
                      className="input w-full px-1 py-1 text-center text-sm"
                      autoFocus
                      data-testid={`input-kak4-${team.position}`}
                    />
                  ) : (
                    <button
                      onClick={() => handleEdit(team.id, "kak4", team.kak4 || "")}
                      disabled={team.locked}
                      className={`w-full px-1 py-1 rounded transition-colors text-sm ${
                        team.locked 
                          ? "cursor-not-allowed text-foreground font-bold" 
                          : "text-muted-foreground hover:bg-accent"
                      }`}
                      data-testid={`kak4-${team.position}`}
                    >
                      {team.kak4 || "-"}
                    </button>
                  )}
                </td>

                {/* Actions */}
                {isAdmin && (
                  <td className="border border-border px-2 py-2 text-center" style={{width: '100px'}}>
                    <div className="flex items-center justify-center gap-1">
                      {/* Edit Button */}
                      <button
                        onClick={() => openEditModal(team)}
                        disabled={team.locked}
                        className={`p-2 rounded transition-colors ${
                          team.locked 
                            ? "text-muted-foreground cursor-not-allowed" 
                            : "text-muted-foreground hover:text-primary hover:bg-accent"
                        }`}
                        data-testid={`button-edit-team-${team.position}`}
                      >
                        <Edit size={16} />
                      </button>

                      {/* Lock/Unlock Button - only show if team is filled */}
                      {isTeamFilled(team) && (
                        <button
                          onClick={() => handleToggleLock(team)}
                          className={`p-2 rounded transition-colors ${
                            team.locked
                              ? "text-red-600 hover:text-red-700 hover:bg-red-50"
                              : "text-green-600 hover:text-green-700 hover:bg-green-50"
                          }`}
                          data-testid={`button-${team.locked ? 'unlock' : 'lock'}-team-${team.position}`}
                        >
                          {team.locked ? <Unlock size={16} /> : <Lock size={16} />}
                        </button>
                      )}
                    </div>
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
            {sortedTeams.map((team: Team) => (
              <div key={team.id} className="bg-card border border-border rounded-lg p-4">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h3 className={`font-semibold ${team.locked ? 'text-foreground' : 'text-foreground'}`}>
                      {team.name}
                    </h3>
                    {team.locked && (
                      <span className="text-xs text-red-500">🔒 Locked</span>
                    )}
                  </div>
                  {isAdmin && (
                    <div className="flex gap-1">
                      <button
                        onClick={() => openEditModal(team)}
                        disabled={team.locked}
                        className={`p-1.5 rounded transition-colors ${
                          team.locked 
                            ? "text-muted-foreground cursor-not-allowed" 
                            : "text-muted-foreground hover:text-primary hover:bg-accent"
                        }`}
                        data-testid={`button-edit-team-${team.position}`}
                      >
                        <Edit size={14} />
                      </button>
                      {isTeamFilled(team) && (
                        <button
                          onClick={() => handleToggleLock(team)}
                          className={`p-1.5 rounded transition-colors ${
                            team.locked
                              ? "text-red-600 hover:text-red-700"
                              : "text-green-600 hover:text-green-700"
                          }`}
                          data-testid={`button-${team.locked ? 'unlock' : 'lock'}-team-${team.position}`}
                        >
                          {team.locked ? <Unlock size={14} /> : <Lock size={14} />}
                        </button>
                      )}
                    </div>
                  )}
                </div>
                
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-muted-foreground font-medium">KAK 1:</span>
                    <div className={`${team.locked ? 'text-foreground font-bold' : 'text-muted-foreground'}`}>
                      {team.kak1 || "-"}
                    </div>
                  </div>
                  <div>
                    <span className="text-muted-foreground font-medium">KAK 2:</span>
                    <div className={`${team.locked ? 'text-foreground font-bold' : 'text-muted-foreground'}`}>
                      {team.kak2 || "-"}
                    </div>
                  </div>
                  <div>
                    <span className="text-muted-foreground font-medium">KAK 3:</span>
                    <div className={`${team.locked ? 'text-foreground font-bold' : 'text-muted-foreground'}`}>
                      {team.kak3 || "-"}
                    </div>
                  </div>
                  <div>
                    <span className="text-muted-foreground font-medium">KAK 4:</span>
                    <div className={`${team.locked ? 'text-foreground font-bold' : 'text-muted-foreground'}`}>
                      {team.kak4 || "-"}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
        )}
      </div>



      {/* Edit Team Modal */}
      {showEditModal && selectedTeam && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setShowEditModal(false)}>
          <div className="bg-card border border-border rounded-lg p-6 w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-foreground">Edit Team</h3>
              <button
                onClick={() => setShowEditModal(false)}
                className="text-muted-foreground hover:text-foreground"
                data-testid="button-close-edit-modal"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Team Name</label>
                <input
                  type="text"
                  value={modalForm.name}
                  onChange={(e) => setModalForm(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2 bg-input border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Enter team name"
                  data-testid="input-edit-team-name"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">KAK 1</label>
                <input
                  type="text"
                  value={modalForm.kak1}
                  onChange={(e) => setModalForm(prev => ({ ...prev, kak1: e.target.value }))}
                  className="w-full px-3 py-2 bg-input border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Enter member name"
                  data-testid="input-edit-kak1"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">KAK 2</label>
                <input
                  type="text"
                  value={modalForm.kak2}
                  onChange={(e) => setModalForm(prev => ({ ...prev, kak2: e.target.value }))}
                  className="w-full px-3 py-2 bg-input border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Enter member name"
                  data-testid="input-edit-kak2"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">KAK 3</label>
                <input
                  type="text"
                  value={modalForm.kak3}
                  onChange={(e) => setModalForm(prev => ({ ...prev, kak3: e.target.value }))}
                  className="w-full px-3 py-2 bg-input border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Enter member name"
                  data-testid="input-edit-kak3"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">KAK 4</label>
                <input
                  type="text"
                  value={modalForm.kak4}
                  onChange={(e) => setModalForm(prev => ({ ...prev, kak4: e.target.value }))}
                  className="w-full px-3 py-2 bg-input border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Enter member name"
                  data-testid="input-edit-kak4"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowEditModal(false)}
                className="flex-1 px-4 py-2 border border-border text-muted-foreground rounded-lg hover:bg-accent transition-colors"
                data-testid="button-cancel-edit"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateTeam}
                disabled={!validateForm() || updateTeamMutation.isPending}
                className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:bg-muted disabled:cursor-not-allowed transition-colors"
                data-testid="button-save-edit"
              >
                {updateTeamMutation.isPending ? "Updating..." : "Update Team"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Team Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setShowAddModal(false)}>
          <div className="bg-card border border-border rounded-lg p-6 w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-foreground">Add New Team</h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-muted-foreground hover:text-foreground"
                data-testid="button-close-add-modal"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Team Name</label>
                <input
                  type="text"
                  value={modalForm.name}
                  onChange={(e) => setModalForm(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2 bg-input border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Enter team name"
                  data-testid="input-add-team-name"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">KAK 1</label>
                <input
                  type="text"
                  value={modalForm.kak1}
                  onChange={(e) => setModalForm(prev => ({ ...prev, kak1: e.target.value }))}
                  className="w-full px-3 py-2 bg-input border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Enter member name"
                  data-testid="input-add-kak1"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">KAK 2</label>
                <input
                  type="text"
                  value={modalForm.kak2}
                  onChange={(e) => setModalForm(prev => ({ ...prev, kak2: e.target.value }))}
                  className="w-full px-3 py-2 bg-input border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Enter member name"
                  data-testid="input-add-kak2"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">KAK 3</label>
                <input
                  type="text"
                  value={modalForm.kak3}
                  onChange={(e) => setModalForm(prev => ({ ...prev, kak3: e.target.value }))}
                  className="w-full px-3 py-2 bg-input border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Enter member name"
                  data-testid="input-add-kak3"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">KAK 4</label>
                <input
                  type="text"
                  value={modalForm.kak4}
                  onChange={(e) => setModalForm(prev => ({ ...prev, kak4: e.target.value }))}
                  className="w-full px-3 py-2 bg-input border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Enter member name"
                  data-testid="input-add-kak4"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowAddModal(false)}
                className="flex-1 px-4 py-2 border border-border text-muted-foreground rounded-lg hover:bg-accent transition-colors"
                data-testid="button-cancel-add"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateTeam}
                disabled={!validateForm() || createTeamMutation.isPending}
                className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:bg-muted disabled:cursor-not-allowed transition-colors"
                data-testid="button-save-add"
              >
                {createTeamMutation.isPending ? "Saving..." : "Save Team"}
              </button>
            </div>
          </div>
        </div>
      )}
      

    </div>
  );
});

export default TeamsTab;