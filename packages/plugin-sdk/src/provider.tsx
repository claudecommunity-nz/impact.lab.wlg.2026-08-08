"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import type { User } from "@supabase/supabase-js";
import type { ModuleRow, SignalRow } from "@wcc-impact/shared";
import { getSupabase } from "./client";
import { SignalContext, type ModuleTableRow, type SignalStore } from "./context";
import {
  aggregateStateReducer,
  initialAggregateState,
  querySignalAggregates,
} from "./aggregates";
import {
  initialModuleTableState,
  moduleTableStateReducer,
  type ModuleTableAction,
} from "./module-table-state";

// In-memory cap: the dashboard shows the day's story, not history. Realtime
// inserts prepend and the list is trimmed to this length.
const SIGNAL_LIMIT = 500;
// Per module-owned table cap (same reasoning; module tables are usually small).
const MODULE_TABLE_LIMIT = 1000;

function upsertById<T extends { id: string }>(list: T[], row: T): T[] {
  const i = list.findIndex((x) => x.id === row.id);
  if (i === -1) return [row, ...list];
  const next = list.slice();
  next[i] = row;
  return next;
}

/**
 * THE core provider. Mounted ONCE by the dashboard shell (apps/dashboard
 * layout), it owns the single Supabase realtime channel for the whole app —
 * `signals` + `modules` Postgres Changes — plus the initial fetches and the
 * Supabase Auth state. Everything else (useSignals, useModules, useUser,
 * SignalMap, SignalFeed) consumes this context; nothing else may open a
 * channel (CONTRACTS.md §4, PLAN §7.3).
 *
 * @example
 * // apps/dashboard/app/layout.tsx (inside a client wrapper)
 * <SignalProvider>{children}</SignalProvider>
 */
