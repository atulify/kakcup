import { useEffect, useState, useSyncExternalStore } from "react";
import { useAuth } from "@/hooks/useAuth";
import { queryClient } from "@/lib/queryClient";
import type { Team, Year } from "@/lib/api-types";

type ScoreOperation = {
  key: string;
  userId: string;
  path: string;
  body: string;
  yearId: string;
  kind: string;
};
type Display = { operation?: ScoreOperation; state: "saving" | "pending" | "confirmed" | "rejected"; message: string };
const prefix = "kakcup.score-save.";
const listeners = new Set<() => void>();
const inFlight = new Set<string>();
const suspended = new Set<string>();
const delays = new Map<string, number>();
const nextAttempt = new Map<string, number>();
const confirmations = new Map<string, () => void>();
let displays: Display[] = [];
let activeUser: string | undefined;
let timer: number | undefined;

function describeOperation(operation: ScoreOperation): string {
  const labels: Record<string, string> = {
    "fish-weights": "Fish weight",
    "chug-times": "Chug time",
    "golf-scores": "Golf score",
  };
  let body: { teamId?: string; weight?: number; chug1?: number; chug2?: number; score?: number };
  try {
    body = JSON.parse(operation.body);
  } catch {
    return labels[operation.kind] ?? "Score";
  }
  const teams = queryClient.getQueryData<Team[]>(["/api/years", operation.yearId, "teams"]);
  const years = queryClient.getQueryData<Year[]>(["/api/years"]);
  const team = teams?.find((item) => item.id === body.teamId)?.name ?? `Team ${body.teamId?.slice(0, 8) ?? "unknown"}`;
  const year = years?.find((item) => item.id === operation.yearId)?.year;
  const value = operation.kind === "fish-weights" ? body.weight
    : operation.kind === "chug-times" ? `${body.chug1} / ${body.chug2}`
    : body.score;
  return [labels[operation.kind], team, year, value].filter((item) => item !== undefined).join(" · ");
}

