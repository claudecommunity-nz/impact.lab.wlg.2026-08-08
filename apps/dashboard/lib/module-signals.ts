import type { SignalRow } from "@wcc-impact/shared";

export type ModuleReportState = "loading" | "ready" | "empty" | "unavailable";

export function resolveModuleReportState({
  rowCount,
  total,
  historyLoading,
  historyError,
  realtimeLoading,
  aggregateLoading,
  aggregateError,
}: {
  rowCount: number;
  total: number | null;
  historyLoading: boolean;
  historyError: string | null;
  realtimeLoading: boolean;
  aggregateLoading: boolean;
  aggregateError: string | null;
}): ModuleReportState {
  if (rowCount > 0) return "ready";
  if (
    historyLoading ||
    (historyError && realtimeLoading) ||
    (total == null && aggregateLoading)
  ) {
    return "loading";
  }
  if (historyError || aggregateError || (total != null && total > 0)) {
    return "unavailable";
  }
  return "empty";
}

/**
 * Build a bounded module-specific window from paginated history plus the live
 * store. Realtime rows win on id collisions so recent verification edits are
 * not replaced by an older history snapshot.
 */
export function mergeRecentModuleSignals(
  moduleId: string,
  historical: readonly SignalRow[],
  realtime: readonly SignalRow[],
  limit = 100,
): SignalRow[] {
  const byId = new Map<string, SignalRow>();
  for (const signal of historical) {
    if (signal.module_id === moduleId) byId.set(signal.id, signal);
  }
  for (const signal of realtime) {
    if (signal.module_id === moduleId) byId.set(signal.id, signal);
  }
  return [...byId.values()]
    .sort((a, b) => {
      const created = b.created_at.localeCompare(a.created_at);
      return created || b.id.localeCompare(a.id);
    })
    .slice(0, Math.max(0, limit));
}
