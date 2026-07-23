# wcc-impact-platform (Python)

Loader-side helper library for the WCC Emergency Hack — the Python mirror of
`@wcc-impact/plugin-sdk`. Every `modules/<team>/loader` depends on it as a uv
workspace member (`wcc-impact-platform = { workspace = true }`).

Binding contract: [`/docs/CONTRACTS.md`](../../docs/CONTRACTS.md) §7.
Signal shape source of truth: [`/schema/signal.schema.json`](../../schema/signal.schema.json).

## Surface

| Function | What it does |
|---|---|
| `register_module(id=, name=, icon=, description=)` | Upsert into the `modules` registry → your dashboard tile appears. Never sends `enabled` (organiser kill-switch). |
| `publish_signal(module_id=, title=, signal_type=, source_type=, idempotency_key=, ...)` | Validate, persist to the local outbox, then insert once. Returns the row or a queued receipt during an outage. |
| `flush_signal_queue(module_id)` / `signal_queue_health(module_id)` | Manually drain or inspect the per-module SQLite outbox. `run_every` drains automatically. |
| `fetch_signals(module_id=, signal_type=, since=, limit=100, oldest_first=False)` | Read signals from the shared table (reads are public; newest first by default) → `list[dict]`. The supported way to react to another module's signals. |
| `on_new_signals(fn, poll_seconds=10, module_id=, signal_type=)` | Polling trigger built on `run_every`: delivers new rows oldest-first and retries failed batches (at-least-once). 5 s minimum interval applies. |
| `heartbeat(module_id)` | Update `modules.last_seen` for the health strip. `run_every` does this automatically. |
| `ask_claude(prompt, system=, model=, max_tokens=)` | One-shot text call (default `claude-haiku-4-5-20251001`, ~10 req/min in-process limit). |
| `analyze_image(image, prompt, ...)` | Vision call — https URL, local path, or raw bytes. |
| `upload_file(path, module_id, content_type=)` | Upload to `media/<module_id>/<filename>` → public URL for `media_urls`. 10 MB cap. |
| `module_table(module_id, table)` | Query builder for a module-owned table (`m_<id>_<name>`) — reads + token-gated writes. |
| `geocode(place_name)` | Offline Wellington gazetteer (~45 suburbs/landmarks) + fuzzy match first, then a rate-limited Nominatim (OpenStreetMap) fallback bounded to the Wellington region → `(lat, lng)` or `None`. Results (including misses) cached in-process. |
| `run_every(seconds, fn, run_immediately=True)` | Polling loop with heartbeat + jitter. **Clamps intervals below the 5 s floor to 5 s (with a printed warning).** Ctrl-C exits cleanly. |

All failures raise `wcc_impact.HackPlatformError` (subclass of
`RuntimeError`) with a readable message. Env (`SUPABASE_URL`,
`SUPABASE_PUBLISHABLE_KEY`, `EVENT_TOKEN`, `ANTHROPIC_API_KEY`) loads from the
repo-root gitignored `.env` automatically.

Validated signals are durable by default. They are written under the
gitignored `.wcc-impact/` directory before the network request, replayed
oldest-first, and deduplicated in Postgres by `(module_id, idempotency_key)`.
Use a source ID or canonical URL as the key when one exists:

```python
publish_signal(..., idempotency_key=f"nzta:{item['id']}")
```

Set `WCC_IMPACT_DURABLE_SIGNALS=0` or pass `durable=False` only when you want
the older immediate-write-and-raise behaviour. Full operational details:
[`docs/durable-signal-ingestion.md`](../../docs/durable-signal-ingestion.md).

## Quick start

```python
from wcc_impact import register_module, publish_signal, run_every

MODULE_ID = "team-coast-watch"  # = your folder name under modules/

def poll():
    publish_signal(module_id=MODULE_ID,
                   title="Waves over the road at Ōwhiro Bay",
                   signal_type="coastal-hazard", source_type="community",
                   lat=-41.3455, lng=174.7597, severity="severe")

def main():
    register_module(id=MODULE_ID, name="Coast Watch", icon="waves")
    run_every(60, poll)
```

## Tests

Offline unit tests (no network, no secrets):

```sh
uv run --package wcc-impact-platform pytest packages/wcc-impact-platform-py/tests
```