function notify() {
  displays = [...displays];
  listeners.forEach((listener) => listener());
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
function setDisplay(item: Display) {
  displays = [...displays.filter((entry) => entry.operation?.key !== item.operation?.key), item];
  notify();
}
function storedOperations(userId?: string): ScoreOperation[] {
  const result: ScoreOperation[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith(prefix)) continue;
    const value = localStorage.getItem(key);
    if (!value) throw new Error("A pending save could not be read.");
    const operation: unknown = JSON.parse(value);
    if (!operation || typeof operation !== "object" || !("key" in operation) || typeof operation.key !== "string" ||
        !("userId" in operation) || typeof operation.userId !== "string" ||
        !("path" in operation) || typeof operation.path !== "string" ||
        !("body" in operation) || typeof operation.body !== "string" ||
        !("yearId" in operation) || typeof operation.yearId !== "string" ||
        !("kind" in operation) || typeof operation.kind !== "string" ||
        key !== prefix + operation.key ||
        !["fish-weights", "chug-times", "golf-scores"].includes(operation.kind) ||
        operation.path !== `/api/years/${operation.yearId}/${operation.kind}`) {
      throw new Error("A pending save could not be read.");
    }
    if (!userId || operation.userId === userId) result.push(operation as ScoreOperation);
  }
  return result;
}
function storageError(message: string) {
  setDisplay({ state: "rejected", message });
}
function schedule() {
  clearTimeout(timer);
  timer = window.setTimeout(() => recover(), 2000);
}
async function send(operation: ScoreOperation, initial: boolean): Promise<boolean> {
  if (inFlight.has(operation.key) || activeUser !== operation.userId) return false;
  inFlight.add(operation.key);
  setDisplay({ operation, state: "saving", message: "Saving score…" });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  let retryAfter = 0;
  try {
    const response = await fetch(operation.path, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", "Idempotency-Key": operation.key, "X-Score-User": operation.userId },
      body: operation.body,
      signal: controller.signal,
    });
    if (response.status === 201) {
      await response.json();
      try { localStorage.removeItem(prefix + operation.key); } catch { /* Safe to replay the same key after reload. */ }
      delays.delete(operation.key);
      nextAttempt.delete(operation.key);
      suspended.delete(operation.key);
      setDisplay({ operation, state: "confirmed", message: "Score confirmed saved." });
      queryClient.invalidateQueries({ queryKey: ["/api/years", operation.yearId, operation.kind] });
      try { confirmations.get(operation.key)?.(); } catch (error) { console.error("Could not update the score form", error); }
      confirmations.delete(operation.key);
      return true;
    }
    if ((initial || (response.status !== 401 && response.status !== 403)) && response.status !== 409 &&
        response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429) {
      const detail = await response.text().catch(() => "");
      localStorage.removeItem(prefix + operation.key);
      suspended.delete(operation.key);
      confirmations.delete(operation.key);
      const reason = response.status === 401 ? "Sign in to save scores." : response.status === 403 ? "Permission denied or competition locked." : response.status === 409 ? "This save conflicts with an existing operation." : "The score was rejected; check the entered values.";
      setDisplay({ operation, state: "rejected", message: `${reason}${detail ? ` ${detail}` : ""}` });
      return false;
    }
    if (response.status === 409 || (!initial && (response.status === 401 || response.status === 403))) {
      suspended.add(operation.key);
      const message = response.status === 409
        ? "Confirmation is blocked by an account change or conflicting save. Sign in with the original account and check before re-entering this score."
        : "Confirmation pending. Sign in with the original account and check your permission; this score may already be saved.";
      setDisplay({ operation, state: "pending", message });
      return false;
    }
    const retryHeader = response.headers.get("retry-after");
    if (retryHeader) {
      const seconds = Number(retryHeader);
      const requested = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retryHeader) - Date.now();
      if (Number.isFinite(requested)) retryAfter = Math.max(0, requested);
    }
  } catch {
    // A lost response or timeout cannot establish whether the server committed.
  } finally {
    clearTimeout(timeout);
    inFlight.delete(operation.key);
  }
  if (!displays.some((entry) => entry.operation?.key === operation.key && entry.state === "pending")) {
    setDisplay({ operation, state: "pending", message: "Confirmation pending. This score may already be saved; retrying the same save safely." });
  }
  const delay = Math.min(2_147_483_647, Math.max(retryAfter, Math.min((delays.get(operation.key) ?? 500) * 2, 30000) * (0.75 + Math.random() * 0.5)));
  delays.set(operation.key, delay);
  nextAttempt.set(operation.key, Date.now() + delay);
  window.setTimeout(() => recover(), delay);
  return false;
}
function recover(force = false) {
  if (!activeUser || !navigator.onLine) return;
  try {
    for (const operation of storedOperations(activeUser)) {
      if (force) suspended.delete(operation.key);
      if (!suspended.has(operation.key) && !inFlight.has(operation.key) &&
          (force || Date.now() >= (nextAttempt.get(operation.key) ?? 0))) void send(operation, false);
    }
  } catch { storageError("Pending saves could not be read. Re-enable browser storage; an earlier score may already be saved."); }
}

export function usePendingScoreSaves(yearId: string, kind?: string) {
  useSyncExternalStore(subscribe, () => displays, () => displays);
  if (!yearId) return false;
  try {
    return storedOperations().some((operation) => operation.yearId === yearId && (!kind || operation.kind === kind));
  } catch {
    return true;
  }
}

