"use client";

import { useEffect, useMemo, useState, type ReactElement, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import type { ModuleRow, SignalRow } from "@wcc-impact/shared";
import { getSupabase } from "./client";
import { SignalContext, type SignalStore } from "./context";

// In-memory cap: the dashboard shows the day's story, not history. Realtime
// inserts prepend and the list is trimmed to this length.
const SIGNAL_LIMIT = 500;

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
export function SignalProvider({ children }: { children: ReactNode }): ReactElement {
  const [signals, setSignals] = useState<SignalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modules, setModules] = useState<ModuleRow[]>([]);
  const [modulesLoading, setModulesLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [userLoading, setUserLoading] = useState(true);

  // The ONE realtime channel + the snapshot fetches it drives.
  useEffect(() => {
    const supabase = getSupabase();
    let cancelled = false;

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
        // Merge under anything realtime already delivered (dedupe by id), then
        // re-sort newest-first so a reconnect's backfill (the newest rows) isn't
        // concatenated below a full list and dropped by the cap.
        setSignals((prev) => {
          const seen = new Set(prev.map((s) => s.id));
          const rows = (sig.data as SignalRow[]).filter((s) => !seen.has(s.id));
          return [...prev, ...rows]
            .sort((a, b) => b.created_at.localeCompare(a.created_at))
            .slice(0, SIGNAL_LIMIT);
        });
      }
      setLoading(false);

      if (!mod.error && mod.data)
        // Merge under anything realtime already delivered (dedupe by id).
        setModules((prev) => {
          const seen = new Set(prev.map((m) => m.id));
          const rows = (mod.data as ModuleRow[]).filter((m) => !seen.has(m.id));
          return [...prev, ...rows].sort((a, b) => a.id.localeCompare(b.id));
        });
      setModulesLoading(false);
    };

    const channel = supabase
      .channel("core-feed") // the only channel in the entire app
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "signals" },
        (payload) => {
          const row = payload.new as SignalRow;
          setSignals((prev) =>
            prev.some((s) => s.id === row.id) ? prev : [row, ...prev].slice(0, SIGNAL_LIMIT),
          );
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "signals" },
        (payload) => {
          const row = payload.new as SignalRow;
          setSignals((prev) => prev.map((s) => (s.id === row.id ? row : s)));
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "signals" },
        (payload) => {
          const id = (payload.old as { id?: string }).id;
          if (id) setSignals((prev) => prev.filter((s) => s.id !== id));
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "modules" },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const id = (payload.old as { id?: string }).id;
            if (id) setModules((prev) => prev.filter((m) => m.id !== id));
          } else {
            const row = payload.new as ModuleRow;
            setModules((prev) => upsertById(prev, row).sort((a, b) => a.id.localeCompare(b.id)));
          }
        },
      )
      .subscribe((status) => {
        // (Re)snapshot on every successful (re)join to backfill anything missed
        // while offline. A terminal socket failure only logs — the initial
        // snapshot below already populated the store, so the dashboard keeps
        // showing the last-known picture rather than blanking to an error.
        if (status === "SUBSCRIBED") void resync();
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
  }, []);

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
    () => ({ signals: visibleSignals, loading, error, modules, modulesLoading, user, userLoading }),
    [visibleSignals, loading, error, modules, modulesLoading, user, userLoading],
  );

  return <SignalContext.Provider value={store}>{children}</SignalContext.Provider>;
}
