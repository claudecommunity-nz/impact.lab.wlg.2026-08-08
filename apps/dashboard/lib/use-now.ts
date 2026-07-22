import { useEffect, useState } from "react";

/**
 * Ticking clock — re-renders the consumer every `intervalMs` so "3m ago" labels
 * and staleness colours stay current without a realtime event arriving.
 *
 * @example const now = useNow(); // Date.now(), refreshed every 30s
 */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
