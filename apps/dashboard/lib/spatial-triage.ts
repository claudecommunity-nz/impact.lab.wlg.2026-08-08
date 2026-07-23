"use client";

import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import {
  signalSchema,
  type Severity,
  type SignalRow,
} from "@wcc-impact/shared";
import { getSupabase } from "@wcc-impact/plugin-sdk/client";

type UnknownRecord = Record<string, unknown>;

export type ResponseRole = "operator" | "controller" | "admin";
export type PriorityBand = "p1" | "p2" | "p3" | "p4";

export interface ResponseAccess {
  authorized: boolean;
  role: ResponseRole | null;
}

export interface TriageCandidate {
  signal: SignalRow;
  eventAt: string;
  actionPriority: PriorityBand;
  verificationPriority: PriorityBand;
  nearbyCount: number;
  independentSourceCount: number;
  locationPrecision: string | null;
  accuracyM: number | null;
  reasonCodes: string[];
}

export interface SignalHotspot {
  key: string;
  signalType: string;
  label: string;
  signalCount: number;
  unverifiedCount: number;
  independentSourceCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  maxSeverity: Severity;
  lat: number;
  lng: number;
}

export interface SpatialTriageState {
  access: ResponseAccess;
  accessLoading: boolean;
  candidates: TriageCandidate[];
  hotspots: SignalHotspot[];
  loading: boolean;
  error: string | null;
  creatingSignalId: string | null;
  refresh: () => void;
  createIncident: (signalId: string) => Promise<string | null>;
}

function record(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function string(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function number(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function priority(value: unknown): PriorityBand {
  return value === "p1" || value === "p2" || value === "p3" ? value : "p4";
}

function severity(value: unknown): Severity {
  return value === "minor" ||
    value === "moderate" ||
    value === "severe" ||
    value === "extreme"
    ? value
    : "unknown";
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && Boolean(item))
    : [];
}

export function normalizeResponseAccess(value: unknown): ResponseAccess {
  const input = record(value);
  const role =
    input.role === "operator" || input.role === "controller" || input.role === "admin"
      ? input.role
      : null;
  return { authorized: input.authorized === true && role !== null, role };
}

export function normalizeTriageCandidate(value: unknown): TriageCandidate | null {
  const input = record(value);
  const parsed = signalSchema.safeParse(input);
  if (
    !parsed.success ||
    typeof parsed.data.id !== "string" ||
    typeof parsed.data.created_at !== "string"
  ) {
    return null;
  }

  return {
    signal: parsed.data as SignalRow,
    eventAt: string(input.event_at) || parsed.data.created_at,
    actionPriority: priority(input.action_priority),
    verificationPriority: priority(input.verification_priority),
    nearbyCount: Math.max(0, Math.trunc(number(input.nearby_count))),
    independentSourceCount: Math.max(
      0,
      Math.trunc(number(input.independent_source_count)),
    ),
    locationPrecision: nullableString(input.location_precision),
    accuracyM: nullableNumber(input.accuracy_m),
    reasonCodes: strings(input.reason_codes),
  };
}

export function normalizeSignalHotspot(value: unknown): SignalHotspot | null {
  const input = record(value);
  const key = string(input.key);
  const signalType = string(input.signal_type);
  const firstSeenAt = string(input.first_seen_at);
  const lastSeenAt = string(input.last_seen_at);
  const lat =
    typeof input.lat === "number" ? input.lat : Number(input.lat);
  const lng =
    typeof input.lng === "number" ? input.lng : Number(input.lng);
  if (
    !key ||
    !signalType ||
    !firstSeenAt ||
    !lastSeenAt ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng)
  ) {
    return null;
  }

  return {
    key,
    signalType,
    label: string(input.label) || `${signalType} hotspot`,
    signalCount: Math.max(0, Math.trunc(number(input.signal_count))),
    unverifiedCount: Math.max(0, Math.trunc(number(input.unverified_count))),
    independentSourceCount: Math.max(
      0,
      Math.trunc(number(input.independent_source_count)),
    ),
    firstSeenAt,
    lastSeenAt,
    maxSeverity: severity(input.max_severity),
    lat,
    lng,
  };
}

function normalizeList<T>(
  value: unknown,
  normalize: (row: unknown) => T | null,
): T[] {
  return Array.isArray(value)
    ? value.map(normalize).filter((row): row is T => row !== null)
    : [];
}

/**
 * Database-backed emergency triage. Public hotspots are always loaded; the
 * cross-module queue is fetched only for an authenticated response member.
 * Re-fetches are driven by the newest shared signal id, so this opens no
 * additional Realtime channel.
 */
export function useSpatialTriage({
  user,
  operationsRequested,
  signalRevision,
}: {
  user: User | null;
  operationsRequested: boolean;
  signalRevision: string | null;
}): SpatialTriageState {
  const [access, setAccess] = useState<ResponseAccess>({
    authorized: false,
    role: null,
  });
  const [accessLoading, setAccessLoading] = useState(false);
  const [candidates, setCandidates] = useState<TriageCandidate[]>([]);
  const [hotspots, setHotspots] = useState<SignalHotspot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [creatingSignalId, setCreatingSignalId] = useState<string | null>(null);

  const refresh = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setAccess({ authorized: false, role: null });
      setAccessLoading(false);
      setCandidates([]);
      return;
    }

    setAccessLoading(true);
    void (async () => {
      try {
        const { data, error: accessError } =
          await getSupabase().rpc("response_access");
        if (cancelled) return;
        if (accessError) {
          setAccess({ authorized: false, role: null });
          setError(`Response access check failed: ${accessError.message}`);
        } else {
          setAccess(normalizeResponseAccess(data));
        }
      } finally {
        if (!cancelled) setAccessLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id, revision]);

  useEffect(() => {
    let cancelled = false;
    void getSupabase()
      .rpc("signal_hotspots", {
        p_since: new Date(Date.now() - 24 * 60 * 60_000).toISOString(),
        p_eps_m: 750,
        p_minpoints: 2,
        p_limit: 50,
      })
      .then(({ data, error: hotspotError }) => {
        if (cancelled) return;
        if (hotspotError) {
          setError(`Spatial hotspots failed: ${hotspotError.message}`);
        } else {
          setHotspots(normalizeList(data, normalizeSignalHotspot));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [signalRevision, revision]);

  useEffect(() => {
    let cancelled = false;
    if (!operationsRequested || !access.authorized) {
      setLoading(false);
      if (!access.authorized) setCandidates([]);
      return;
    }

    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const { data, error: triageError } = await getSupabase().rpc(
          "signal_triage_queue",
          { p_window_hours: 24, p_limit: 200 },
        );
        if (cancelled) return;
        if (triageError) {
          setError(`Triage queue failed: ${triageError.message}`);
        } else {
          setCandidates(normalizeList(data, normalizeTriageCandidate));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [access.authorized, operationsRequested, signalRevision, revision]);

  const createIncident = useCallback(
    async (signalId: string): Promise<string | null> => {
      if (!access.authorized) return null;
      setCreatingSignalId(signalId);
      setError(null);
      const { data, error: incidentError } = await getSupabase().rpc(
        "create_incident_from_signal",
        { p_signal_id: signalId },
      );
      setCreatingSignalId(null);
      if (incidentError) {
        setError(`Incident creation failed: ${incidentError.message}`);
        return null;
      }
      refresh();
      return typeof data === "string" ? data : null;
    },
    [access.authorized, refresh],
  );

  return {
    access,
    accessLoading,
    candidates,
    hotspots,
    loading,
    error,
    creatingSignalId,
    refresh,
    createIncident,
  };
}
