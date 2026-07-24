"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Severity } from "@wcc-impact/shared";
import { getSupabase } from "./supabase";

type UnknownRecord = Record<string, unknown>;

export type PocketPrecisionStatus = "declared" | "mixed" | "undeclared";

export interface PocketExtent {
  type: "Polygon" | "MultiPolygon";
  coordinates: number[][][] | number[][][][];
}

export interface SeriousPocketTypeCount {
  signalType: string;
  count: number;
}

export interface SeriousPocket {
  key: string;
  label: string;
  lat: number;
  lng: number;
  reportCount: number;
  seriousCount: number;
  moderateCount: number;
  severeCount: number;
  extremeCount: number;
  unverifiedSeriousCount: number;
  verifiedOrCorroboratedSeriousCount: number;
  officialSeriousCount: number;
  reportedOriginCount: number;
  signalTypes: SeriousPocketTypeCount[];
  firstSeenAt: string;
  lastSeenAt: string;
  precisionStatus: PocketPrecisionStatus;
  coarseLocationCount: number;
  unknownPrecisionCount: number;
  maxAccuracyM: number | null;
  maxSeverity: Severity;
  extent: PocketExtent;
}

export interface SeriousPocketResponse {
  generatedAt: string;
  since: string;
  cellM: number;
  minPoints: number;
  candidateCount: number;
  candidateLimit: number;
  candidatesTruncated: boolean;
  qualifyingPocketCount: number;
  qualifyingReportCount: number;
  qualifyingSeriousCount: number;
  qualifyingUnverifiedSeriousCount: number;
  pocketLimit: number;
  pocketsTruncated: boolean;
  pockets: SeriousPocket[];
  rejectedPocketCount: number;
}

export interface SeriousPocketState extends SeriousPocketResponse {
  loading: boolean;
  stale: boolean;
  error: string | null;
  refresh: () => void;
}

const EMPTY_RESPONSE: SeriousPocketResponse = {
  generatedAt: "",
  since: "",
  cellM: 750,
  minPoints: 2,
  candidateCount: 0,
  candidateLimit: 5000,
  candidatesTruncated: false,
  qualifyingPocketCount: 0,
  qualifyingReportCount: 0,
  qualifyingSeriousCount: 0,
  qualifyingUnverifiedSeriousCount: 0,
  pocketLimit: 12,
  pocketsTruncated: false,
  pockets: [],
  rejectedPocketCount: 0,
};

function record(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function count(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : 0;
}

function isNonNegativeNumber(value: unknown): boolean {
  const parsed = typeof value === "number" ? value : Number(value);
  return value !== null && value !== "" && Number.isFinite(parsed) && parsed >= 0;
}

function coordinate(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function severity(value: unknown): Severity {
  return value === "extreme" || value === "severe" || value === "moderate"
    ? value
    : "unknown";
}

function precisionStatus(value: unknown): PocketPrecisionStatus {
  return value === "declared" || value === "mixed" ? value : "undeclared";
}

function normalizeExtent(value: unknown): PocketExtent | null {
  const input = record(value);
  if (
    (input.type !== "Polygon" && input.type !== "MultiPolygon") ||
    !Array.isArray(input.coordinates)
  ) {
    return null;
  }
  return input as unknown as PocketExtent;
}

function normalizeTypeCounts(value: unknown): SeriousPocketTypeCount[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const input = record(item);
      const signalType = text(input.signal_type);
      return signalType
        ? { signalType, count: count(input.count) }
        : null;
    })
    .filter((item): item is SeriousPocketTypeCount => item !== null);
}

export function normalizeSeriousPocket(value: unknown): SeriousPocket | null {
  const input = record(value);
  const key = text(input.key);
  const firstSeenAt = text(input.first_seen_at);
  const lastSeenAt = text(input.last_seen_at);
  const lat = coordinate(input.lat);
  const lng = coordinate(input.lng);
  const extent = normalizeExtent(input.extent);
  const reportCount = count(input.report_count);
  const moderateCount = count(input.moderate_count);
  const severeCount = count(input.severe_count);
  const extremeCount = count(input.extreme_count);
  const seriousCount = count(input.serious_count);
  const signalTypes = normalizeTypeCounts(input.signal_types);
  const unverifiedSeriousCount = count(input.unverified_serious_count);
  const verifiedOrCorroboratedSeriousCount = count(
    input.verified_or_corroborated_serious_count,
  );
  const officialSeriousCount = count(input.official_serious_count);

  if (
    !key ||
    !firstSeenAt ||
    !lastSeenAt ||
    lat === null ||
    lng === null ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180 ||
    extent === null ||
    seriousCount === 0 ||
    seriousCount !== severeCount + extremeCount ||
    reportCount !== moderateCount + severeCount + extremeCount ||
    signalTypes.reduce((total, item) => total + item.count, 0) !== reportCount ||
    unverifiedSeriousCount > seriousCount ||
    verifiedOrCorroboratedSeriousCount > seriousCount ||
    officialSeriousCount > seriousCount
  ) {
    return null;
  }

  return {
    key,
    label: text(input.label) || "Approximate report concentration",
    lat,
    lng,
    reportCount,
    seriousCount,
    moderateCount,
    severeCount,
    extremeCount,
    unverifiedSeriousCount,
    verifiedOrCorroboratedSeriousCount,
    officialSeriousCount,
    reportedOriginCount: count(input.reported_origin_count),
    signalTypes,
    firstSeenAt,
    lastSeenAt,
    precisionStatus: precisionStatus(input.precision_status),
    coarseLocationCount: count(input.coarse_location_count),
    unknownPrecisionCount: count(input.unknown_precision_count),
    maxAccuracyM: nullableNumber(input.max_accuracy_m),
    maxSeverity: severity(input.max_severity),
    extent,
  };
}

