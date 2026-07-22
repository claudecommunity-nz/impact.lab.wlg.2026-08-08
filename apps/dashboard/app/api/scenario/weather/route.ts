/**
 * GET /api/scenario/weather — mock MetService-style watches/warnings (PLAN §10).
 *
 * Returns every weather beat whose offset (minutes) <= elapsed time since the
 * SCENARIO_START env (ISO string, set server-side by organisers on event
 * morning). Not started ⇒ { started: false, items: [] }. `?t=<minutes>`
 * fast-forwards for development regardless of SCENARIO_START.
 *
 * @example curl "http://localhost:3000/api/scenario/weather?t=120"
 * // → { "started": true, "elapsed_minutes": 120, "scenario": "southerly-storm",
 * //     "items": [ { "id": "weather-001", "kind": "watch", ... "issued_at": "..." }, ... ] }
 */
import { weatherFeed } from "@wcc-impact/scenario";

// Stateless wall-clock replay — never statically cached.
export const dynamic = "force-dynamic";

export function GET(request: Request): Response {
  const t = new URL(request.url).searchParams.get("t");
  return Response.json(weatherFeed({ scenarioStart: process.env.SCENARIO_START, t }));
}
