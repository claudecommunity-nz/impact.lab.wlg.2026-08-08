import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────────
// SOURCE OF TRUTH: /schema/signal.schema.json
// This zod schema mirrors that JSON Schema field-for-field. If the two ever
// disagree, the JSON Schema wins — fix this file, never the other way round.
// (CI validates loader sample() output against the JSON Schema directly.)
// ─────────────────────────────────────────────────────────────────────────────

export const SOURCE_TYPES = ["official", "community", "media", "sensor"] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

/** CAP-aligned severity ladder. */
export const SEVERITIES = ["minor", "moderate", "severe", "extreme", "unknown"] as const;
export type Severity = (typeof SEVERITIES)[number];

export const VERIFICATIONS = ["unverified", "corroborated", "verified", "false_report"] as const;
export type Verification = (typeof VERIFICATIONS)[number];

/**
 * One row in the shared `signals` table.
 *
 * Required on insert: title, signal_type, source_type, module_id.
 * id/created_at are database-generated; everything else is nullable/optional.
 *
 * @example
 * const signal = signalSchema.parse({
 *   title: "Waves breaking over the road at Ōwhiro Bay",
 *   signal_type: "coastal-hazard",
 *   source_type: "community",
 *   module_id: "team-coast-watch",
 *   lat: -41.3455, lng: 174.7597, severity: "severe",
 * });
 */
export const signalSchema = z.object({
  /** UUID — set by the database; never supply on insert. */
  id: z.string().nullish(),
  /** ISO 8601 — set by the database. */
  created_at: z.string().nullish(),
  /** ISO 8601 — when the event happened in the real world. */
  observed_at: z.string().nullish(),
  /** ISO 8601 — when the source reported it. */
  reported_at: z.string().nullish(),
  /** Human-readable origin, e.g. "GeoNet", "NZTA Journey Planner". */
  source: z.string().max(200).nullish(),
  source_type: z.enum(SOURCE_TYPES),
  /** Module-chosen kebab-case category, e.g. "flooding", "outage". */
  signal_type: z.string().min(1).max(100),
  /** Headline for the feed card / map popup. RLS caps this at 200 chars. */
  title: z.string().min(1).max(200),
  /** Longer detail. RLS caps this at 2000 chars. */
  description: z.string().max(2000).nullish(),
  lat: z.number().min(-90).max(90).nullish(),
  lng: z.number().min(-180).max(180).nullish(),
  place_name: z.string().max(200).nullish(),
  severity: z.enum(SEVERITIES).default("unknown"),
  verification: z.enum(VERIFICATIONS).default("unverified"),
  /** 0-1 confidence score. */
  confidence: z.number().min(0).max(1).nullish(),
  /** URL to the source item. */
  link: z.string().max(2000).nullish(),
  /** Public URLs into the shared media bucket (media/<module_id>/...). */
  media_urls: z.array(z.string()).default([]),
  /** Owning module id — must reference an ENABLED modules row (RLS-enforced). */
  module_id: z.string().min(1).max(100),
  /** Original upstream payload, for debugging/handover. */
  raw: z.record(z.string(), z.unknown()).nullish(),
});

/** A signal as validated by {@link signalSchema} (id/created_at may be absent pre-insert). */
export type Signal = z.infer<typeof signalSchema>;

/** A signal as read back from the database — id and created_at are always present. */
export type SignalRow = Signal & { id: string; created_at: string };
