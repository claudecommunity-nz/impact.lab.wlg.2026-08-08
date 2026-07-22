/**
 * Scenario engine — stateless replay of the scripted southerly-storm day (PLAN §10).
 *
 * Everything derives from two inputs: the timeline JSON (beats with offsets in
 * minutes from scenario start) and the wall clock. No database, no memory —
 * which is why the feeds can deploy as plain route handlers inside the
 * dashboard's Vercel project.
 */
import timelineJson from "../timeline.json";

// ---------- Timeline types (shape of timeline.json) ----------

/** Mock MetService-style watch/warning. `severity` uses the same scale as the
 *  signals contract (moderate/severe/extreme) so loaders can map it straight
 *  onto `publish_signal(severity=...)`. */
export interface WeatherWarning {
  id: string;
  kind: "watch" | "warning";
  phenomenon: string; // e.g. "heavy-swell", "strong-wind", "heavy-rain"
  severity: "moderate" | "severe" | "extreme";
  headline: string;
  body: string;
  area: string;
}

/** Mock social post. lat/lng present only when the post is geolocated. */
export interface SocialPost {
  id: string;
  author: string;
  text: string;
  lat?: number;
  lng?: number;
}

export type Beat =
  | { offset: number; type: "weather"; warning: WeatherWarning }
  | { offset: number; type: "social"; post: SocialPost };

export interface Timeline {
  scenario: string;
  description: string;
  beats: Beat[];
}

// JSON import is structurally typed; assert once here so the rest of the
// engine (and the route handlers) get the discriminated union.
export const timeline = timelineJson as unknown as Timeline;

// ---------- Feed items (beats with resolved wall-clock timestamps) ----------

export interface WeatherItem extends WeatherWarning {
  /** ISO 8601 — scenario start + the beat's offset. */
  issued_at: string;
}

export interface SocialItem extends SocialPost {
  /** ISO 8601 — scenario start + the beat's offset. */
  timestamp: string;
}

export interface FeedResponse<Item> {
  /** false ⇒ scenario not started (no/invalid SCENARIO_START, no ?t) and items is []. */
  started: boolean;
  /** Whole minutes elapsed since scenario start (or the ?t override). */
  elapsed_minutes: number;
  scenario: string;
  items: Item[];
  /** Diagnostic when started is false — e.g. why SCENARIO_START was rejected. */
  reason?: string;
}

// ---------- Clock resolution ----------

export interface ClockOptions {
  /** ISO string, usually process.env.SCENARIO_START. Absent/invalid ⇒ not started. */
  scenarioStart?: string | null;
  /** Raw ?t= query value (minutes). A valid number fast-forwards to that point. */
  t?: string | null;
  /** Injectable "now" for tests; defaults to new Date(). */
  now?: Date;
}

/**
 * Turn env + query into (started, elapsed minutes, base time for timestamps).
 *
 * Rules (PLAN §10):
 * - SCENARIO_START must carry an explicit timezone (a trailing `Z` or `±HH:MM`).
 *   An offsetless value like `2026-08-08T09:30:00` is parsed as UTC on a UTC host
 *   (Vercel), silently shifting the whole scenario 12h — so we reject it as
 *   invalid (not started) with a `reason`.
 * - `?t=<minutes>` fast-forwards the wall clock — but once SCENARIO_START is a
 *   valid live time, ?t is clamped to real elapsed minutes so a leftover
 *   `?t=360` can't publish the 15:30 peak at 10:00. With no valid start, ?t
 *   works freely for dev and timestamps are anchored at now − t minutes.
 * - Otherwise elapsed = now − SCENARIO_START; a future start ⇒ not started.
 * - No SCENARIO_START and no ?t ⇒ not started.
 *
 * @example
 *   const { started, elapsedMinutes } =
 *     resolveClock({ scenarioStart: process.env.SCENARIO_START, t: "90" });
 */
