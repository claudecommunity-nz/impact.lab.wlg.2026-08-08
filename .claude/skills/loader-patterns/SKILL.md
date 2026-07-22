---
name: loader-patterns
description: How to structure a Python loader — the uv workspace, main()/sample() CI contract, run_every polling loops, heartbeats, and being polite to public APIs. Use when writing or debugging any modules/<id>/loader.
---

# Loader patterns

Loaders are plain Python processes on your laptop: fetch public data → shape it →
`publish_signal()`. No serverless, no scheduler — a `run_every()` loop in a terminal.

## The uv workspace

The repo root is a uv workspace; every `modules/*/loader` and `packages/wcc-impact-platform-py`
are members sharing ONE lockfile and ONE `.venv`.

```sh
uv sync                                                # once after scaffold / pulling
uv run --directory modules/team-<name>/loader --package team-<name>-loader python -m src.main   # run your loader
uv run pytest                                          # loader tests (CI runs these)
```

Your `loader/pyproject.toml` depends on the helper package as a workspace member —
`wcc-impact-platform = { workspace = true }` — and imports it as `wcc_impact`. Add third-party
deps with `uv add --package team-<name>-loader httpx` (httpx is the blessed HTTP client).

## The CI contract: main() and sample()

Every `loader/src/main.py` must expose both:

```python
from wcc_impact import register_module, publish_signal, run_every
import httpx

MODULE_ID = "team-outage-watch"

def sample() -> dict:
    """One representative signal payload, NOT inserted.
    CI validates this against schema/signal.schema.json on every PR."""
    return {"module_id": MODULE_ID, "title": "Cell tower outage: Brooklyn",
            "signal_type": "outage", "source_type": "official", "severity": "moderate"}

def poll() -> None:
    resp = httpx.get("https://api.example.org/status",
                     headers={"User-Agent": "wcc-hackathon/team-outage-watch"},
                     timeout=10)
    resp.raise_for_status()
    for item in new_items(resp.json()):          # dedupe! (publish-signals skill)
        publish_signal(module_id=MODULE_ID, title=item["title"],
                       signal_type="outage", source_type="official",
                       raw=item)

def main() -> None:
    register_module(id=MODULE_ID, name="Outage Watch", icon="radio-tower",
                    description="Telco outage detection")
    run_every(60, poll)                          # forever; Ctrl-C exits cleanly

if __name__ == "__main__":
    main()
```

## run_every

`run_every(seconds, fn)` calls `fn()`, heartbeats your module (health strip `last_seen`),
sleeps, repeats. It **clamps intervals below 5 s to 5 s** (one hot loop must not flood the
shared feed/map/realtime channel for ten teams). Exceptions from `fn()` are caught and
logged; the loop survives. Only call `heartbeat(MODULE_ID)` yourself in custom loops.

## Reacting to other modules' signals

Reads on the shared `signals` table are public, and `wcc_impact` gives you two helpers —
the supported way for one module's loader to react to another module's signals:

```python
fetch_signals(*, module_id: str | None = None, signal_type: str | None = None,
              since: str | datetime | None = None, limit: int = 100) -> list[dict]
```

reads signals from the shared table (newest first), and

```python
on_new_signals(fn: Callable[[list[dict]], object], *, poll_seconds: float = 10,
               module_id: str | None = None, signal_type: str | None = None) -> NoReturn
```

is a polling trigger built on `run_every`: it keeps a `created_at` cursor and calls
`fn(new_rows)` whenever new matching signals arrive. The 5 s minimum interval applies.

## Politeness to public APIs

You're hitting civic infrastructure from a room of 50 people:

- **Poll slowly.** 60 s is plenty for RSS/status feeds; GeoNet/NZTA don't update
  per-second. `run_every(60, ...)`, not `run_every(5, ...)`.
- **Send a User-Agent** identifying the hackathon + your team (example above).
- **Use conditional requests / caching** where offered (ETag, `If-Modified-Since`);
  at minimum, dedupe so unchanged responses publish nothing.
- **Back off on errors** — `raise_for_status()` and let `run_every` skip the tick rather
  than hammering a 500ing endpoint; on 429, increase your interval.
- **Timeouts always** (`timeout=10`) so a hung request doesn't stall your heartbeat.

## Failure modes

`wcc_impact` raises `HackPlatformError` (readable message) — token missing, module
disabled, schema violation. Registration must succeed before signals insert. Loaders read
the repo-root `.env` automatically (python-dotenv, searching upward) — run from anywhere
inside the repo.
