import { useEffect, useState } from "react";
import { onlineManager, useQueryClient } from "@tanstack/react-query";
import { isTransientReadError } from "@/lib/queryClient";

export function ConnectionStatus() {
  const client = useQueryClient();
  const [, setRevision] = useState(0);

  useEffect(() => {
    const update = () => setRevision((value) => value + 1);
    const unsubscribeQueries = client.getQueryCache().subscribe(update);
    const unsubscribeOnline = onlineManager.subscribe(update);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      unsubscribeQueries();
      unsubscribeOnline();
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, [client]);

  const online = onlineManager.isOnline() && navigator.onLine;
  const queries = client.getQueryCache().findAll({
    type: "active",
    predicate: (query) => typeof query.queryKey[0] === "string" &&
      query.queryKey[0].startsWith("/api/") && !query.queryKey[0].startsWith("/api/auth/"),
  });
  const interrupted = queries.filter((query) =>
    query.state.fetchStatus === "paused" ||
    (query.state.fetchFailureCount > 0 && isTransientReadError(query.state.fetchFailureReason)) ||
    (query.state.status === "error" && isTransientReadError(query.state.error)),
  );
  if (online && interrupted.length === 0) return null;

  const visible = (online ? interrupted : queries).filter((query) => query.state.data !== undefined);
  const lastUpdate = visible.length ? Math.min(...visible.map((query) => query.state.dataUpdatedAt)) : 0;
  const retrying = interrupted.some((query) => query.state.fetchStatus === "fetching");

  return (
    <div role="status" aria-live="polite" className="border-b border-orange/40 bg-card px-4 py-3 text-sm text-foreground">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2">
        <div>
          <strong>{online ? "Connection interrupted." : "Device reports no connection."}</strong>{" "}
          {lastUpdate
            ? `Showing previously loaded data from ${new Date(lastUpdate).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.`
            : "Unable to load current data."}{" "}
          {online && retrying ? "Retrying…" : !online ? "Refresh will resume when connected." : ""}
        </div>
        {online && interrupted.length > 0 && !retrying && (
          <button type="button" className="btn-ghost text-xs" onClick={() => {
            void client.refetchQueries({ type: "active", predicate: (query) => interrupted.includes(query) });
          }}>Retry now</button>
        )}
      </div>
    </div>
  );
}
