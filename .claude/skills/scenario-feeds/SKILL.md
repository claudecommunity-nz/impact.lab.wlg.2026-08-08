---
name: scenario-feeds
description: The scenario engine's mock storm feeds — what they are, the feed shapes, how to poll them from a loader, and the ?t= fast-forward for development. Use when a module consumes the scripted weather or social feeds.
---

# Scenario feeds

Some data the problem statements need can't be used live (MetService warnings, social
media). The **scenario engine** replays them instead: a scripted southerly-storm timeline
that unfolds across the event day, served as mock feeds from route handlers deployed with
the dashboard (`apps/scenario`). Every team ingests the same unfolding story; the
dashboard peaks on cue for the showcase.

Treat scenario feeds exactly like real upstream APIs: poll politely with `run_every(60)`,
dedupe by item `id`, shape into signals with `publish_signal()`. Your loader shouldn't
care that the source is scripted — that's the point (and it's what makes your module
production-shaped for the handover doc).

## The feeds

Two feeds, both plain JSON over GET, both stateless (timeline JSON + wall clock — the
same request at the same moment returns the same items for every team):

- **Weather feed** — `GET <dashboard-host>/api/scenario/weather` — CAP-style
  watch/warning items (the mocked MetService). Items carry an id, issue time, event type,
  severity, headline/description, and area text.
- **Social feed** — `GET <dashboard-host>/api/scenario/social` — mock community posts
  (the mocked social media). Items carry an id, timestamp, author handle, post text, and
  sometimes a place hint in the text — that's deliberate: extracting and geocoding it is
  part of the problem (see the `geocoding` and `ai-claude` skills).

`<dashboard-host>` is `http://localhost:3000` when running `pnpm dev`; the deployed
dashboard URL is on the whiteboard at kickoff. Feeds return items **up to the current
scenario clock** — early in the day they're quiet; the storm builds toward ~15:30. Field
names and full response shapes are in the scenario engine's own docs
(`apps/scenario/README.md`) — read a live response before coding against it
(`curl <feed-url> | python -m json.tool`), and keep the upstream item in your signal's
`raw` field.

Every response carries a `started` flag: `{"started": false, "items": []}` is not a bug —
it means the scenario clock hasn't started (organisers set `SCENARIO_START` on event
morning, and you passed no valid `?t=`). During development, use `?t=` below.

```python
import httpx
from wcc_impact import publish_signal, run_every

seen: set[str] = set()

def poll_social() -> None:
    resp = httpx.get(SOCIAL_FEED_URL, timeout=10).json()
    for post in resp["items"]:
        if post["id"] in seen:
            continue
        seen.add(post["id"])
        publish_signal(module_id=MODULE_ID, title=post["text"][:200],
                       signal_type="community-report", source_type="community",
                       reported_at=post["timestamp"], raw=post)

run_every(60, poll_social)
```

## `?t=` — the development fast-forward

Every scenario endpoint accepts `?t=<minutes since scenario start (9:30)>` to override
the scenario clock, so you can develop against afternoon data at 10am:

- `?t=360` — the world as of the 15:30 peak (9:30 + 360 minutes):

  ```sh
  curl "http://localhost:3000/api/scenario/weather?t=360" | python -m json.tool
  ```

- It's **minutes, not a time of day** — `?t=14:30` is not a number, is silently ignored,
  and falls through to the wall clock (which, with `SCENARIO_START` unset in dev, returns
  `{"started": false, "items": []}`). If your feed is unexpectedly empty, check this first.

Use it to test how your module handles the storm peak **before** the peak happens live.
Remember to drop `?t=` from your loader's URL for the real run — a loader pinned to a
fast-forwarded clock will re-publish the whole day at once and spam the shared feed.

Don't hardcode assumptions about specific beats (their timing is deliberately not
published) — write your loader to handle whatever arrives, whenever it arrives.
