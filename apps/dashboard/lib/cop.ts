import type {
  ModuleRow,
  Severity,
  SignalAggregates,
  SignalRow,
  SourceType,
} from "@wcc-impact/shared";

/**
 * Common-operating-picture derivations. Everything the homepage panels show is
 * computed here from the signals the SDK already holds (newest-first, kill-switch
 * filtered) — one shared source of truth, no new data layer.
 */

export type ThreatLevel = "critical" | "major" | "elevated" | "monitoring" | "unconfirmed";

export interface ThreatStatus {
  level: ThreatLevel;
  label: string; // one word for the banner
  headline: string; // plain-language summary
  action: string; // public "what to do" line
}

export interface TimeBucket {
  t: string; // label, e.g. "14:15"
  minor: number;
  moderate: number;
  severe: number;
  extreme: number;
  unknown: number;
}

export interface SuburbStat {
  place: string;
  count: number;
  maxSeverity: Severity;
}

export interface Cop {
  now: number;
  total: number;
  severityCounts: Record<Severity, number>;
  sourceCounts: Record<SourceType, number>;
  active60: number; // signals in the last 60 min
  new15: number; // signals in the last 15 min
  prev15: number; // 15 min before that (for velocity)
  velocity: number; // new15 - prev15
  criticalCount: number; // severe + extreme
  needsTriage: number; // unverified (community-heavy)
  officialActive: number; // official source in last 60 min
  verifiedPct: number; // share verified/corroborated
  suburbCount: number; // authoritative distinct place_name count when available
  suburbs: SuburbStat[]; // ranked desc
  buckets: TimeBucket[]; // ~last 3h, 15-min stacked-by-severity
  latest: SignalRow[]; // all, newest first (compact feed)
  critical: SignalRow[]; // severe+extreme, newest first
  triage: SignalRow[]; // needs verification, ranked by stakes
  threat: ThreatStatus;
  publicThreat: ThreatStatus; // confirmed official reports only
}

const SEVS: Severity[] = ["minor", "moderate", "severe", "extreme", "unknown"];
const SEV_RANK: Record<Severity, number> = {
  unknown: 0,
  minor: 1,
  moderate: 2,
  severe: 3,
  extreme: 4,
};
const SOURCES: SourceType[] = ["official", "community", "media", "sensor"];

function ts(s: SignalRow): number {
  return s.created_at ? Date.parse(s.created_at) : NaN;
}

export function deriveCop(signals: SignalRow[], _modules: ModuleRow[], now: number): Cop {
  const severityCounts = Object.fromEntries(SEVS.map((s) => [s, 0])) as Record<Severity, number>;
  const activeSeverityCounts = Object.fromEntries(SEVS.map((s) => [s, 0])) as Record<
    Severity,
    number
  >;
  const confirmedOfficialSeverityCounts = Object.fromEntries(
    SEVS.map((s) => [s, 0]),
  ) as Record<Severity, number>;
  const sourceCounts = Object.fromEntries(SOURCES.map((s) => [s, 0])) as Record<SourceType, number>;
  const suburbMap = new Map<string, { count: number; max: Severity }>();

  let active60 = 0;
  let new15 = 0;
  let prev15 = 0;
  let officialActive = 0;
  let confirmedOfficialActive = 0;
  let verifiedish = 0;

  const MIN = 60_000;
  for (const s of signals) {
    const sev = (s.severity ?? "unknown") as Severity;
    severityCounts[sev] = (severityCounts[sev] ?? 0) + 1;
    if (s.source_type) sourceCounts[s.source_type] = (sourceCounts[s.source_type] ?? 0) + 1;

    const age = now - ts(s);
    if (age <= 60 * MIN) {
      active60++;
      activeSeverityCounts[sev] = (activeSeverityCounts[sev] ?? 0) + 1;
      if (s.source_type === "official") officialActive++;
      if (
        s.source_type === "official" &&
        (s.verification === "verified" || s.verification === "corroborated")
      ) {
        confirmedOfficialActive++;
        confirmedOfficialSeverityCounts[sev] =
          (confirmedOfficialSeverityCounts[sev] ?? 0) + 1;
      }
    }
    if (age <= 15 * MIN) new15++;
    else if (age <= 30 * MIN) prev15++;

    if (s.verification === "verified" || s.verification === "corroborated") verifiedish++;

    if (s.place_name) {
      const cur = suburbMap.get(s.place_name) ?? { count: 0, max: "unknown" as Severity };
      cur.count++;
      if (SEV_RANK[sev] > SEV_RANK[cur.max]) cur.max = sev;
      suburbMap.set(s.place_name, cur);
    }
  }

  const total = signals.length;
  const criticalCount = activeSeverityCounts.severe + activeSeverityCounts.extreme;
  // false_report is a terminal triage outcome — those rows are done, not queued.
  const needsTriage = signals.filter((s) => s.verification === "unverified").length;
  const verifiedPct = total ? Math.round((verifiedish / total) * 100) : 0;

  const suburbs: SuburbStat[] = [...suburbMap.entries()]
    .map(([place, v]) => ({ place, count: v.count, maxSeverity: v.max }))
    .sort((a, b) => b.count - a.count || SEV_RANK[b.maxSeverity] - SEV_RANK[a.maxSeverity]);

  // 15-min buckets across the last 3h, stacked by severity.
  const BUCKET = 15 * MIN;
  const SPAN = 12; // 3h
  const start = now - SPAN * BUCKET;
  const buckets: TimeBucket[] = Array.from({ length: SPAN }, (_, i) => {
    const at = start + i * BUCKET;
    return {
      t: new Date(at).toLocaleTimeString("en-NZ", { hour: "2-digit", minute: "2-digit", hour12: false }),
      minor: 0,
      moderate: 0,
      severe: 0,
      extreme: 0,
      unknown: 0,
    };
  });
  for (const s of signals) {
    const at = ts(s);
    if (Number.isNaN(at) || at < start) continue;
    const idx = Math.min(SPAN - 1, Math.floor((at - start) / BUCKET));
    if (idx < 0) continue;
    const sev = (s.severity ?? "unknown") as Severity;
    const bucket = buckets[idx];
    if (bucket) bucket[sev]++;
  }

  const critical = signals
    .filter(
      (s) =>
        (s.severity === "severe" || s.severity === "extreme") &&
        now - ts(s) <= 60 * MIN,
    )
    .slice(0, 25);
  const triage = signals
    .filter((s) => s.verification === "unverified")
    .sort(
      (a, b) =>
        SEV_RANK[(b.severity ?? "unknown") as Severity] -
        SEV_RANK[(a.severity ?? "unknown") as Severity],
    )
    .slice(0, 40);

  return {
    now,
    total,
    severityCounts,
    sourceCounts,
    active60,
    new15,
    prev15,
    velocity: new15 - prev15,
    criticalCount,
    needsTriage,
    officialActive,
    verifiedPct,
    suburbCount: suburbs.length,
    suburbs,
    buckets,
    latest: signals.slice(0, 80),
    critical,
    triage,
    threat: deriveThreat(activeSeverityCounts, criticalCount, new15 - prev15),
    publicThreat: derivePublicThreat(
      confirmedOfficialSeverityCounts,
      confirmedOfficialActive,
    ),
  };
}

