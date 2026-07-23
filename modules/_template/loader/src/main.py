"""__MODULE_NAME__ hello loader (module id: __MODULE_ID__).

Registers the module (your dashboard tile appears the moment that succeeds),
then publishes a hello signal every 30 seconds so you can see the whole path
working: loader -> signals table -> shared map + feed. Replace tick() with
real data fetching — see the loader-patterns and publish-signals skills.

Run it (from the repo root):

    uv sync
    uv run --directory modules/__MODULE_ID__/loader --package __MODULE_ID__-loader python -m src.main

CI contract (CONTRACTS.md §7): this file must expose main() and sample().
"""

from wcc_impact import geocode, publish_signal, register_module, run_every

MODULE_ID = "__MODULE_ID__"  # = folder name; module_id on signals + storage prefix


def sample() -> dict:
    """Return one representative signal payload WITHOUT inserting it.

    CI validates this dict against schema/signal.schema.json (the contract
    smoke test), so keep it in sync with what tick() actually publishes.

    Example:
        payload = sample()
        assert payload["module_id"] == MODULE_ID
    """
    # geocode() checks the built-in Wellington gazetteer first (no network).
    lat, lng = geocode("Ōwhiro Bay") or (-41.3455, 174.7597)
    return {
        "module_id": MODULE_ID,
        "title": "Hello from __MODULE_NAME__",
        "signal_type": "hello",  # kebab-case category; also drives homeStat.signalType
        "source_type": "sensor",  # official | community | media | sensor
        "source": "hello loader",
        "description": "Scaffold smoke-test signal — replace tick() with real data.",
        "lat": lat,
        "lng": lng,
        "place_name": "Ōwhiro Bay",
        "severity": "minor",  # minor | moderate | severe | extreme | unknown
    }


def tick() -> None:
    """One polling cycle: publish the hello signal.

    run_every() already calls heartbeat() for us each tick, so this only needs
    to do the work. Exceptions are caught and logged by run_every — the loop
    survives a bad cycle.

    Example:
        tick()  # inserts one row into the shared signals table
    """
    row = publish_signal(**sample())
    print(f"published: {row.get('title')!r} (id {row.get('id')})")


def main() -> None:
    """Entrypoint: register with the platform, then poll forever.

    register_module() upserts the modules-table row (never the `enabled`
    column — that's the organiser kill-switch). Keep the metadata here in
    sync with module.config.ts: the dashboard tile shows both.

    Example:
        uv run --directory modules/__MODULE_ID__/loader --package __MODULE_ID__-loader python -m src.main
    """
    register_module(
        id=MODULE_ID,
        name="__MODULE_NAME__",
        icon="box",
        description="Hello module scaffolded from _template — replace with what your module actually does.",
    )
    # 30s is polite for a hello loop; run_every enforces a 5s floor regardless.
    run_every(30, tick)


if __name__ == "__main__":
    main()
