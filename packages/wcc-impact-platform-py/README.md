# wcc-impact-platform (Python)

Loader-side helper library for the WCC Emergency Hack — the Python mirror of
`@wcc-impact/plugin-sdk`. Every `modules/<team>/loader` depends on it as a uv
workspace member (`wcc-impact-platform = { workspace = true }`).

Binding contract: [`/docs/CONTRACTS.md`](../../docs/CONTRACTS.md) §7.
Signal shape source of truth: [`/schema/signal.schema.json`](../../schema/signal.schema.json).

## Surface

| Function | What it does |
|---|---|
| `register_module(id=, name=, icon=, description=, problem=)` | Upsert into the `modules` registry → your dashboard tile appears. Never sends `enabled` (organiser kill-switch). |
| `publish_signal(module_id=, title=, signal_type=, source_type=, ...)` | Validate against the signal contract (pydantic mirror of the JSON Schema), insert into `signals`, return the row. |
| `heartbeat(module_id)` | Update `modules.last_seen` for the health strip. `run_every` does this automatically. |
| `ask_claude(prompt, system=, model=, max_tokens=)` | One-shot text call (default `claude-haiku-4-5-20251001`, ~10 req/min in-process limit). |
| `analyze_image(image, prompt, ...)` | Vision call — https URL, local path, or raw bytes. |
| `upload_file(path, module_id, content_type=)` | Upload to `media/<module_id>/<filename>` → public URL for `media_urls`. 10 MB cap. |
| `geocode(place_name)` | Offline Wellington gazetteer (~45 suburbs/landmarks) + fuzzy match → `(lat, lng)` or `None`. No external API. |
| `run_every(seconds, fn, run_immediately=True)` | Polling loop with heartbeat + jitter. **Raises `ValueError` below the 5 s floor.** Ctrl-C exits cleanly. |

All failures raise `wcc_impact.HackPlatformError` (subclass of
`RuntimeError`) with a readable message. Env (`SUPABASE_URL`,
`SUPABASE_PUBLISHABLE_KEY`, `EVENT_TOKEN`, `ANTHROPIC_API_KEY`) loads from the
repo-root gitignored `.env` automatically.

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
    register_module(id=MODULE_ID, name="Coast Watch", icon="waves", problem=1)
    run_every(60, poll)
```

## Tests

Offline unit tests (no network, no secrets):

```sh
uv run --package wcc-impact-platform pytest packages/wcc-impact-platform-py/tests
```
