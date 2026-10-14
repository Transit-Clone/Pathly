/** One backend call as the admin's Recent requests list shows it. */
export type RequestLogEntry = {
  id: number;
  name: string;
  startedAt: number;
  ms: number;
  ok: boolean;
  code?: string;
  request: unknown;
  /** A small summary, never the raw response (Google content isn't kept). */
  responseSummary?: unknown;
};

const MAX_ENTRIES = 20;
let enabled = false;
let nextId = 1;
let entries: RequestLogEntry[] = [];
const listeners = new Set<() => void>();

/** Turned on only while an admin is signed in (DebugProvider); nothing is kept otherwise. */
export function setRequestLogEnabled(value: boolean): void {
  enabled = value;
  if (!value) clearRequestLog();
}

export function isRequestLogEnabled(): boolean {
  return enabled;
}

export function recordRequest(entry: Omit<RequestLogEntry, 'id'>): void {
  if (!enabled) return;
  entries = [{ ...entry, id: nextId++ }, ...entries].slice(0, MAX_ENTRIES);
  listeners.forEach((listener) => listener());
}

export function getRequestLog(): readonly RequestLogEntry[] {
  return entries;
}

export function clearRequestLog(): void {
  entries = [];
  listeners.forEach((listener) => listener());
}

export function subscribeRequestLog(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
