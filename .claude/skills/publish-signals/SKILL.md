---
name: publish-signals
description: Publish signals from a Python loader onto the shared map and feed with wcc_impact.publish_signal, and diagnose rejected inserts (RLS, token, disabled module, length caps).
---

# Publish signals

Signals are rows in the shared `signals` table — the moment one inserts, it's on the live
feed and (if geolocated) the shared map, for every screen in the room. Publishing is
Python-only, from your loader.

```python
from wcc_impact import publish_signal

publish_signal(
    module_id="team-coast-watch",           # your module id — must be registered + enabled
    title="Waves over the road at Ōwhiro Bay",   # <= 200 chars (RLS-enforced)
    signal_type="coastal-hazard",           # kebab-case; drives homeStat.signalType
    source_type="community",                # official | community | media | sensor
    description="Multiple reports of water over Ōwhiro Bay Parade",  # <= 2000 chars
    lat=-41.3455, lng=174.7597,             # no lat/lng => feed only, not on the map
    place_name="Ōwhiro Bay",
    severity="severe",                      # minor|moderate|severe|extreme|unknown
    confidence=0.8,                         # 0-1, optional
    link="https://example.org/source-post",
    raw={"upstream_id": "abc123"},          # keep the original payload for handover
)
```

Full parameter list: `docs/CONTRACTS.md` §7; field semantics: `schema/signal.schema.json`
(see the `signal-schema` skill). `publish_signal` validates locally against the schema
before inserting and raises `HackPlatformError` with a readable message on failure.

## Practical patterns

- **Dedupe before publishing.** Re-publishing the same upstream item every poll floods the
  shared feed. Track seen IDs in a set (or check `raw` fields you stored):

  ```python
  seen: set[str] = set()

  def poll():
      for item in fetch_feed():
          if item["id"] in seen:
              continue
          seen.add(item["id"])
          publish_signal(module_id=MODULE_ID, title=item["headline"], ...)
  ```

- **Timestamps:** `observed_at` = when the event happened, `reported_at` = when the source
  published it. Pass ISO strings or `datetime`s. Never send `id`/`created_at`.
- **Media:** upload first, then reference — `url = upload_file("photo.jpg", MODULE_ID)`,
  then `publish_signal(..., media_urls=[url])`.
- **Severity honestly:** the map colours by it and the room reads it. `unknown` is a fine
  default; don't inflate.

## Why inserts get rejected (in order of likelihood)

1. **No/wrong event token** — `EVENT_TOKEN` missing from the repo-root `.env`. Every write
   needs it; `wcc_impact` attaches it automatically when present.
2. **Module not registered or disabled** — RLS requires `module_id` to reference an
   **enabled** `modules` row. Run `register_module(...)` first; if organisers flipped the
   kill-switch, your inserts fail until they re-enable you.
3. **Length caps** — `title` > 200 or `description` > 2000 chars. Truncate before sending.
4. **Schema mismatch** — bad enum value, confidence outside 0–1, missing required field,
   over-length value. The local validation error tells you which field. (`link` and
   `media_urls` are plain strings — URLs are not format-checked.)

Updating signals post-insert: only `verification` and `confidence`, only by authenticated
users (that's the triage problem's territory — see `useUser()` in the plugin-sdk skill).
