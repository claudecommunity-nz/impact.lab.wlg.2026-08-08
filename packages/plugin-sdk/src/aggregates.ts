"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Severity,
  SignalAggregates,
  SourceType,
  Verification,
} from "@wcc-impact/shared";
import { getSupabase } from "./client";

type UnknownRecord = Record<string, unknown>;

export interface AggregateState {
  data: SignalAggregates | null;
  loading: boolean;
  stale: boolean;
  error: string | null;
}

export type AggregateAction =
  | { type: "invalidate" }
  | { type: "loading" }
  | { type: "success"; data: SignalAggregates }
  | { type: "error"; error: string };

export const initialAggregateState: AggregateState = {
  data: null,
  loading: true,
  stale: false,
  error: null,
};

/** State semantics: invalidation/errors retain the last authoritative snapshot. */
export function aggregateStateReducer(
  state: AggregateState,
  action: AggregateAction,
): AggregateState {
  switch (action.type) {
    case "invalidate":
      return { ...state, stale: state.data !== null };
    case "loading":
      return { ...state, loading: state.data === null, error: null };
    case "success":
      return { data: action.data, loading: false, stale: false, error: null };
    case "error":
      return {
        ...state,
        loading: false,
        stale: state.data !== null,
        error: action.error,
      };
  }
}

function record(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function count(value: unknown): number {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.trunc(number) : 0;
}

function string(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function countMap<T extends string>(value: unknown, keys: readonly T[]): Record<T, number> {
  const source = record(value);
  return Object.fromEntries(keys.map((key) => [key, count(source[key])])) as Record<
    T,
    number
  >;
}

const SEVERITIES = ["minor", "moderate", "severe", "extreme", "unknown"] as const;
const SOURCES = ["official", "community", "media", "sensor"] as const;
const VERIFICATIONS = [
  "unverified",
  "corroborated",
  "verified",
  "false_report",
] as const;

/** Defensive adapter for the public signal_aggregates() JSON RPC. */
export function normalizeSignalAggregates(value: unknown): SignalAggregates {
  const input = record(value);
  const byModule = Object.fromEntries(
    Object.entries(record(input.by_module))
      .map<[string, number]>(([moduleId, value]) => [moduleId, count(value)])
      .sort(([a], [b]) => a.localeCompare(b)),
  );
  const moduleSignalTypes = Array.isArray(input.module_signal_types)
    ? input.module_signal_types
        .map((value) => record(value))
        .map((row) => ({
          moduleId: string(row.module_id),
          signalType: string(row.signal_type),
          count: count(row.count),
        }))
        .filter((row) => row.moduleId && row.signalType)
    : [];

  return {
    generatedAt: string(input.generated_at) || new Date().toISOString(),
    newestCreatedAt: nullableString(input.newest_created_at),
    total: count(input.total),
    active60m: count(input.active_60m),
    new15m: count(input.new_15m),
    previous15m: count(input.previous_15m),
    officialActive60m: count(input.official_active_60m),
    distinctPlaces: count(input.distinct_places),
    bySeverity: countMap<Severity>(input.by_severity, SEVERITIES),
    bySource: countMap<SourceType>(input.by_source, SOURCES),
    byVerification: countMap<Verification>(
      input.by_verification,
      VERIFICATIONS,
    ),
    byModule,
    moduleSignalTypes,
  };
}

export async function querySignalAggregates(
  client: SupabaseClient = getSupabase(),
): Promise<SignalAggregates> {
  const { data, error } = await client.rpc("signal_aggregates");
  if (error) throw new Error(`Authoritative signal counts failed: ${error.message}`);
  return normalizeSignalAggregates(data);
}
