"use client";

import { useContext, useMemo } from "react";
import type { ModuleRow, SignalRow } from "@wcc-impact/shared";
import { SignalContext, requireStore } from "./context";

/** Client-side filter over the shared signal store. `since` is an ISO timestamp
 *  compared against `created_at`. All fields optional; omit for everything. */
export interface SignalFilter {
  moduleId?: string;
  signalType?: string;
  since?: string;
}

/** Pure filter — shared by useSignals, SignalMap and SignalFeed. */
export function applyFilter(signals: SignalRow[], filter?: SignalFilter): SignalRow[] {
  if (!filter || (!filter.moduleId && !filter.signalType && !filter.since)) return signals;
  // Compare timestamps as epoch ms, not raw ISO strings — a +12:00 offset sorts
  // lexicographically wrong against PostgREST's +00:00. An unparseable/absent
  // `since` yields NaN and becomes a no-op rather than silently dropping rows.
  const sinceMs = filter.since ? Date.parse(filter.since) : NaN;
  return signals.filter(
    (s) =>
      (!filter.moduleId || s.module_id === filter.moduleId) &&
      (!filter.signalType || s.signal_type === filter.signalType) &&
      (Number.isNaN(sinceMs) || Date.parse(s.created_at) >= sinceMs),
  );
}

/**
 * THE signal store. One shared realtime subscription lives in the core
 * provider (SignalProvider); this hook consumes from context with client-side
 * filtering. Modules NEVER open their own Supabase channels.
 *
 * @example
 * const { signals, loading } = useSignals({ moduleId: "team-x" });
 * const floods = useSignals({ signalType: "flooding", since: "2026-08-08T00:00:00Z" });
 */
export function useSignals(filter?: SignalFilter): {
  signals: SignalRow[]; // newest first
  loading: boolean;
  error: string | null;
} {
  const store = requireStore(useContext(SignalContext), "useSignals()");
  const { moduleId, signalType, since } = filter ?? {};
  const signals = useMemo(
    () => applyFilter(store.signals, { moduleId, signalType, since }),
    [store.signals, moduleId, signalType, since],
  );
  return { signals, loading: store.loading, error: store.error };
}

/**
 * The runtime module registry (`modules` table) from the same single
 * subscription — tiles, health strip, enabled flags. Core dashboard use;
 * modules rarely need it.
 *
 * @example
 * const { modules } = useModules();
 * const live = modules.filter((m) => m.enabled);
 */
export function useModules(): { modules: ModuleRow[]; loading: boolean } {
  const store = requireStore(useContext(SignalContext), "useModules()");
  return { modules: store.modules, loading: store.modulesLoading };
}
