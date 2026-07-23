"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SignalCursor, SignalPage, SignalRow } from "@wcc-impact/shared";
import { getSupabase } from "./client";

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

export interface SignalHistoryFilter {
  moduleId?: string;
  signalType?: string;
}

export interface FetchSignalPageOptions extends SignalHistoryFilter {
  limit?: number;
  before?: SignalCursor | null;
}

function pageSize(value: number | undefined): number {
  if (value === undefined) return DEFAULT_PAGE_SIZE;
  if (!Number.isInteger(value) || value < 1 || value > MAX_PAGE_SIZE) {
    throw new Error(`signal history limit must be an integer from 1 to ${MAX_PAGE_SIZE}`);
  }
  return value;
}

/** Adapt a limit+1 RPC result into a stable page and cursor. */
export function normalizeSignalPage(
  value: unknown,
  requestedLimit: number,
  fetchedAt = new Date().toISOString(),
): SignalPage {
  const rows = Array.isArray(value) ? (value as SignalRow[]) : [];
  const hasMore = rows.length > requestedLimit;
  const signals = rows.slice(0, requestedLimit);
  const last = signals.at(-1);
  return {
    signals,
    hasMore,
    nextCursor:
      hasMore && last ? { createdAt: last.created_at, id: last.id } : null,
    fetchedAt,
  };
}

/** Public historical read: no new realtime channel, stable keyset pagination. */
export async function fetchSignalPage(
  options: FetchSignalPageOptions = {},
  client: SupabaseClient = getSupabase(),
): Promise<SignalPage> {
  const limit = pageSize(options.limit);
  const { data, error } = await client.rpc("signal_history_page", {
    p_limit: limit + 1,
    p_before_created_at: options.before?.createdAt ?? null,
    p_before_id: options.before?.id ?? null,
    p_module_id: options.moduleId ?? null,
    p_signal_type: options.signalType ?? null,
  });
  if (error) throw new Error(`Signal history failed: ${error.message}`);
  return normalizeSignalPage(data, limit);
}

export interface SignalHistoryState {
  signals: SignalRow[];
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  stale: boolean;
  fetchedAt: string | null;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
}

/**
 * Paginated historical rows. Existing pages remain visible if refresh/load-more
 * fails, with ``stale`` + ``error`` describing the last-known state.
 */
export function useSignalHistory(
  filter: SignalHistoryFilter = {},
  limit = DEFAULT_PAGE_SIZE,
): SignalHistoryState {
  const stableLimit = pageSize(limit);
  const { moduleId, signalType } = filter;
  const filterKey = useMemo(
    () => `${moduleId ?? ""}\u0000${signalType ?? ""}\u0000${stableLimit}`,
    [moduleId, signalType, stableLimit],
  );
  const [signals, setSignals] = useState<SignalRow[]>([]);
  const [cursor, setCursor] = useState<SignalCursor | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const signalsRef = useRef<SignalRow[]>([]);

  useEffect(() => {
    signalsRef.current = signals;
  }, [signals]);

  const query = useCallback(
    (before: SignalCursor | null) =>
      fetchSignalPage({
        moduleId,
        signalType,
        limit: stableLimit,
        before,
      }),
    [moduleId, signalType, stableLimit],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const page = await query(null);
      setSignals(page.signals);
      setCursor(page.nextCursor);
      setHasMore(page.hasMore);
      setFetchedAt(page.fetchedAt);
      setStale(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Signal history failed");
      setStale(signalsRef.current.length > 0);
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    signalsRef.current = [];
    setSignals([]);
    setCursor(null);
    setHasMore(false);
    setStale(false);
    void refresh();
  }, [filterKey, refresh]);

  const loadMore = useCallback(async () => {
    if (!hasMore || !cursor || loadingMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const page = await query(cursor);
      setSignals((current) => {
        const ids = new Set(current.map((signal) => signal.id));
        return [...current, ...page.signals.filter((signal) => !ids.has(signal.id))];
      });
      setCursor(page.nextCursor);
      setHasMore(page.hasMore);
      setFetchedAt(page.fetchedAt);
      setStale(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Signal history failed");
      setStale(true);
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, hasMore, loadingMore, query]);

  return {
    signals,
    loading,
    loadingMore,
    error,
    hasMore,
    stale,
    fetchedAt,
    loadMore,
    refresh,
  };
}