export function useScoreSave<T>(yearId: string, kind: string, onConfirmed: (data: T) => void) {
  const { user } = useAuth();
  const blocked = usePendingScoreSaves(yearId, kind);
  const path = `/api/years/${yearId}/${kind}`;
  const mutate = (data: T) => {
    if (!user?.id) {
      setDisplay({ state: "rejected", message: "Sign in to save scores." });
      return;
    }
    try {
      // Check storage synchronously as well as React state to prevent rapid double submits.
      if (storedOperations().some((operation) => operation.path === path)) {
        recover();
        return;
      }
      const operation: ScoreOperation = { key: crypto.randomUUID(), userId: user.id, path, body: JSON.stringify(data), yearId, kind };
      localStorage.setItem(prefix + operation.key, JSON.stringify(operation));
      activeUser = user.id;
      confirmations.set(operation.key, () => onConfirmed(data));
      void send(operation, true);
    } catch { storageError("Cannot safely track this save on this device. No new score was sent; check pending saves before trying again."); }
  };
  return { mutate, isPending: blocked };
}

export function ScoreSaveRecovery() {
  const { user } = useAuth();
  const entries = useSyncExternalStore(subscribe, () => displays, () => displays);
  const [storageAvailable, setStorageAvailable] = useState(true);
  const [hasStoredSaves, setHasStoredSaves] = useState(false);
  useEffect(() => {
    try {
      setHasStoredSaves(Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)).some((key) => key?.startsWith(prefix)));
    } catch { setStorageAvailable(false); }
  }, [entries, user?.id]);
  useEffect(() => {
    activeUser = user?.id;
    try {
      setHasStoredSaves(Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)).some((key) => key?.startsWith(prefix)));
      setStorageAvailable(true);
    } catch { setStorageAvailable(false); }
    if (!user?.id) return;
    try {
      const operations = storedOperations(user.id);
      setStorageAvailable(true);
      for (const operation of operations) {
        if (!displays.some((entry) => entry.operation?.key === operation.key)) {
          setDisplay({ operation, state: "pending", message: "Confirmation pending. This score may already be saved; retrying the same save safely." });
        }
      }
      recover();
    } catch { setStorageAvailable(false); }
    const onOnline = () => recover(true);
    const onStorage = () => { notify(); schedule(); };
    window.addEventListener("online", onOnline);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("storage", onStorage);
      if (activeUser === user.id) activeUser = undefined;
    };
  }, [user?.id]);
  const visible = entries.filter((entry) => !entry.operation || entry.operation.userId === user?.id);
  if (!user?.id) {
    if (!hasStoredSaves && storageAvailable) return null;
    return <section aria-label="Score save status" aria-live="polite" className="sticky top-0 z-50 border-b border-orange/40 bg-card p-3 text-sm text-foreground">
      {storageAvailable
        ? "This device has score saves awaiting confirmation. Reconnect and sign in with the original account."
        : "Browser storage is unavailable. Pending score saves may need confirmation."}
    </section>;
  }
  if (visible.length === 0 && storageAvailable && !hasStoredSaves) return null;
  return <section aria-label="Score save status" aria-live="polite" className="sticky top-0 z-50 space-y-2 border-b border-orange/40 bg-card p-3 text-sm text-foreground">
    {!storageAvailable && <p>Browser storage is unavailable. Pending scores cannot be recovered and new scores cannot be sent.</p>}
    {storageAvailable && hasStoredSaves && visible.length === 0 && <p>This device has score saves awaiting confirmation for another account.</p>}
    {visible.map((entry, index) => <div key={entry.operation?.key ?? `error-${index}`}>
      <p><strong>{entry.state === "saving" ? "Saving" : entry.state === "confirmed" ? "Confirmed" : entry.state === "rejected" ? "Rejected" : "Confirmation pending"}:</strong> {entry.operation ? `${describeOperation(entry.operation)}. ` : ""}{entry.message}</p>
      {entry.state === "pending" && <button type="button" className="underline" onClick={() => recover(true)}>Retry confirmation</button>}
      {(entry.state === "confirmed" || entry.state === "rejected") && <button type="button" className="underline ml-2" onClick={() => { displays = displays.filter((item) => item !== entry); notify(); }}>Dismiss</button>}
    </div>)}
  </section>;
}
