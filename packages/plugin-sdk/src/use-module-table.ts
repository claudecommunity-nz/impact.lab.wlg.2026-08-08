"use client";

import { useContext, useMemo } from "react";
import { moduleTableName } from "@wcc-impact/shared";
import { getSupabase } from "./client";
import { SignalContext, requireStore, type ModuleTableRow } from "./context";
import { initialModuleTableState } from "./module-table-state";

/**
 * Live rows from a module-owned table (public.m_<moduleId>_<table>), fed by the
 * ONE shared realtime channel — the same subscription behind useSignals(). The
 * table must be declared in the module manifest's `tables` (so the provider
 * subscribes to it) and created in modules/<id>/backend/schema.sql. Rows carry
 * whatever columns you defined; every row has an `id`.
 *
 * @example
 * // modules/team-x/ui/index.tsx
 * const { rows, loading } = useModuleTable<{ id: string; label: string }>("team-x", "pins");
 * return rows.map((p) => <li key={p.id}>{p.label}</li>);
 */
export function useModuleTable<T extends ModuleTableRow = ModuleTableRow>(
  moduleId: string,
  table: string,
): { rows: T[]; loading: boolean; stale: boolean; error: string | null } {
  const store = requireStore(useContext(SignalContext), "useModuleTable()");
  const name = moduleTableName(moduleId, table);
  const rows = useMemo(() => (store.tableData[name] ?? []) as T[], [store.tableData, name]);
  const state = store.tableStates[name] ?? initialModuleTableState;
  return { rows, ...state };
}

/**
 * The Supabase query builder for a module-owned table, for WRITES (insert /
 * update / delete). Reads should use useModuleTable(); writes go here. Writes are
 * RLS-gated by the authenticated user's organiser-assigned module claim.
 * Anonymous users and users assigned to another module remain read-only.
 *
 * @example
 * await moduleTable("team-x", "pins").insert({ label: "Cordon: Cuba St" });
 */
export function moduleTable(moduleId: string, table: string) {
  return getSupabase().from(moduleTableName(moduleId, table));
}