export function normalizeSeriousPocketResponse(
  value: unknown,
): SeriousPocketResponse {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Report concentrations returned in an unsupported format.");
  }

  const input = record(value);
  const generatedAt = text(input.generated_at);
  const since = text(input.since);
  if (!Array.isArray(input.pockets)) {
    throw new Error("Report concentration rows are missing.");
  }
  const rawPockets = input.pockets;
  const pockets = rawPockets
    .map(normalizeSeriousPocket)
    .filter((pocket): pocket is SeriousPocket => pocket !== null);
  const rejectedPocketCount = rawPockets.length - pockets.length;
  const requiredCounts = [
    input.cell_m,
    input.min_points,
    input.candidate_count,
    input.candidate_limit,
    input.qualifying_pocket_count,
    input.qualifying_report_count,
    input.qualifying_serious_count,
    input.qualifying_unverified_serious_count,
    input.pocket_limit,
  ];

  if (!generatedAt || !since) {
    throw new Error("Report concentration metadata is incomplete.");
  }
  if (
    !requiredCounts.every(isNonNegativeNumber) ||
    typeof input.candidates_truncated !== "boolean" ||
    typeof input.pockets_truncated !== "boolean"
  ) {
    throw new Error("Report concentration completeness metadata is incomplete.");
  }
  if (rawPockets.length > 0 && pockets.length === 0) {
    throw new Error(
      "Report concentrations could not be interpreted. Results are hidden rather than showing an empty region.",
    );
  }

  return {
    generatedAt,
    since,
    cellM: count(input.cell_m),
    minPoints: count(input.min_points),
    candidateCount: count(input.candidate_count),
    candidateLimit: count(input.candidate_limit),
    candidatesTruncated: input.candidates_truncated === true,
    qualifyingPocketCount: count(input.qualifying_pocket_count),
    qualifyingReportCount: count(input.qualifying_report_count),
    qualifyingSeriousCount: count(input.qualifying_serious_count),
    qualifyingUnverifiedSeriousCount: count(
      input.qualifying_unverified_serious_count,
    ),
    pocketLimit: count(input.pocket_limit),
    pocketsTruncated: input.pockets_truncated === true,
    pockets,
    rejectedPocketCount,
  };
}

/**
 * Loads bounded, cross-module report concentrations from PostGIS. Refreshes
 * are debounced because the grid aggregation is analytical work; realtime
 * remains owned by the root SignalProvider and only its revision is consumed.
 */
export function useSeriousPockets({
  windowHours,
  signalRevision,
  enabled,
}: {
  windowHours: number;
  signalRevision: string;
  enabled: boolean;
}): SeriousPocketState {
  const [response, setResponse] =
    useState<SeriousPocketResponse>(EMPTY_RESPONSE);
  const [loading, setLoading] = useState(true);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshRevision, setRefreshRevision] = useState(0);
  const previousWindowHours = useRef(windowHours);
  const refresh = useCallback(
    () => setRefreshRevision((current) => current + 1),
    [],
  );

  useEffect(() => {
    if (!enabled) return;
    const interval = window.setInterval(refresh, 5 * 60_000);
    return () => window.clearInterval(interval);
  }, [enabled, refresh]);

  useEffect(() => {
    if (!enabled) {
      setResponse(EMPTY_RESPONSE);
      setLoading(false);
      setStale(false);
      setError(null);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    if (previousWindowHours.current !== windowHours) {
      previousWindowHours.current = windowHours;
      setResponse(EMPTY_RESPONSE);
      setStale(false);
    }
    setLoading(true);
    setError(null);
    const timeout = window.setTimeout(() => {
      void (async () => {
        try {
          const { data, error: rpcError } = await getSupabase()
            .rpc("signal_serious_pockets", {
              p_since: new Date(
                Date.now() -
                  Math.min(Math.max(windowHours, 1), 168) * 60 * 60_000,
              ).toISOString(),
              p_cell_m: 750,
              p_minpoints: 2,
              p_limit: 12,
            })
            .abortSignal(controller.signal);
          if (rpcError) throw rpcError;
          const normalized = normalizeSeriousPocketResponse(data);
          if (!cancelled) {
            setResponse(normalized);
            setStale(false);
          }
        } catch (caught: unknown) {
          if (!cancelled && !controller.signal.aborted) {
            const caughtRecord = record(caught);
            setStale(true);
            setError(
              caught instanceof Error
                ? caught.message
                : typeof caughtRecord.message === "string"
                  ? caughtRecord.message
                  : String(caught),
            );
          }
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
    }, 750);

    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [enabled, windowHours, signalRevision, refreshRevision]);

  return { ...response, loading, stale, error, refresh };
}