export function resolveClock(opts: ClockOptions): {
  started: boolean;
  elapsedMinutes: number;
  base: Date;
  reason?: string;
} {
  const now = opts.now ?? new Date();

  // Require an explicit timezone; an offsetless ISO string is a UTC-host footgun.
  let startMs = NaN;
  let reason: string | undefined;
  if (opts.scenarioStart) {
    if (/(?:Z|[+-]\d{2}:?\d{2})$/.test(opts.scenarioStart)) {
      startMs = Date.parse(opts.scenarioStart);
      if (Number.isNaN(startMs)) reason = "SCENARIO_START is not a valid ISO datetime";
    } else {
      reason = "SCENARIO_START missing timezone offset";
    }
  } else {
    reason = "SCENARIO_START not set";
  }
  const startValid = !Number.isNaN(startMs);

  if (opts.t != null && opts.t !== "") {
    const t = Number(opts.t);
    if (Number.isFinite(t) && t >= 0) {
      if (startValid) {
        // Live scenario: ?t can fast-forward but never past real elapsed time.
        const realElapsed = (now.getTime() - startMs) / 60_000;
        const clamped = Math.max(0, Math.min(t, realElapsed));
        return { started: true, elapsedMinutes: Math.floor(clamped), base: new Date(startMs) };
      }
      // No valid start ⇒ ?t runs free for dev; anchor timestamps at now − t.
      return { started: true, elapsedMinutes: Math.floor(t), base: new Date(now.getTime() - t * 60_000) };
    }
    // Invalid ?t falls through to the wall clock.
  }

  if (startValid) {
    const elapsed = (now.getTime() - startMs) / 60_000;
    if (elapsed >= 0) {
      return { started: true, elapsedMinutes: Math.floor(elapsed), base: new Date(startMs) };
    }
    reason = "SCENARIO_START is in the future";
  }

  return { started: false, elapsedMinutes: 0, base: now, reason };
}

// ---------- Feeds ----------

function beatTimestamp(base: Date, offsetMinutes: number): string {
  return new Date(base.getTime() + offsetMinutes * 60_000).toISOString();
}

/**
 * All weather beats released so far (offset <= elapsed), oldest first.
 *
 * @example
 *   // GET /api/scenario/weather?t=120
 *   const body = weatherFeed({ scenarioStart: process.env.SCENARIO_START, t: "120" });
 *   // body.items[0].headline === "Heavy Swell Watch: Wellington south coast"
 */
export function weatherFeed(opts: ClockOptions): FeedResponse<WeatherItem> {
  const { started, elapsedMinutes, base, reason } = resolveClock(opts);
  const items = !started
    ? []
    : timeline.beats.flatMap((b) =>
        b.type === "weather" && b.offset <= elapsedMinutes
          ? [{ ...b.warning, issued_at: beatTimestamp(base, b.offset) }]
          : [],
      );
  return {
    started,
    elapsed_minutes: elapsedMinutes,
    scenario: timeline.scenario,
    items,
    ...(reason ? { reason } : {}),
  };
}

/**
 * All social beats released so far (offset <= elapsed), oldest first.
 *
 * @example
 *   const body = socialFeed({ scenarioStart: "2026-08-08T09:30:00+12:00", t: null });
 *   for (const post of body.items) console.log(post.author, post.text);
 */
export function socialFeed(opts: ClockOptions): FeedResponse<SocialItem> {
  const { started, elapsedMinutes, base, reason } = resolveClock(opts);
  const items = !started
    ? []
    : timeline.beats.flatMap((b) =>
        b.type === "social" && b.offset <= elapsedMinutes
          ? [{ ...b.post, timestamp: beatTimestamp(base, b.offset) }]
          : [],
      );
  return {
    started,
    elapsed_minutes: elapsedMinutes,
    scenario: timeline.scenario,
    items,
    ...(reason ? { reason } : {}),
  };
}
