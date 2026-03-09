import React, { lazy, Suspense, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Settings as SettingsIcon, Home, Trash2, Plus } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Year } from "@shared/schema";

const KakManagement = lazy(() => import("@/components/KakManagement"));

type Section = "years" | "kaks";

const NAV_ITEMS: { id: Section; label: string; emoji: string }[] = [
  { id: "years", label: "Years", emoji: "📅" },
  { id: "kaks", label: "KAKs", emoji: "👥" },
];

// ---------------------------------------------------------------------------
// Years section
// ---------------------------------------------------------------------------

function YearsSection() {
  const { toast } = useToast();
  const [statusYearId, setStatusYearId] = useState("");
  const [clearYearId, setClearYearId] = useState("");
  const [confirmingClear, setConfirmingClear] = useState(false);

  const { data: years } = useQuery<Year[]>({ queryKey: ["/api/years"] });

  const statusMutation = useMutation({
    mutationFn: ({ yearId, status }: { yearId: string; status: string }) =>
      apiRequest(`/api/years/${yearId}`, "PATCH", { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/years"] });
      toast({ title: "Status updated" });
    },
    onError: (err: any) => {
      const body = err?.responseBody;
      const msg = body?.error ?? "Failed to update status";
      toast({ title: msg, variant: "destructive" });
    },
  });

  const clearMutation = useMutation({
    mutationFn: (yearId: string) =>
      apiRequest(`/api/years/${yearId}/scores`, "DELETE"),
    onSuccess: () => {
      queryClient.invalidateQueries();
      setConfirmingClear(false);
      setClearYearId("");
      toast({ title: "Scores cleared" });
    },
    onError: () => {
      toast({ title: "Error", variant: "destructive" });
    },
  });

  const createYearMutation = useMutation({
    mutationFn: () => apiRequest("/api/years", "POST"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/years"] });
      toast({ title: "Year created" });
    },
    onError: () => {
      toast({ title: "Failed to create year", variant: "destructive" });
    },
  });

  const sortedYears = [...(years || [])].sort((a, b) => b.year - a.year);
  const selectedStatusYear = sortedYears.find((y) => y.id === statusYearId);
  const nonCompletedYears = sortedYears.filter((y) => y.status !== "completed");

  const sectionStyle: React.CSSProperties = {
    background: "var(--card)",
    border: "1px solid var(--border-hi)",
    clipPath: "var(--clip-md)",
    padding: "1.25rem 1.5rem",
    marginBottom: "1.25rem",
  };

  const sectionTitleStyle: React.CSSProperties = {
    fontFamily: "var(--font-display)",
    fontSize: "0.65rem",
    letterSpacing: "0.15em",
    textTransform: "uppercase",
    color: "var(--ice)",
    marginBottom: "1rem",
  };

  const selectStyle: React.CSSProperties = {
    width: "100%",
    padding: "0.5rem 0.75rem",
    background: "var(--input)",
    color: "var(--foreground)",
    border: "1px solid var(--border-hi)",
    fontFamily: "var(--font-mono)",
    fontSize: "0.85rem",
    clipPath: "var(--clip-sm)",
    outline: "none",
    marginBottom: "1rem",
    cursor: "pointer",
  };

  return (
    <div>
      {/* Year Status */}
      <section style={sectionStyle}>
        <h2 style={sectionTitleStyle}>⬡ Year Status</h2>
        <select value={statusYearId} onChange={(e) => setStatusYearId(e.target.value)} style={selectStyle}>
          <option value="">— Select a year —</option>
          {sortedYears.map((y) => (
            <option key={y.id} value={y.id}>{y.year} — {y.name}</option>
          ))}
        </select>

        {selectedStatusYear && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--text-dim)" }}>
              Current status:{" "}
              <span style={{ color: "var(--ice)", fontWeight: 600, textTransform: "uppercase" }}>
                {selectedStatusYear.status}
              </span>
            </div>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              {(["upcoming", "active", "completed"] as const).map((s) => (
                <Button
                  key={s}
                  size="sm"
                  variant={selectedStatusYear.status === s ? "default" : "outline"}
                  disabled={selectedStatusYear.status === s || statusMutation.isPending}
                  onClick={() => statusMutation.mutate({ yearId: statusYearId, status: s })}
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </Button>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Create Next Year */}
      <section style={sectionStyle}>
        <h2 style={sectionTitleStyle}>⬡ Create Next Year</h2>
        <Button
          size="sm"
          disabled={createYearMutation.isPending || !sortedYears.length}
          onClick={() => createYearMutation.mutate()}
          className="flex items-center gap-2"
        >
          <Plus size={14} />
          {createYearMutation.isPending
            ? "Creating..."
            : `Create ${sortedYears.length ? sortedYears[0].year + 1 : "Year"}`}
        </Button>
      </section>

      {/* Clear Scores */}
      <section style={sectionStyle}>
        <h2 style={sectionTitleStyle}>⬡ Clear Scores</h2>
        <select
          value={clearYearId}
          onChange={(e) => { setClearYearId(e.target.value); setConfirmingClear(false); }}
          style={selectStyle}
        >
          <option value="">— Select a year —</option>
          {nonCompletedYears.map((y) => (
            <option key={y.id} value={y.id}>{y.year} — {y.name}</option>
          ))}
        </select>

        {!confirmingClear ? (
          <Button
            variant="destructive"
            size="sm"
            disabled={!clearYearId}
            onClick={() => setConfirmingClear(true)}
            className="flex items-center gap-2"
          >
            <Trash2 size={14} />
            Clear Scores
          </Button>
        ) : (
          <div style={{ padding: "1rem", background: "rgba(204,34,0,0.08)", border: "1px solid rgba(204,34,0,0.3)", clipPath: "var(--clip-sm)", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <p style={{ fontFamily: "var(--font-mono)", fontSize: "0.8rem", color: "var(--foreground)" }}>
              Are you sure? This will delete all fish weights, chug times, and golf scores for this year.
            </p>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <Button
                variant="destructive"
                size="sm"
                disabled={clearMutation.isPending}
                onClick={() => clearMutation.mutate(clearYearId)}
              >
                {clearMutation.isPending ? "Clearing..." : "Confirm"}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setConfirmingClear(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page shell
// ---------------------------------------------------------------------------

export default function Settings() {
  const [, setLocation] = useLocation();
  const { isAdmin, isLoading: authLoading } = useAuth();
  const [activeSection, setActiveSection] = useState<Section>("years");

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.8rem", color: "var(--text-dim)" }}>LOADING...</div>
      </div>
    );
  }

  if (!isAdmin) {
    setLocation("/");
    return null;
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header style={{ background: "var(--card)", borderBottom: "1px solid var(--border-hi)" }} className="py-3">
        <div className="max-w-5xl mx-auto px-3 sm:px-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <SettingsIcon size={16} style={{ color: "var(--ice)" }} />
              <h1 style={{ fontFamily: "var(--font-display)", color: "var(--orange)", fontSize: "0.85rem", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                Settings
              </h1>
            </div>
            <button onClick={() => setLocation("/")} className="btn-ghost flex items-center gap-1 text-xs">
              <Home size={14} />
              <span className="hidden sm:inline">Home</span>
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 max-w-5xl mx-auto w-full px-3 sm:px-6 py-6">
        <div className="flex gap-6">
          {/* Side nav */}
          <nav style={{ width: "9rem", flexShrink: 0 }} data-testid="settings-sidenav">
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.25rem" }}>
              {NAV_ITEMS.map((item) => {
                const isActive = activeSection === item.id;
                return (
                  <li key={item.id}>
                    <button
                      onClick={() => setActiveSection(item.id)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                        width: "100%",
                        padding: "0.5rem 0.75rem",
                        fontFamily: "var(--font-display)",
                        fontSize: "0.65rem",
                        letterSpacing: "0.1em",
                        textTransform: "uppercase",
                        background: isActive ? "rgba(255,90,0,0.1)" : "transparent",
                        color: isActive ? "var(--orange)" : "var(--text-dim)",
                        borderLeft: isActive ? "2px solid var(--orange)" : "2px solid transparent",
                        cursor: "pointer",
                        outline: "none",
                        transition: "all 0.15s",
                      }}
                      data-testid={`nav-${item.id}`}
                    >
                      <span>{item.emoji}</span>
                      {item.label}
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* Content */}
          <main className="flex-1 min-w-0">
            {activeSection === "years" && <YearsSection />}
            {activeSection === "kaks" && (
              <Suspense fallback={
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--text-dim)", textAlign: "center", padding: "2rem 0" }}>
                  LOADING...
                </div>
              }>
                <KakManagement />
              </Suspense>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
