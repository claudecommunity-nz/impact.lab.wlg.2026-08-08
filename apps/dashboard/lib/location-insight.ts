"use client";

import { useCallback, useEffect, useState } from "react";
import { signalSchema, type Severity, type SignalRow } from "@wcc-impact/shared";
import { getSupabase } from "./supabase";

type UnknownRecord = Record<string, unknown>;

const SEVERITY_RANK: Record<Severity, number> = {
  unknown: 0,
  minor: 1,
  moderate: 2,
  severe: 3,
  extreme: 4,
};

const COARSE_PRECISIONS = new Set(["suburb", "region", "unknown"]);

export interface NearbySignal {
  signal: SignalRow;
  eventAt: string;
  distanceM: number;
  locationPrecision: string | null;
  accuracyM: number | null;
}

export interface SignalTypeCount {
  signalType: string;
  count: number;
}

export interface NearbySignalResponse {
  signals: NearbySignal[];
  rejectedRowCount: number;
  resultsTruncated: boolean;
}

export interface LocationInsightSummary {
  activeCount: number;
  dismissedCount: number;
  highestSeverity: Severity;
  seriousCount: number;
  moduleCount: number;
  sourceTypeCount: number;
  verifiedOrOfficialCount: number;
  coarseLocationCount: number;
  typeCounts: SignalTypeCount[];
  topReports: NearbySignal[];
}

