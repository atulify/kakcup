import { useState, useEffect, useRef, memo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { isUnauthorizedError, isAdminError } from "@/lib/authUtils";
import { useToast } from "@/hooks/use-toast";
import { Edit, X, Lock, Unlock, Plus } from "@/components/icons";
import type { Team, Kak } from "@shared/schema";

// ---------------------------------------------------------------------------
// KakCombobox — searchable dropdown that selects an active KAK
// ---------------------------------------------------------------------------
interface KakComboboxProps {
  value: string;         // selected kak name (for display)
  onChange: (id: string, name: string) => void;
  kaks: Kak[];
  placeholder?: string;
  testId?: string;
}

function KakCombobox({ value, onChange, kaks, placeholder = "Search KAK…", testId }: KakComboboxProps) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Keep query in sync when value changes externally (e.g. modal reset)
  useEffect(() => { setQuery(value); }, [value]);

  const filtered = kaks.filter(k =>
    k.name.toLowerCase().includes(query.toLowerCase())
  );

  const handleSelect = (kak: Kak) => {
    onChange(kak.id, kak.name);
    setQuery(kak.name);
    setOpen(false);
  };

  const handleClear = () => {
    onChange("", "");
    setQuery("");
    setOpen(false);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        // Reset query to current value if user typed but didn't select
        setQuery(value);
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [value]);

  return (
    <div ref={containerRef} className="relative">
      <div className="flex items-center">
        <input
          type="text"
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="input w-full"
          data-testid={testId}
          autoComplete="off"
        />
        {value && (
          <button
            type="button"
            onClick={handleClear}
            style={{ position: "absolute", right: "0.5rem", background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)", padding: "0.25rem" }}
            tabIndex={-1}
          >
            <X size={14} />
          </button>
        )}
      </div>
      {open && filtered.length > 0 && (
        <ul style={{ position: "absolute", zIndex: 50, width: "100%", marginTop: "2px", background: "var(--card)", border: "1px solid var(--border-hi)", boxShadow: "0 8px 24px rgba(0,0,0,0.5)", maxHeight: "192px", overflowY: "auto", listStyle: "none", padding: 0, margin: "2px 0 0 0" }}>
          {filtered.map(kak => (
            <li
              key={kak.id}
              onMouseDown={() => handleSelect(kak)}
              style={{ padding: "0.5rem 0.75rem", fontSize: "0.85rem", cursor: "pointer", fontFamily: "var(--font-mono)", color: "var(--foreground)", transition: "background 0.1s" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(255,90,0,0.08)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
            >
              {kak.name}
            </li>
          ))}
        </ul>
      )}
      {open && query.length > 0 && filtered.length === 0 && (
        <div style={{ position: "absolute", zIndex: 50, width: "100%", marginTop: "2px", background: "var(--card)", border: "1px solid var(--border-hi)", padding: "0.5rem 0.75rem", fontFamily: "var(--font-mono)", fontSize: "0.8rem", color: "var(--text-dim)" }}>
          No KAKs found
        </div>
      )}
    </div>
  );
}

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
    kak1Id: "", kak1Name: "",
    kak2Id: "", kak2Name: "",
    kak3Id: "", kak3Name: "",
    kak4Id: "", kak4Name: "",
  });

  const { data: activeKaks = [] } = useQuery<Kak[]>({
    queryKey: ["/api/kaks", "active"],
    queryFn: async () => apiRequest("/api/kaks?status=active"),
    staleTime: 60_000,
  });

  const { data: teams, isLoading } = useQuery<Team[]>({
    queryKey: ["/api/years", yearId, "teams"],
    queryFn: async () => {
      return await apiRequest(`/api/years/${yearId}/teams`);
    },
    staleTime: 2_000,
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
      kak1Id: "", kak1Name: "",
      kak2Id: "", kak2Name: "",
      kak3Id: "", kak3Name: "",
      kak4Id: "", kak4Name: "",
    });
  };

  const openEditModal = (team: Team) => {
    if (team.locked) return;
    setSelectedTeam(team);
    // Resolve names from active kaks list when FK ids are present; fall back to legacy text
    const nameFor = (id: string | null | undefined, legacy: string | null | undefined) => {
      if (id) return activeKaks.find(k => k.id === id)?.name ?? legacy ?? "";
      return legacy ?? "";
    };
    setModalForm({
      name: team.name,
      kak1Id: (team as any).kak1Id ?? "",
      kak1Name: nameFor((team as any).kak1Id, team.kak1),
      kak2Id: (team as any).kak2Id ?? "",
      kak2Name: nameFor((team as any).kak2Id, team.kak2),
      kak3Id: (team as any).kak3Id ?? "",
      kak3Name: nameFor((team as any).kak3Id, team.kak3),
      kak4Id: (team as any).kak4Id ?? "",
      kak4Name: nameFor((team as any).kak4Id, team.kak4),
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
    // Accept either legacy text columns or the new FK columns being populated
    const hasText = team.kak1 && team.kak2 && team.kak3 && team.kak4;
    const hasFk = (team as any).kak1Id && (team as any).kak2Id && (team as any).kak3Id && (team as any).kak4Id;
    return hasText || hasFk;
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
      // Populate both legacy text columns and FK columns
      kak1: modalForm.kak1Name, kak1Id: modalForm.kak1Id || undefined,
      kak2: modalForm.kak2Name, kak2Id: modalForm.kak2Id || undefined,
      kak3: modalForm.kak3Name, kak3Id: modalForm.kak3Id || undefined,
      kak4: modalForm.kak4Name, kak4Id: modalForm.kak4Id || undefined,
      locked: false,
    });
  };

  const validateForm = () => {
    return (
      modalForm.name.trim() !== "" &&
      modalForm.kak1Name.trim() !== "" &&
      modalForm.kak2Name.trim() !== "" &&
      modalForm.kak3Name.trim() !== "" &&
      modalForm.kak4Name.trim() !== ""
    );
  };

  const handleUpdateTeam = () => {
    if (!validateForm() || !selectedTeam) return;

    updateTeamMutation.mutate({
      teamId: selectedTeam.id,
      data: {
        name: modalForm.name.trim(),
        kak1: modalForm.kak1Name, kak1Id: modalForm.kak1Id || undefined,
        kak2: modalForm.kak2Name, kak2Id: modalForm.kak2Id || undefined,
        kak3: modalForm.kak3Name, kak3Id: modalForm.kak3Id || undefined,
        kak4: modalForm.kak4Name, kak4Id: modalForm.kak4Id || undefined,
      },
    });
  };

  if (isLoading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", padding: "2rem" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: "32px", height: "32px", border: "2px solid var(--border-hi)", borderTop: "2px solid var(--orange)", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto" }} />
          <p style={{ marginTop: "0.75rem", fontFamily: "var(--font-mono)", fontSize: "0.7rem", color: "var(--text-dim)" }}>LOADING TEAMS...</p>
        </div>
        <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const sortedTeams = teams?.sort((a: Team, b: Team) => a.position - b.position) || [];

  return (
    <div style={{ padding: "1rem", background: "var(--background)" }}>
      {/* Add Team Button */}
      <div style={{ marginBottom: "1rem", display: "flex", justifyContent: "flex-end" }}>
        {isAdmin && (
          <button
            onClick={openAddModal}
            disabled={(teams?.length || 0) >= 7}
            className="btn-primary flex items-center gap-2"
            data-testid="button-add-team"
          >
            <Plus size={16} />
            Add Team
          </button>
        )}
      </div>

      <div style={{ width: "100%" }}>
        <div style={{ textAlign: "center", marginBottom: "1rem" }}>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: "0.8rem", letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--orange)", textShadow: "0 0 12px rgba(255,90,0,0.4)" }}>
            Teams
          </h2>
        </div>
        {sortedTeams.length === 0 ? (
          <div style={{ textAlign: "center", padding: "3rem", background: "var(--card)", border: "1px solid var(--border-hi)", clipPath: "var(--clip-md)", margin: "0 1rem" }}>
            <p style={{ fontFamily: "var(--font-display)", fontSize: "0.7rem", letterSpacing: "0.1em", color: "var(--text-dim)" }}>NO TEAMS YET</p>
            <p style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--text-dim)", marginTop: "0.5rem" }}>Click "Add Team" to create the first team</p>
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden md:flex md:justify-center">
              <div style={{ overflowX: "auto" }}>
                <table style={{ borderCollapse: "collapse", background: "var(--card)", border: "1px solid var(--border-hi)", fontSize: "0.85rem", width: "auto", fontFamily: "var(--font-mono)" }}>
                  <thead>
                    <tr style={{ background: "rgba(255,90,0,0.06)", borderBottom: "1px solid rgba(255,90,0,0.2)" }}>
                      <th style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontFamily: "var(--font-display)", fontSize: "0.6rem", letterSpacing: "0.1em", color: "var(--ice)", fontWeight: 600, borderRight: "1px solid var(--border)", minWidth: "150px", maxWidth: "220px" }}>TEAM</th>
                      {["KAK 1","KAK 2","KAK 3","KAK 4"].map(h => (
                        <th key={h} style={{ padding: "0.5rem 0.75rem", textAlign: "center", fontFamily: "var(--font-display)", fontSize: "0.6rem", letterSpacing: "0.1em", color: "var(--ice)", fontWeight: 600, borderRight: "1px solid var(--border)", width: "100px" }}>{h}</th>
                      ))}
                      {isAdmin && (
                        <th style={{ padding: "0.5rem 0.75rem", textAlign: "center", fontFamily: "var(--font-display)", fontSize: "0.6rem", letterSpacing: "0.1em", color: "var(--ice)", fontWeight: 600, width: "90px" }}>ACTIONS</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedTeams.map((team: Team) => (
                      <tr
                        key={team.id}
                        style={{ borderBottom: "1px solid var(--border)", transition: "background 0.15s" }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.02)"; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                      >
                        {/* Team Name */}
                        <td style={{ padding: "0.5rem 0.75rem", borderRight: "1px solid var(--border)", minWidth: "150px", maxWidth: "220px" }}>
                          {editingTeam === team.id && editingField === "name" ? (
                            <input type="text" value={editValue} onChange={(e) => setEditValue(e.target.value)} onKeyDown={handleKeyPress} onBlur={handleSave} className="input w-full" autoFocus data-testid={`input-team-name-${team.position}`} />
                          ) : (
                            <button onClick={() => handleEdit(team.id, "name", team.name)} disabled={team.locked} style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", padding: "0.125rem 0.25rem", cursor: team.locked ? "default" : "pointer", color: "var(--foreground)", fontWeight: 600, fontFamily: "var(--font-mono)", fontSize: "0.85rem" }} data-testid={`team-name-${team.position}`}>
                              {team.name}
                            </button>
                          )}
                        </td>
                        {/* KAK 1-4 */}
                        {(["kak1","kak2","kak3","kak4"] as const).map(field => (
                          <td key={field} style={{ padding: "0.5rem 0.75rem", textAlign: "center", borderRight: "1px solid var(--border)", width: "100px" }}>
                            {editingTeam === team.id && editingField === field ? (
                              <input type="text" value={editValue} onChange={(e) => setEditValue(e.target.value)} onKeyDown={handleKeyPress} onBlur={handleSave} className="input w-full" autoFocus data-testid={`input-${field}-${team.position}`} />
                            ) : (
                              <button onClick={() => handleEdit(team.id, field, team[field] || "")} disabled={team.locked} style={{ display: "block", width: "100%", background: "none", border: "none", padding: "0.125rem", cursor: team.locked ? "default" : "pointer", color: team[field] ? "var(--foreground)" : "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: "0.8rem" }} data-testid={`${field}-${team.position}`}>
                                {team[field] || "—"}
                              </button>
                            )}
                          </td>
                        ))}
                        {/* Actions */}
                        {isAdmin && (
                          <td style={{ padding: "0.5rem 0.75rem", textAlign: "center" }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.25rem" }}>
                              <button onClick={() => openEditModal(team)} disabled={team.locked} style={{ padding: "0.375rem", background: "none", border: "none", cursor: team.locked ? "not-allowed" : "pointer", color: team.locked ? "var(--text-muted)" : "var(--ice)", transition: "color 0.15s, background 0.15s", borderRadius: "2px" }} data-testid={`button-edit-team-${team.position}`}
                                onMouseEnter={(e) => { if (!team.locked) (e.currentTarget as HTMLElement).style.color = "var(--orange)"; }}
                                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = team.locked ? "var(--text-muted)" : "var(--ice)"; }}
                              >
                                <Edit size={15} />
                              </button>
                              {isTeamFilled(team) && (
                                <button onClick={() => handleToggleLock(team)} style={{ padding: "0.375rem", background: "none", border: "none", cursor: "pointer", color: team.locked ? "var(--destructive)" : "var(--golf)", transition: "color 0.15s", borderRadius: "2px" }} data-testid={`button-${team.locked ? 'unlock' : 'lock'}-team-${team.position}`}>
                                  {team.locked ? <Unlock size={15} /> : <Lock size={15} />}
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
            <div className="md:hidden flex flex-col gap-3 px-2">
              {sortedTeams.map((team: Team) => (
                <div key={team.id} style={{ background: "var(--card)", border: "1px solid var(--border-hi)", clipPath: "var(--clip-sm)", padding: "1rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.75rem" }}>
                    <div>
                      <h3 style={{ fontFamily: "var(--font-display)", fontSize: "0.75rem", letterSpacing: "0.05em", color: "var(--foreground)", fontWeight: 700 }}>
                        {team.name}
                      </h3>
                      {team.locked && (
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.65rem", color: "var(--destructive)" }}>⬡ LOCKED</span>
                      )}
                    </div>
                    {isAdmin && (
                      <div style={{ display: "flex", gap: "0.25rem" }}>
                        <button onClick={() => openEditModal(team)} disabled={team.locked} style={{ padding: "0.375rem", background: "none", border: "none", cursor: team.locked ? "not-allowed" : "pointer", color: team.locked ? "var(--text-muted)" : "var(--ice)" }} data-testid={`button-edit-team-${team.position}`}>
                          <Edit size={14} />
                        </button>
                        {isTeamFilled(team) && (
                          <button onClick={() => handleToggleLock(team)} style={{ padding: "0.375rem", background: "none", border: "none", cursor: "pointer", color: team.locked ? "var(--destructive)" : "var(--golf)" }} data-testid={`button-${team.locked ? 'unlock' : 'lock'}-team-${team.position}`}>
                            {team.locked ? <Unlock size={14} /> : <Lock size={14} />}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                    {(["kak1","kak2","kak3","kak4"] as const).map((field, i) => (
                      <div key={field}>
                        <span style={{ fontFamily: "var(--font-display)", fontSize: "0.55rem", letterSpacing: "0.1em", color: "var(--text-dim)" }}>KAK {i+1}</span>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.8rem", color: team[field] ? "var(--foreground)" : "var(--text-muted)" }}>
                          {team[field] || "—"}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>



      {/* Edit Team Modal */}
      {showEditModal && selectedTeam && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }} onClick={() => setShowEditModal(false)}>
          <div style={{ background: "var(--card)", border: "1px solid var(--border-hi)", clipPath: "var(--clip-lg)", padding: "1.5rem", width: "100%", maxWidth: "420px", margin: "0 1rem" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
              <h3 style={{ fontFamily: "var(--font-display)", fontSize: "0.75rem", letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--orange)" }}>Edit Team</h3>
              <button onClick={() => setShowEditModal(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)", padding: "0.25rem" }} data-testid="button-close-edit-modal">
                <X size={18} />
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div>
                <label style={{ display: "block", fontFamily: "var(--font-display)", fontSize: "0.6rem", letterSpacing: "0.12em", color: "var(--ice)", textTransform: "uppercase", marginBottom: "0.375rem" }}>Team Name</label>
                <input type="text" value={modalForm.name} onChange={(e) => setModalForm(prev => ({ ...prev, name: e.target.value }))} className="input w-full" placeholder="Enter team name" data-testid="input-edit-team-name" />
              </div>
              {([1, 2, 3, 4] as const).map(n => (
                <div key={n}>
                  <label style={{ display: "block", fontFamily: "var(--font-display)", fontSize: "0.6rem", letterSpacing: "0.12em", color: "var(--ice)", textTransform: "uppercase", marginBottom: "0.375rem" }}>KAK {n}</label>
                  <KakCombobox value={modalForm[`kak${n}Name`]} kaks={activeKaks} onChange={(id, name) => setModalForm(prev => ({ ...prev, [`kak${n}Id`]: id, [`kak${n}Name`]: name }))} placeholder="Search KAK…" testId={`input-edit-kak${n}`} />
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.5rem" }}>
              <button onClick={() => setShowEditModal(false)} className="btn-secondary flex-1" data-testid="button-cancel-edit">Cancel</button>
              <button onClick={handleUpdateTeam} disabled={!validateForm() || updateTeamMutation.isPending} className="btn-primary flex-1" data-testid="button-save-edit">
                {updateTeamMutation.isPending ? "UPDATING..." : "UPDATE TEAM"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Team Modal */}
      {showAddModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }} onClick={() => setShowAddModal(false)}>
          <div style={{ background: "var(--card)", border: "1px solid var(--border-hi)", clipPath: "var(--clip-lg)", padding: "1.5rem", width: "100%", maxWidth: "420px", margin: "0 1rem" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
              <h3 style={{ fontFamily: "var(--font-display)", fontSize: "0.75rem", letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--orange)" }}>Add New Team</h3>
              <button onClick={() => setShowAddModal(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)", padding: "0.25rem" }} data-testid="button-close-add-modal">
                <X size={18} />
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div>
                <label style={{ display: "block", fontFamily: "var(--font-display)", fontSize: "0.6rem", letterSpacing: "0.12em", color: "var(--ice)", textTransform: "uppercase", marginBottom: "0.375rem" }}>Team Name</label>
                <input type="text" value={modalForm.name} onChange={(e) => setModalForm(prev => ({ ...prev, name: e.target.value }))} className="input w-full" placeholder="Enter team name" data-testid="input-add-team-name" />
              </div>
              {([1, 2, 3, 4] as const).map(n => (
                <div key={n}>
                  <label style={{ display: "block", fontFamily: "var(--font-display)", fontSize: "0.6rem", letterSpacing: "0.12em", color: "var(--ice)", textTransform: "uppercase", marginBottom: "0.375rem" }}>KAK {n}</label>
                  <KakCombobox value={modalForm[`kak${n}Name`]} kaks={activeKaks} onChange={(id, name) => setModalForm(prev => ({ ...prev, [`kak${n}Id`]: id, [`kak${n}Name`]: name }))} placeholder="Search KAK…" testId={`input-add-kak${n}`} />
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.5rem" }}>
              <button onClick={() => setShowAddModal(false)} className="btn-secondary flex-1" data-testid="button-cancel-add">Cancel</button>
              <button onClick={handleCreateTeam} disabled={!validateForm() || createTeamMutation.isPending} className="btn-primary flex-1" data-testid="button-save-add">
                {createTeamMutation.isPending ? "SAVING..." : "SAVE TEAM"}
              </button>
            </div>
          </div>
        </div>
      )}
      

    </div>
  );
});

export default TeamsTab;