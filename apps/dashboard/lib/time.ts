/** Heartbeat staleness thresholds for the health strip (PLAN §13.2). */
export const STALE_AMBER_MS = 2 * 60_000; // > 2 min since last_seen → amber
export const STALE_RED_MS = 10 * 60_000; // > 10 min since last_seen → red

export type Freshness = "ok" | "amber" | "red" | "never";

/**
 * Classify a module's loader heartbeat.
 *
 * @example freshness("2026-08-08T02:00:00Z") // "red" (long ago)
 */
export function freshness(lastSeen: string | null | undefined, now = Date.now()): Freshness {
  if (!lastSeen) return "never";
  const age = now - new Date(lastSeen).getTime();
  if (age > STALE_RED_MS) return "red";
  if (age > STALE_AMBER_MS) return "amber";
  return "ok";
}

/**
 * Compact "time ago" label for feed cards and the health strip.
 *
 * @example formatAgo(row.last_seen) // "3m ago" | "45s ago" | "2h ago" | "never"
 */
export function formatAgo(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "never";
  const seconds = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
