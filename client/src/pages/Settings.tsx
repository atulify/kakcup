import { lazy, Suspense, useState } from "react";
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

  return (
    <div className="space-y-6">
      {/* Year Status */}
      <section className="bg-card border border-border rounded-lg p-6">
        <h2 className="text-lg font-semibold text-foreground mb-4">Year Status</h2>
        <select
          value={statusYearId}
          onChange={(e) => setStatusYearId(e.target.value)}
          className="w-full px-3 py-2 bg-background border border-border rounded-md text-foreground text-sm mb-4"
        >
          <option value="">Select a year...</option>
          {sortedYears.map((y) => (
            <option key={y.id} value={y.id}>
              {y.year} - {y.name}
            </option>
          ))}
        </select>

        {selectedStatusYear && (
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">
              Current status:{" "}
              <span className="font-medium text-foreground capitalize">
                {selectedStatusYear.status}
              </span>
            </div>
            <div className="flex gap-2 flex-wrap">
              {(["upcoming", "active", "completed"] as const).map((s) => (
                <Button
                  key={s}
                  size="sm"
                  variant={selectedStatusYear.status === s ? "default" : "outline"}
                  disabled={selectedStatusYear.status === s || statusMutation.isPending}
                  onClick={() =>
                    statusMutation.mutate({ yearId: statusYearId, status: s })
                  }
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </Button>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Create Next Year */}
      <section className="bg-card border border-border rounded-lg p-6">
        <h2 className="text-lg font-semibold text-foreground mb-4">Create Next Year</h2>
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
      <section className="bg-card border border-border rounded-lg p-6">
        <h2 className="text-lg font-semibold text-foreground mb-4">Clear Scores</h2>
        <select
          value={clearYearId}
          onChange={(e) => {
            setClearYearId(e.target.value);
            setConfirmingClear(false);
          }}
          className="w-full px-3 py-2 bg-background border border-border rounded-md text-foreground text-sm mb-4"
        >
          <option value="">Select a year...</option>
          {nonCompletedYears.map((y) => (
            <option key={y.id} value={y.id}>
              {y.year} - {y.name}
            </option>
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
          <div className="space-y-3 p-4 bg-destructive/10 border border-destructive/30 rounded-md">
            <p className="text-sm text-foreground">
              Are you sure? This will delete all fish weights, chug times, and golf
              scores for this year.
            </p>
            <div className="flex gap-2">
              <Button
                variant="destructive"
                size="sm"
                disabled={clearMutation.isPending}
                onClick={() => clearMutation.mutate(clearYearId)}
              >
                {clearMutation.isPending ? "Clearing..." : "Confirm"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirmingClear(false)}
              >
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
        <div className="text-lg text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!isAdmin) {
    setLocation("/");
    return null;
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="bg-card border-b border-border py-3">
        <div className="max-w-5xl mx-auto px-3 sm:px-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <SettingsIcon size={20} className="text-primary" />
              <h1 className="text-xl font-bold text-primary">Settings</h1>
            </div>
            <Button
              onClick={() => setLocation("/")}
              variant="outline"
              size="sm"
              className="flex items-center gap-1"
            >
              <Home size={16} />
              <span className="hidden sm:inline">Home</span>
            </Button>
          </div>
        </div>
      </header>

      <div className="flex-1 max-w-5xl mx-auto w-full px-3 sm:px-6 py-6">
        <div className="flex gap-6">
          {/* Side nav */}
          <nav className="w-44 shrink-0" data-testid="settings-sidenav">
            <ul className="space-y-1">
              {NAV_ITEMS.map((item) => (
                <li key={item.id}>
                  <button
                    onClick={() => setActiveSection(item.id)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      activeSection === item.id
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent"
                    }`}
                    data-testid={`nav-${item.id}`}
                  >
                    <span>{item.emoji}</span>
                    {item.label}
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          {/* Content */}
          <main className="flex-1 min-w-0">
            {activeSection === "years" && <YearsSection />}
            {activeSection === "kaks" && (
              <Suspense fallback={<div className="text-sm text-muted-foreground py-8 text-center">Loading…</div>}>
                <KakManagement />
              </Suspense>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
