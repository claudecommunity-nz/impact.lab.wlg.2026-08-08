"use client";

import { createContext } from "react";
import type { User } from "@supabase/supabase-js";
import type { ModuleRow, SignalAggregates, SignalRow } from "@wcc-impact/shared";
import type { ModuleTableState } from "./module-table-state";

/** A row from a module-owned table — arbitrary columns, but an `id` primary key
 *  is required (module tables must declare `id uuid primary key ...`) so realtime
 *  updates/deletes can be matched. */
export type ModuleTableRow = { id: string } & Record<string, unknown>;

/** Everything the ONE core realtime subscription fans out (PLAN §7.3). */
export interface SignalStore {
  /** Newest first, capped at the provider's in-memory limit. */
  signals: SignalRow[];
  loading: boolean;
  error: string | null;
  /** Exact DB summary, retained as last-known data while stale or retrying. */
  aggregates: SignalAggregates | null;
  aggregateLoading: boolean;
  aggregateStale: boolean;
  aggregateError: string | null;
  refreshAggregates: () => void;
  /** The runtime module registry (tiles, health strip, enabled flags). */
  modules: ModuleRow[];
  modulesLoading: boolean;
  /** Supabase Auth state, provided by the same core shell context. */
  user: User | null;
  userLoading: boolean;
  /** Module-owned tables, keyed by full table name (e.g. "m_demo_seed_pins").
   *  Populated only for tables declared in a manifest's `tables`. Read via
   *  useModuleTable(). */
  tableData: Record<string, ModuleTableRow[]>;
  /** Independent snapshot state for each module-owned table. Signals can load
   *  before these tables, so they cannot safely share one loading flag. */
  tableStates: Record<string, ModuleTableState>;
}

export const SignalContext = createContext<SignalStore | null>(null);

/** Readable failure when a hook is used outside the core shell. */
export function requireStore(store: SignalStore | null, hook: string): SignalStore {
  if (!store) {
    throw new Error(
      `@wcc-impact/plugin-sdk: ${hook} was called outside <SignalProvider>. ` +
        "The core dashboard shell mounts the provider — module pages rendered at " +
        "/modules/[id] always have it. Do not render SDK hooks outside the shell.",
    );
  }
  return store;
}
