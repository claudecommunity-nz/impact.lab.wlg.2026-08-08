/**
 * GET /api/scenario/social — mock social-media posts from the storm day (PLAN §10).
 *
 * Returns every social beat whose offset (minutes) <= elapsed time since the
 * SCENARIO_START env (ISO string, set server-side by organisers on event
 * morning). Not started ⇒ { started: false, items: [] }. `?t=<minutes>`
 * fast-forwards for development regardless of SCENARIO_START.
 *
 * @example curl "http://localhost:3000/api/scenario/social?t=200"
 * // → { "started": true, "elapsed_minutes": 200, "scenario": "southerly-storm",
 * //     "items": [ { "id": "social-001", "author": "@welly_walks", "text": "...",
 * //                  "lat": -41.34, "lng": 174.75, "timestamp": "..." }, ... ] }
 */
import { socialFeed } from "@wcc-impact/scenario";

// Stateless wall-clock replay — never statically cached.
export const dynamic = "force-dynamic";

export function GET(request: Request): Response {
  const t = new URL(request.url).searchParams.get("t");
  return Response.json(socialFeed({ scenarioStart: process.env.SCENARIO_START, t }));
}