export interface LocationInsightState {
  signals: NearbySignal[];
  summary: LocationInsightSummary;
  rejectedRowCount: number;
  resultsTruncated: boolean;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

const EMPTY_SUMMARY: LocationInsightSummary = {
  activeCount: 0,
  dismissedCount: 0,
  highestSeverity: "unknown",
  seriousCount: 0,
  moduleCount: 0,
  sourceTypeCount: 0,
  verifiedOrOfficialCount: 0,
  coarseLocationCount: 0,
  typeCounts: [],
  topReports: [],
};

function record(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeNearbySignal(value: unknown): NearbySignal | null {
  const input = record(value);
  const parsed = signalSchema.safeParse(input);
  const distanceM = nullableNumber(input.distance_m);
  if (
    !parsed.success ||
    typeof parsed.data.id !== "string" ||
    typeof parsed.data.created_at !== "string" ||
    typeof parsed.data.lat !== "number" ||
    typeof parsed.data.lng !== "number" ||
    distanceM === null ||
    distanceM < 0
  ) {
    return null;
  }

  const accuracyM = nullableNumber(input.accuracy_m);
  return {
    signal: parsed.data as SignalRow,
    eventAt:
      typeof input.event_at === "string" && input.event_at
        ? input.event_at
        : parsed.data.created_at,
    distanceM,
    locationPrecision:
      typeof input.location_precision === "string" && input.location_precision
        ? input.location_precision
        : null,
    accuracyM: accuracyM !== null && accuracyM >= 0 ? accuracyM : null,
  };
}

export function normalizeNearbySignalResponse(value: unknown): NearbySignalResponse {
  if (value !== null && !Array.isArray(value)) {
    throw new Error("Nearby evidence returned in an unsupported format.");
  }
  const rawRows = Array.isArray(value) ? value : [];
  const signals = rawRows
    .map(normalizeNearbySignal)
    .filter((row): row is NearbySignal => row !== null);
  const rejectedRowCount = rawRows.length - signals.length;
  if (rawRows.length > 0 && signals.length === 0) {
    throw new Error(
      "Nearby evidence could not be interpreted. Results are hidden rather than showing an empty area.",
    );
  }
  return {
    signals,
    rejectedRowCount,
    resultsTruncated: rawRows.length >= 40,
  };
}

export function summarizeNearbySignals(rows: NearbySignal[]): LocationInsightSummary {
  const dismissedCount = rows.filter(
    ({ signal }) => signal.verification === "false_report",
  ).length;
  const active = rows.filter(
    ({ signal }) => signal.verification !== "false_report",
  );
  const typeCounts = new Map<string, number>();

  let highestSeverity: Severity = "unknown";
  let seriousCount = 0;
  let verifiedOrOfficialCount = 0;
  let coarseLocationCount = 0;

  for (const row of active) {
    const { signal } = row;
    if (SEVERITY_RANK[signal.severity] > SEVERITY_RANK[highestSeverity]) {
      highestSeverity = signal.severity;
    }
    if (signal.severity === "severe" || signal.severity === "extreme") {
      seriousCount += 1;
    }
    if (
      signal.source_type === "official" ||
      signal.verification === "verified" ||
      signal.verification === "corroborated"
    ) {
      verifiedOrOfficialCount += 1;
    }
    if (
      !row.locationPrecision ||
      COARSE_PRECISIONS.has(row.locationPrecision)
    ) {
      coarseLocationCount += 1;
    }
    typeCounts.set(signal.signal_type, (typeCounts.get(signal.signal_type) ?? 0) + 1);
  }

  const topReports = [...active]
    .sort(
      (left, right) =>
        SEVERITY_RANK[right.signal.severity] -
          SEVERITY_RANK[left.signal.severity] ||
        left.distanceM - right.distanceM ||
        Date.parse(right.eventAt) - Date.parse(left.eventAt),
    )
    .slice(0, 3);

  return {
    activeCount: active.length,
    dismissedCount,
    highestSeverity,
    seriousCount,
    moduleCount: new Set(active.map(({ signal }) => signal.module_id)).size,
    sourceTypeCount: new Set(active.map(({ signal }) => signal.source_type)).size,
    verifiedOrOfficialCount,
    coarseLocationCount,
    typeCounts: [...typeCounts.entries()]
      .map(([signalType, count]) => ({ signalType, count }))
      .sort(
        (left, right) =>
          right.count - left.count ||
          left.signalType.localeCompare(right.signalType),
      ),
    topReports,
  };
}

export function useLocationInsight({
  selection,
  radiusM,
  signalRevision,
}: {
  selection: { lat: number; lng: number } | null;
  radiusM: number;
  signalRevision: string | null;
}): LocationInsightState {
  const [signals, setSignals] = useState<NearbySignal[]>([]);
  const [rejectedRowCount, setRejectedRowCount] = useState(0);
  const [resultsTruncated, setResultsTruncated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshRevision, setRefreshRevision] = useState(0);
  const refresh = useCallback(() => setRefreshRevision((value) => value + 1), []);

  useEffect(() => {
    if (!selection) {
      setSignals([]);
      setRejectedRowCount(0);
      setResultsTruncated(false);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setRejectedRowCount(0);
    setResultsTruncated(false);

    void (async () => {
      try {
        const { data, error: rpcError } = await getSupabase().rpc("signals_nearby", {
          p_lat: selection.lat,
          p_lng: selection.lng,
          p_radius_m: radiusM,
          p_since: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
          p_limit: 40,
        });
        if (cancelled) return;
        if (rpcError) throw rpcError;
        const normalized = normalizeNearbySignalResponse(data);
        setSignals(normalized.signals);
        setRejectedRowCount(normalized.rejectedRowCount);
        setResultsTruncated(normalized.resultsTruncated);
      } catch (caught: unknown) {
        if (cancelled) return;
        const caughtRecord = record(caught);
        setSignals([]);
        setRejectedRowCount(0);
        setResultsTruncated(false);
        setError(
          caught instanceof Error
            ? caught.message
            : typeof caughtRecord.message === "string"
              ? caughtRecord.message
              : String(caught),
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    selection?.lat,
    selection?.lng,
    radiusM,
    signalRevision,
    refreshRevision,
  ]);

  return {
    signals,
    summary: signals.length > 0 ? summarizeNearbySignals(signals) : EMPTY_SUMMARY,
    rejectedRowCount,
    resultsTruncated,
    loading,
    error,
    refresh,
  };
}