/** Overlay exact DB totals while retaining recent rows for feeds/charts/ranking. */
export function applyAuthoritativeAggregates(
  recent: Cop,
  aggregates: SignalAggregates | null,
): Cop {
  if (!aggregates) return recent;
  const severityCounts = aggregates.bySeverity;
  const verifiedish =
    aggregates.byVerification.verified + aggregates.byVerification.corroborated;
  const verifiedPct = aggregates.total
    ? Math.round((verifiedish / aggregates.total) * 100)
    : 0;
  const velocity = aggregates.new15m - aggregates.previous15m;
  return {
    ...recent,
    total: aggregates.total,
    severityCounts,
    sourceCounts: aggregates.bySource,
    active60: aggregates.active60m,
    new15: aggregates.new15m,
    prev15: aggregates.previous15m,
    velocity,
    needsTriage: aggregates.byVerification.unverified,
    officialActive: aggregates.officialActive60m,
    verifiedPct,
    suburbCount: aggregates.distinctPlaces,
  };
}

function deriveThreat(
  sev: Record<Severity, number>,
  criticalCount: number,
  velocity: number,
): ThreatStatus {
  if (sev.extreme > 0 || sev.severe >= 3) {
    return {
      level: "critical",
      label: "Critical",
      headline: `${criticalCount} major hazard${criticalCount === 1 ? "" : "s"} active across Wellington.`,
      action: "Follow official instructions. Avoid the affected areas. In an emergency call 111.",
    };
  }
  if (sev.severe > 0) {
    return {
      level: "major",
      label: "Major",
      headline: `Severe conditions reported${criticalCount ? ` — ${criticalCount} serious hazard${criticalCount === 1 ? "" : "s"}` : ""}. Stay alert.`,
      action: "Follow official advice, avoid affected areas, and check on people nearby.",
    };
  }
  if (sev.moderate > 0 || velocity >= 3) {
    return {
      level: "elevated",
      label: "Elevated",
      headline: "Conditions developing — moderate hazards being tracked.",
      action: "Stay informed and be ready to act if conditions worsen.",
    };
  }
  return {
    level: "monitoring",
    label: "Monitoring",
    headline: "No major hazards active. The picture is being monitored.",
    action: "Normal precautions. Continue to monitor official channels.",
  };
}

function derivePublicThreat(
  sev: Record<Severity, number>,
  confirmedOfficialActive: number,
): ThreatStatus {
  if (confirmedOfficialActive === 0) {
    return {
      level: "unconfirmed",
      label: "Unconfirmed",
      headline: "Official regional status is not available in this dashboard feed.",
      action: "Check official channels before making decisions. In immediate danger, call 111.",
    };
  }

  const criticalCount = sev.severe + sev.extreme;
  const threat = deriveThreat(sev, criticalCount, 0);
  if (threat.level !== "monitoring") return threat;

  return {
    ...threat,
    headline: "No major hazards are confirmed in current official reports.",
    action: "Continue to follow official advice and be ready to act if conditions change.",
  };
}

/** Compact "3m ago" / "just now" for live freshness labels. */
export function ago(iso: string | null | undefined, now: number): string {
  if (!iso) return "—";
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m ago`;
}
