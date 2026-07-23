# wcc-impact-platform (Python)

Loader-side helper library for the WCC Emergency Hack — the Python mirror of
`@wcc-impact/plugin-sdk`. Every `modules/<team>/loader` depends on it as a uv
workspace member (`wcc-impact-platform = { workspace = true }`).

Binding contract: [`/docs/CONTRACTS.md`](../../docs/CONTRACTS.md) §7.
Signal shape source of truth: [`/schema/signal.schema.json`](../../schema/signal.schema.json).
Exact public signatures:
[`/docs/generated/python-api-reference.md`](../../docs/generated/python-api-reference.md).

## Surface

The public helper surface covers module registration/heartbeats, durable signal
publication and reads, module tables/storage, polling, Wellington geocoding, and Claude
text/vision calls. The generated reference above is the exhaustive name/signature list;
this README focuses on the golden path and operational behavior.

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
