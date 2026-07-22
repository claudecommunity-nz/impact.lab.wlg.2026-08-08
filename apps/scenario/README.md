# @wcc-impact/scenario — the scenario engine

Replays a scripted **southerly-storm day** as two mock feeds (PLAN §10). Licensed or
impractical live sources — MetService warnings, social media — are mocked here so every
team ingests the same unfolding story, and the dashboard peaks on cue at ~15:30 for the
showcase.

The engine is **stateless**: one timeline JSON + the wall clock. It ships as two route
handlers inside `apps/dashboard` (same Vercel project — no organiser laptop in the
critical path):

| Endpoint | Feed |
|---|---|
| `GET /api/scenario/weather` | Mock MetService-style watches/warnings |
| `GET /api/scenario/social` | Mock social-media posts (author, text, optional lat/lng) |

## The story arc (offsets are minutes from scenario start, 9:30 on event day)

- **10:00** (offset 30) heavy-swell **watch** → upgraded to **warnings** by ~11:00
- **11:00** (offset 90) social posts: waves over the road at **Ōwhiro Bay**
- **12:30** (offset 180) **telco outage** across the southern suburbs
- **14:00** (offset 270) **flooding** reports; Ōwhiro Bay **access road closed**
- **15:30** (offset 360) **peak** — red warning, biggest waves, as demos approach

All beats live in [`timeline.json`](./timeline.json).

## How the clock works

- Organisers set the env var **`SCENARIO_START`** (ISO string) in Vercel/`.env` on event
  morning. A feed returns every beat whose `offset` (minutes) `<=` elapsed real time since
  that instant.
  - **Must include an explicit timezone** — a trailing `Z` or `±HH:MM`, e.g.
    `2026-08-08T09:30:00+12:00`. An offsetless value like `2026-08-08T09:30:00` is parsed
    as **UTC** on a UTC host (Vercel), shifting the whole scenario 12h — so it's rejected
    as invalid (see *Not started* below).
  - **A Vercel env change needs a redeploy to take effect.** The deployed route handlers
    read `SCENARIO_START` at build/deploy time, so setting it in the dashboard does
    nothing until you **Redeploy** (Vercel dashboard → Redeploy, or `vercel redeploy`).
    Set it, then redeploy, then confirm `started: true`.
- **Not started** (env unset, missing timezone offset, otherwise invalid, or start is in
  the future) ⇒ `{ "started": false, "elapsed_minutes": 0, "items": [], "reason": "..." }`.
  The `reason` (e.g. `"SCENARIO_START missing timezone offset"`) is a diagnostic to help
  you spot a misconfigured env var.
- **`?t=<minutes>` fast-forward (dev):** overrides the wall clock, e.g.
  `/api/scenario/weather?t=360` shows the world as of the 15:30 peak. Without
  `SCENARIO_START` it runs free (item timestamps anchored at `now − t` so they still look
  recent). **Once `SCENARIO_START` is live, `?t` is clamped to real elapsed minutes** — a
  leftover `?t=360` can never publish future beats early, it just gives the real current
  world.

Feeds are **cumulative**: each call returns *all* beats released so far, oldest first.
**Dedupe by `id`** in your loader (e.g. keep a `set` of seen ids, or make `publish_signal`
idempotent on your side) — do not re-publish the whole feed every poll.

## Response shapes

### `GET /api/scenario/weather`

```json
{
  "started": true,
  "elapsed_minutes": 95,
  "scenario": "southerly-storm",
  "items": [
    {
      "id": "weather-001",
      "kind": "watch",
      "phenomenon": "heavy-swell",
      "severity": "moderate",
      "headline": "Heavy Swell Watch: Wellington south coast",
      "body": "A vigorous southerly change is expected...",
      "area": "Wellington south coast",
      "issued_at": "2026-08-08T10:00:00.000Z"
    }
  ]
}
```

- `kind`: `"watch" | "warning"`.
- `phenomenon`: kebab-case, one of `heavy-swell`, `strong-wind`, `heavy-rain` (treat as
  open-ended).
- `severity`: `"moderate" | "severe" | "extreme"` — deliberately the same scale as the
  signal contract, so it maps straight onto `publish_signal(severity=...)`.
- `issued_at`: ISO 8601, resolved to `SCENARIO_START + offset`.

### `GET /api/scenario/social`

```json
{
  "started": true,
  "elapsed_minutes": 200,
  "scenario": "southerly-storm",
  "items": [
    {
      "id": "social-003",
      "author": "@owhirobaylocal",
      "text": "Waves coming right OVER the road at Ōwhiro Bay...",
      "lat": -41.3455,
      "lng": 174.7597,
      "timestamp": "2026-08-08T11:00:00.000Z"
    }
  ]
}
```

- `lat`/`lng` are **optional** — absent when the post isn't geolocated (use
  `wcc_impact.geocode()` on place names in the text if you need coordinates).
- `timestamp`: ISO 8601, resolved to `SCENARIO_START + offset`.

## Polling from a Python loader

Poll with `wcc_impact.run_every()` — it enforces the shared **5-second floor**, but
beats are minutes apart, so **30–60 s is the right interval**; anything faster only heats
the venue WiFi.

```python
import httpx
from wcc_impact import publish_signal, register_module, run_every

FEED = "https://<dashboard-host>/api/scenario/social"  # or http://localhost:3000 in dev
seen: set[str] = set()

def poll() -> None:
    body = httpx.get(FEED, timeout=10).json()
    if not body["started"]:
        return                      # scenario not started yet — keep polling
    for post in body["items"]:
        if post["id"] in seen:
            continue                # feeds are cumulative — dedupe by id
        seen.add(post["id"])
        publish_signal(
            module_id="team-example",
            title=post["text"][:200],
            signal_type="social-report",
            source_type="community",
            source=post["author"],
            lat=post.get("lat"),
            lng=post.get("lng"),
            observed_at=post["timestamp"],
            raw=post,
        )

register_module(id="team-example", name="Example")
run_every(30, poll)
```

During development, fast-forward by appending `?t=`:

```sh
curl "http://localhost:3000/api/scenario/weather?t=360"   # world as of the 15:30 peak
```

## Layout

```
apps/scenario/
├── timeline.json      # THE scripted day — beats with offsets (minutes from start)
├── src/engine.ts      # stateless replay logic: resolveClock, weatherFeed, socialFeed
└── src/index.ts       # package entry (@wcc-impact/scenario)

apps/dashboard/app/api/scenario/
├── weather/route.ts   # GET /api/scenario/weather  (thin wrapper over weatherFeed)
└── social/route.ts    # GET /api/scenario/social   (thin wrapper over socialFeed)
```

Editing the story = editing `timeline.json` (beats are sanity-checked with Alex before
the event). The route handlers never need to change.