export function SignalProvider({
  children,
  moduleTables = [],
}: {
  children: ReactNode;
  /**
   * Full names of module-owned tables to also watch on the ONE channel, e.g.
   * ["m_demo_seed_pins"]. The dashboard passes these from the generated registry
   * (manifest `tables` -> moduleTableName). Consumed via useModuleTable(); no
   * module ever opens its own channel.
   */
  moduleTables?: string[];
}): ReactElement {
  const [signals, setSignals] = useState<SignalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aggregateState, dispatchAggregate] = useReducer(
    aggregateStateReducer,
    initialAggregateState,
  );
  const [aggregateRevision, setAggregateRevision] = useState(0);
  const [modules, setModules] = useState<ModuleRow[]>([]);
  const moduleEnabledRef = useRef(new Map<string, boolean>());
  const [modulesLoading, setModulesLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [userLoading, setUserLoading] = useState(true);
  const [operationalRevision, invalidateOperations] = useReducer(
    (revision: number) => revision + 1,
    0,
  );
  // Module-owned tables: full-table-name -> rows (each row has an `id`).
  const [tableData, setTableData] = useState<Record<string, ModuleTableRow[]>>({});
  const [tableStates, setTableStates] = useState<
    Record<string, typeof initialModuleTableState>
  >({});

  // Stable key so the effect re-subscribes only if the actual table set changes,
  // not on every render (the dashboard passes a module-scoped constant anyway).
  const tablesKey = useMemo(() => [...moduleTables].sort().join(","), [moduleTables]);
  const userId = user?.id ?? null;
  const refreshAggregates = useCallback(
    () => setAggregateRevision((revision) => revision + 1),
    [],
  );

  // Exact counts are one database RPC, cached as last-known data. Realtime
  // changes below only invalidate this state; a short debounce collapses burst
  // inserts (e.g. scenario seeding) into one aggregate refresh.
  useEffect(() => {
    let cancelled = false;
    dispatchAggregate({ type: "invalidate" });
    const timer = window.setTimeout(
      () => {
        dispatchAggregate({ type: "loading" });
        void querySignalAggregates()
          .then((data) => {
            if (!cancelled) dispatchAggregate({ type: "success", data });
          })
          .catch((reason) => {
            if (!cancelled) {
              dispatchAggregate({
                type: "error",
                error:
                  reason instanceof Error
                    ? reason.message
                    : "Authoritative signal counts failed",
              });
            }
          });
      },
      aggregateRevision === 0 ? 0 : 750,
    );
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [aggregateRevision]);

  // The ONE realtime channel + the snapshot fetches it drives.
  useEffect(() => {
    const supabase = getSupabase();
    let cancelled = false;
    const tables = tablesKey ? tablesKey.split(",") : [];

    function updateTableState(table: string, action: ModuleTableAction) {
      setTableStates((previous) => ({
        ...previous,
        [table]: moduleTableStateReducer(
          previous[table] ?? initialModuleTableState,
          action,
        ),
      }));
    }

    function applyChange(table: string, payload: { eventType: string; new: unknown; old: unknown }) {
      setTableData((prev) => {
        const list = prev[table] ?? [];
        if (payload.eventType === "DELETE") {
          const id = (payload.old as { id?: string }).id;
          return id ? { ...prev, [table]: list.filter((r) => r.id !== id) } : prev;
        }
        const row = payload.new as ModuleTableRow;
        const i = list.findIndex((r) => r.id === row.id);
        const next = i === -1 ? [row, ...list] : list.map((r) => (r.id === row.id ? row : r));
        return { ...prev, [table]: next.slice(0, MODULE_TABLE_LIMIT) };
      });
    }

    // Snapshot both tables and merge/dedup by id into the store. Called
    // immediately on mount (so the dashboard shows data even if realtime is slow
    // or down — venue wifi), AND on every SUBSCRIBED below (initial join + every
    // rejoin after a drop). The channel's .on() handlers are registered before
    // this first snapshot resolves, so a row committed in the gap arrives as a
    // live INSERT (deduped by id); the SUBSCRIBED refetch backfills the rest.
    const resync = async () => {
      const [sig, mod] = await Promise.all([
        supabase
          .from("signals")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(SIGNAL_LIMIT),
        supabase.from("modules").select("*").order("id"),
      ]);
      if (cancelled) return;

      if (sig.error) setError(sig.error.message);
      else {
        setError(null);
        // Merge with anything realtime already delivered. Fetched rows WIN on
        // id collision — a reconnect must also repair UPDATEs (triage edits)
        // missed while offline, not just backfill missed INSERTs. Then re-sort
        // newest-first so the backfill isn't dropped by the cap.
        setSignals((prev) => {
          const fetched = new Map((sig.data as SignalRow[]).map((s) => [s.id, s]));
          const keptLocal = prev.filter((s) => !fetched.has(s.id));
          return [...fetched.values(), ...keptLocal]
            .sort((a, b) => b.created_at.localeCompare(a.created_at))
            .slice(0, SIGNAL_LIMIT);
        });
      }
      setLoading(false);

      if (!mod.error && mod.data) {
        const fetchedModules = mod.data as ModuleRow[];
        moduleEnabledRef.current = new Map(
          fetchedModules.map((module) => [module.id, module.enabled]),
        );
        // Same fetched-rows-win merge: a modules UPDATE (kill-switch flip,
        // heartbeat) missed while offline must be repaired on reconnect.
        setModules((prev) => {
          const fetched = new Map(fetchedModules.map((m) => [m.id, m]));
          const keptLocal = prev.filter((m) => !fetched.has(m.id));
          return [...fetched.values(), ...keptLocal].sort((a, b) => a.id.localeCompare(b.id));
        });
      }
      setModulesLoading(false);
      // A reconnect can hide changes that occurred while the socket was down.
      // Refresh once after the repaired snapshots rather than per fetched row.
      refreshAggregates();

      // Snapshot each module-owned table (realtime keeps them fresh after).
      // Order by created_at desc so a growing table (e.g. a news feed) surfaces
      // its NEWEST rows within the cap; fall back to unordered for tables that
      // don't have a created_at column.
      await Promise.all(
        tables.map(async (t) => {
          updateTableState(t, { type: "loading" });
          let res = await supabase
            .from(t)
            .select("*")
            .order("created_at", { ascending: false })
            .limit(MODULE_TABLE_LIMIT);
          if (res.error) res = await supabase.from(t).select("*").limit(MODULE_TABLE_LIMIT);
          if (cancelled) return;
          if (res.error || !res.data) {
            updateTableState(t, {
              type: "error",
              error: res.error?.message ?? `Unable to load ${t}`,
            });
            return;
          }
          // Fetched rows win on id collision (repairs UPDATEs missed offline);
          // realtime-only rows the snapshot didn't cover are kept.
          setTableData((prev) => {
            const fetched = new Map((res.data as ModuleTableRow[]).map((r) => [r.id, r]));
            const keptLocal = (prev[t] ?? []).filter((r) => !fetched.has(r.id));
            return { ...prev, [t]: [...fetched.values(), ...keptLocal].slice(0, MODULE_TABLE_LIMIT) };
          });
          updateTableState(t, { type: "success" });
        }),
      );
    };

    let channel = supabase
      .channel("core-feed") // the only channel in the entire app
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "signals" },
        (payload) => {
          const row = payload.new as SignalRow;
          setSignals((prev) =>
            prev.some((s) => s.id === row.id) ? prev : [row, ...prev].slice(0, SIGNAL_LIMIT),
          );
          refreshAggregates();
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "signals" },
        (payload) => {
          const row = payload.new as SignalRow;
          setSignals((prev) => prev.map((s) => (s.id === row.id ? row : s)));
          refreshAggregates();
          invalidateOperations();
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "signals" },
        (payload) => {
          const id = (payload.old as { id?: string }).id;
          if (id) setSignals((prev) => prev.filter((s) => s.id !== id));
          refreshAggregates();
          invalidateOperations();
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "modules" },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const id = (payload.old as { id?: string }).id;
            if (id) setModules((prev) => prev.filter((m) => m.id !== id));
            if (id) moduleEnabledRef.current.delete(id);
            refreshAggregates();
          } else {
            const row = payload.new as ModuleRow;
            const previousEnabled = moduleEnabledRef.current.get(row.id);
            moduleEnabledRef.current.set(row.id, row.enabled);
            setModules((prev) => upsertById(prev, row).sort((a, b) => a.id.localeCompare(b.id)));
            if (
              payload.eventType === "INSERT" ||
              previousEnabled === undefined ||
              previousEnabled !== row.enabled
            ) {
              refreshAggregates();
            }
          }
        },
      );

    // Incident tables are private to authenticated response members. Register
    // their invalidation listeners on this same channel only after sign-in;
    // RLS decides whether the current user receives each event.
    if (userId) {
      channel = channel
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "incidents" },
          () => invalidateOperations(),
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "incident_evidence" },
          () => invalidateOperations(),
        );
    }

    // Per module-owned table: one listener each, on the SAME channel, registered
    // BEFORE subscribe (Supabase binds postgres_changes filters at subscribe
    // time). This is how a module gets realtime for its own table without ever
    // opening a second channel.
    for (const t of tables) {
      channel = channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table: t },
        (payload) => applyChange(t, payload),
      );
    }

    channel = channel.subscribe((status) => {
      // (Re)snapshot on every successful (re)join to backfill anything missed
      // while offline. A terminal socket failure only logs — the initial
      // snapshot below already populated the store, so the dashboard keeps
      // showing the last-known picture rather than blanking to an error.
      if (status === "SUBSCRIBED") {
        void resync();
        if (userId) invalidateOperations();
      }
      else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        if (!cancelled) console.warn("[hack] realtime channel:", status);
      }
    });

    // Load the initial snapshot straight away — do NOT wait for the websocket.
    void resync();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [refreshAggregates, tablesKey, userId]);

  // Auth state (not a realtime channel — a local listener on the auth session).
  useEffect(() => {
    const supabase = getSupabase();
    let cancelled = false;

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setUser(data.session?.user ?? null);
      setUserLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Kill-switch enforcement. The raw `signals` state stays intact (counts), but
  // the set consumers read via context drops any signal whose module is absent
  // or enabled=false — so a module flipped off in Studio disappears from the
  // home map, feed and every useSignals within one realtime tick (the modules
  // UPDATE handler above rebuilds this set).
  const enabledModuleIds = useMemo(
    () => new Set(modules.filter((m) => m.enabled).map((m) => m.id)),
    [modules],
  );
  const visibleSignals = useMemo(
    () => signals.filter((s) => enabledModuleIds.has(s.module_id)),
    [signals, enabledModuleIds],
  );

  const store: SignalStore = useMemo(
    () => ({
      signals: visibleSignals,
      loading,
      error,
      aggregates: aggregateState.data,
      aggregateLoading: aggregateState.loading,
      aggregateStale: aggregateState.stale,
      aggregateError: aggregateState.error,
      refreshAggregates,
      modules,
      modulesLoading,
      user,
      userLoading,
      operationalRevision,
      tableData,
      tableStates,
    }),
    [
      visibleSignals,
      loading,
      error,
      aggregateState,
      refreshAggregates,
      modules,
      modulesLoading,
      user,
      userLoading,
      operationalRevision,
      tableData,
      tableStates,
    ],
  );

  return <SignalContext.Provider value={store}>{children}</SignalContext.Provider>;
}
