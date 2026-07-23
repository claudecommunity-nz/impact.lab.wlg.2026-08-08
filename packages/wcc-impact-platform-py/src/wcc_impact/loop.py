"""run_every — the polite polling loop every loader should use.

Enforces the platform-wide 5-second floor (PLAN §8): one hot loop must not be
able to flood the shared feed, map, and realtime channel for all ten teams.
Values below 5 are clamped up to 5 with a printed warning (per CONTRACTS/skills/
AGENTS), so a slightly-too-eager interval keeps polling instead of crashing.
"""

from __future__ import annotations

import random
import time
import traceback
from typing import Callable

from . import modules, signals
from .errors import HackPlatformError

MIN_INTERVAL_SECONDS = 5.0


def run_every(
    seconds: float,
    fn: Callable[[], object],
    *,
    run_immediately: bool = True,
) -> None:
    """Polling loop: call fn(), heartbeat, sleep (with jitter), repeat forever.

    - ENFORCES A 5-SECOND MINIMUM interval — clamps up to 5s (with a warning).
    - Exceptions from fn() are caught and printed; the loop continues.
    - Heartbeats the module you last register_module()'d on every tick, and
      keeps heartbeating (~every 60s) while waiting out a long interval so slow
      pollers stay green on the health strip.
    - Sleep is jittered (+0-10%) so ten team loops don't thump in sync.
    - Ctrl-C exits cleanly (no traceback).

    Example:
        def poll_feed():
            ...fetch + publish_signal(...)...
        register_module(id="team-outage-watch", name="Outage Watch")
        run_every(60, poll_feed)   # poll once a minute, forever
    """
    if seconds < MIN_INTERVAL_SECONDS:
        # Clamp (don't crash): the floor protects the shared feed/map/realtime
        # channel for every team, but an over-eager interval shouldn't kill the
        # loader outright.
        print(
            f"[wcc_impact] run_every interval {seconds:g}s below 5s floor "
            f"— clamped to {MIN_INTERVAL_SECONDS:.0f}s"
        )
        seconds = MIN_INTERVAL_SECONDS

    try:
        if not run_immediately:
            _heartbeating_sleep(seconds)
        while True:
            try:
                fn()
            except KeyboardInterrupt:
                raise
            except Exception:
                print("[wcc_impact] fn() raised — loop continues:")
                traceback.print_exc()
            _heartbeating_sleep(seconds)
    except KeyboardInterrupt:
        print("\n[wcc_impact] run_every stopped (Ctrl-C). Bye!")


def on_new_signals(
    fn: Callable[[list[dict]], object],
    *,
    poll_seconds: float = 10.0,
    module_id: str | None = None,
    signal_type: str | None = None,
) -> None:
    """Polling trigger: call fn(new_rows) whenever new matching signals arrive.

    Built on run_every (5 s floor, heartbeats, jitter, Ctrl-C) + a created_at
    cursor. Existing rows are not replayed; new rows are delivered oldest-first
    with at-least-once semantics. The cursor advances only after ``fn`` returns,
    so a failed handler receives the same batch again and should be idempotent.
    This is the loader-side "react to another module's signals" hook.

    Example:
        def enrich(rows):
            for row in rows:
                publish_signal(module_id=MODULE_ID,
                               title=f"Assessed: {row['title']}",
                               signal_type="assessment", source_type="official")
        register_module(id=MODULE_ID, name="Assessor")
        on_new_signals(enrich, signal_type="flooding", poll_seconds=15)
    """
    baseline = signals.fetch_signals(
        module_id=module_id,
        signal_type=signal_type,
        limit=1,
    )
    cursor = (
        baseline[0]["created_at"]
        if baseline
        else "1970-01-01T00:00:00+00:00"
    )

    def tick() -> None:
        nonlocal cursor
        rows = signals.fetch_signals(
            module_id=module_id,
            signal_type=signal_type,
            since=cursor,
            limit=200,
            oldest_first=True,
        )
        if not rows:
            return
        fn(rows)
        cursor = max(r["created_at"] for r in rows)

    run_every(poll_seconds, tick)


_HEARTBEAT_EVERY = 60.0  # keep the health strip green while waiting out a long interval


def _heartbeating_sleep(seconds: float) -> None:
    """Sleep out the (jittered) interval, heartbeating at most ~every 60s.

    A polite 3-5min poller would otherwise heartbeat once per tick and go amber/
    red on the health strip between polls; chunking the wait keeps it green.
    """
    remaining = seconds + random.uniform(0, seconds * 0.1)
    while remaining > 0:
        _maybe_heartbeat()
        chunk = min(_HEARTBEAT_EVERY, remaining)
        time.sleep(chunk)
        remaining -= chunk


def _maybe_heartbeat() -> None:
    """Heartbeat the registered module; never let a network blip kill the loop."""
    module_id = modules._current_module_id
    if module_id is None:
        return
    try:
        modules.heartbeat(module_id)
    except HackPlatformError as e:
        print(f"[wcc_impact] heartbeat failed (loop continues): {e}")
