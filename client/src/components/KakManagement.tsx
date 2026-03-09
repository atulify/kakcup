import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Plus, Edit, X, Check } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface Kak {
  id: string;
  name: string;
  status: string;
}

const ALL_STATUSES = ["active", "inactive", "retired", "in-memoriam"] as const;
type KakStatus = (typeof ALL_STATUSES)[number];

const STATUS_LABELS: Record<KakStatus, string> = {
  active: "Active",
  inactive: "Inactive",
  retired: "Retired",
  "in-memoriam": "In Memoriam",
};

// ---------------------------------------------------------------------------
// Inline edit row
// ---------------------------------------------------------------------------

function KakRow({
  kak,
  allKaks,
  onSave,
  isPending,
}: {
  kak: Kak;
  allKaks: Kak[];
  onSave: (id: string, name: string, status: string) => void;
  isPending: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(kak.name);
  const [status, setStatus] = useState<KakStatus>(kak.status as KakStatus);
  const [nameError, setNameError] = useState<string | null>(null);

  function startEdit() {
    setName(kak.name);
    setStatus(kak.status as KakStatus);
    setNameError(null);
    setEditing(true);
  }

  function cancel() {
    setEditing(false);
    setNameError(null);
  }

  function save() {
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError("Name is required");
      return;
    }
    const collision = allKaks.find(
      (k) => k.id !== kak.id && k.name.toLowerCase() === trimmed.toLowerCase()
    );
    if (collision) {
      setNameError("A KAK with that name already exists");
      return;
    }
    onSave(kak.id, trimmed, status);
    setEditing(false);
    setNameError(null);
  }

  if (!editing) {
    return (
      <tr className="border-b border-border last:border-0 hover:bg-accent/20" data-testid={`kak-row-${kak.id}`}>
        <td className="px-4 py-2 text-foreground font-medium text-sm">{kak.name}</td>
        <td className="px-4 py-2 text-sm text-muted-foreground capitalize">{STATUS_LABELS[kak.status as KakStatus] ?? kak.status}</td>
        <td className="px-4 py-2 text-right">
          <Button size="sm" variant="ghost" onClick={startEdit} className="h-7 px-2" data-testid={`edit-kak-${kak.id}`}>
            <Edit size={13} />
          </Button>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-border last:border-0 bg-accent/10" data-testid={`kak-row-editing-${kak.id}`}>
      <td className="px-4 py-2" colSpan={3}>
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 flex-wrap">
            <input
              value={name}
              onChange={(e) => { setName(e.target.value); setNameError(null); }}
              onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") cancel(); }}
              className="flex-1 min-w-[120px] px-2 py-1 text-sm bg-background border border-border rounded-md text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              autoFocus
              data-testid={`input-kak-name-${kak.id}`}
            />
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as KakStatus)}
              className="px-2 py-1 text-sm bg-background border border-border rounded-md text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              data-testid={`select-kak-status-${kak.id}`}
            >
              {ALL_STATUSES.map((s) => (
                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
              ))}
            </select>
            <Button size="sm" variant="default" onClick={save} disabled={isPending} className="h-7 px-2" data-testid={`save-kak-${kak.id}`}>
              <Check size={13} />
            </Button>
            <Button size="sm" variant="ghost" onClick={cancel} className="h-7 px-2" data-testid={`cancel-kak-${kak.id}`}>
              <X size={13} />
            </Button>
          </div>
          {nameError && (
            <p className="text-xs text-destructive" data-testid="kak-name-error">{nameError}</p>
          )}
        </div>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Collapsible group for non-active statuses
// ---------------------------------------------------------------------------

function KakGroup({
  status,
  kaks,
  allKaks,
  onSave,
  isPending,
}: {
  status: KakStatus;
  kaks: Kak[];
  allKaks: Kak[];
  onSave: (id: string, name: string, status: string) => void;
  isPending: boolean;
}) {
  const [open, setOpen] = useState(false);
  if (kaks.length === 0) return null;

  return (
    <div className="border border-border rounded-lg overflow-hidden" data-testid={`kak-group-${status}`}>
      <button
        className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 text-left"
        onClick={() => setOpen((o) => !o)}
        data-testid={`kak-group-toggle-${status}`}
      >
        <span className="text-sm font-medium text-foreground">
          {STATUS_LABELS[status]}
          <span className="ml-2 text-xs text-muted-foreground font-normal">({kaks.length})</span>
        </span>
        {open ? <ChevronDown size={16} className="text-muted-foreground" /> : <ChevronRight size={16} className="text-muted-foreground" />}
      </button>
      {open && (
        <table className="w-full text-sm" data-testid={`kak-table-${status}`}>
          <tbody>
            {kaks.map((kak) => (
              <KakRow key={kak.id} kak={kak} allKaks={allKaks} onSave={onSave} isPending={isPending} />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main section
// ---------------------------------------------------------------------------

export default function KakManagement() {
  const { toast } = useToast();
  const [newName, setNewName] = useState("");
  const [newNameError, setNewNameError] = useState<string | null>(null);

  const { data: allKaks = [], isLoading } = useQuery<Kak[]>({
    queryKey: ["/api/kaks"],
    queryFn: () => apiRequest("/api/kaks"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, name, status }: { id: string; name: string; status: string }) =>
      apiRequest(`/api/kaks/${id}`, "PATCH", { name, status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/kaks"] });
      toast({ title: "KAK updated" });
    },
    onError: (err: any) => {
      const msg = err?.message?.includes("409") ? "A KAK with that name already exists" : "Failed to update KAK";
      toast({ title: msg, variant: "destructive" });
    },
  });

  const createMutation = useMutation({
    mutationFn: (name: string) => apiRequest("/api/kaks", "POST", { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/kaks"] });
      setNewName("");
      setNewNameError(null);
      toast({ title: "KAK added" });
    },
    onError: (err: any) => {
      const msg = err?.message?.includes("409") ? "A KAK with that name already exists" : "Failed to create KAK";
      setNewNameError(msg);
      toast({ title: msg, variant: "destructive" });
    },
  });

  function handleCreate() {
    const trimmed = newName.trim();
    if (!trimmed) { setNewNameError("Name is required"); return; }
    const collision = allKaks.find((k) => k.name.toLowerCase() === trimmed.toLowerCase());
    if (collision) { setNewNameError("A KAK with that name already exists"); return; }
    setNewNameError(null);
    createMutation.mutate(trimmed);
  }

  const byStatus = ALL_STATUSES.reduce<Record<string, Kak[]>>((acc, s) => {
    acc[s] = allKaks.filter((k) => k.status === s);
    return acc;
  }, {});

  const activeKaks = byStatus["active"];
  const nonActiveStatuses = ALL_STATUSES.filter((s) => s !== "active");

  return (
    <section className="bg-card border border-border rounded-lg p-6 space-y-5" data-testid="kak-management">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">KAK Roster</h2>
        <span className="text-xs text-muted-foreground">{allKaks.length} total</span>
      </div>

      {/* Add new KAK */}
      <div className="flex flex-col gap-1">
        <div className="flex gap-2">
          <input
            value={newName}
            onChange={(e) => { setNewName(e.target.value); setNewNameError(null); }}
            onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
            placeholder="New KAK name..."
            className="flex-1 px-3 py-2 text-sm bg-background border border-border rounded-md text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            data-testid="input-new-kak-name"
          />
          <Button
            size="sm"
            onClick={handleCreate}
            disabled={createMutation.isPending || !newName.trim()}
            className="flex items-center gap-1"
            data-testid="button-add-kak"
          >
            <Plus size={14} />
            Add
          </Button>
        </div>
        {newNameError && (
          <p className="text-xs text-destructive" data-testid="new-kak-name-error">{newNameError}</p>
        )}
      </div>

      {/* Active KAKs table */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <h3 className="text-sm font-medium text-foreground">Active</h3>
          <span className="text-xs text-muted-foreground">({activeKaks.length})</span>
        </div>
        {isLoading ? (
          <div className="text-sm text-muted-foreground py-4 text-center">Loading…</div>
        ) : activeKaks.length === 0 ? (
          <div className="text-sm text-muted-foreground py-4 text-center border border-border rounded-lg">No active KAKs</div>
        ) : (
          <div className="border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm" data-testid="kak-table-active">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-4 py-2 text-left font-medium text-foreground">Name</th>
                  <th className="px-4 py-2 text-left font-medium text-foreground w-32">Status</th>
                  <th className="px-4 py-2 w-12" />
                </tr>
              </thead>
              <tbody>
                {activeKaks.map((kak) => (
                  <KakRow
                    key={kak.id}
                    kak={kak}
                    allKaks={allKaks}
                    onSave={(id, name, status) => updateMutation.mutate({ id, name, status })}
                    isPending={updateMutation.isPending}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Collapsed sections for other statuses */}
      <div className="space-y-2">
        {nonActiveStatuses.map((status) => (
          <KakGroup
            key={status}
            status={status}
            kaks={byStatus[status]}
            allKaks={allKaks}
            onSave={(id, name, st) => updateMutation.mutate({ id, name, status: st })}
            isPending={updateMutation.isPending}
          />
        ))}
      </div>
    </section>
  );
}
