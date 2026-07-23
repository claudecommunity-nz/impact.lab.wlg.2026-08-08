"""demo-seed loader — seeds the Wellington earthquake scenario AND demonstrates
the whole plugin system in one file.

Read this top-to-bottom as a worked example of what a module's Python loader can
do. Every team's loader follows the same shape:

    register_module(...)   # your tile appears on the dashboard
    run_every(seconds, tick)   # poll a source and publish_signal(...) forever

This module is bigger than most because it also bulk-seeds ~5,000 pre-authored
signals (data/earthquake_story.json) so the shared dashboard tells a real story
from minute one.

Run it (from the repo root):

    uv sync
    # seed the scenario once (idempotent — clears demo-seed's old signals first):
    uv run --directory modules/demo-seed/loader --package demo-seed-loader python -m src.main seed
    # or run the live loop (registers, seeds, then trickles aftershocks + heartbeats):
    uv run --directory modules/demo-seed/loader --package demo-seed-loader python -m src.main

CI contract (CONTRACTS.md §7): exposes main() and sample().
"""

from __future__ import annotations

import json
import random
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path

from wcc_impact import (
    geocode,
    heartbeat,
    module_table,
    publish_signal,
    register_module,
    run_every,
)
from wcc_impact._env import get_client, get_env

MODULE_ID = "demo-seed"

# The authored scenario. Each record carries `offset_min` = minutes after the
# 07:42 mainshock; the seeder turns that into an absolute created_at so the story
# always *ends now* (the last events are the freshest on the dashboard).
STORY_PATH = Path(__file__).resolve().parents[2] / "data" / "earthquake_story.json"
STORY_SPAN_MIN = 360  # the scenario runs 0–360 min; offset 360 == "now"


# ─────────────────────────────────────────────────────────────────────────────
# 1. Registration — this is what makes your tile appear on the dashboard.
# ─────────────────────────────────────────────────────────────────────────────
def register() -> None:
    """Upsert the module row. Called once at startup.

    register_module() never sends the `enabled` column — that's the organiser
    kill-switch, flipped in Supabase Studio. Keep the metadata in sync with
    module.config.ts; the dashboard tile shows both.
    """
    register_module(
        id=MODULE_ID,
        name="Module architecture",
        icon="box",  # a lucide icon name (see MODULE_ICON_NAMES)
        description=(
            "How module manifests, Python loaders, shared signals, and Plugin SDK "
            "interfaces fit together."
        ),
    )


# ─────────────────────────────────────────────────────────────────────────────
# 2. Bulk seed — load the authored story and write it to the shared signals table.
#    Real loaders rarely bulk-insert; this is a backfill. The live loop below is
#    the everyday pattern.
# ─────────────────────────────────────────────────────────────────────────────
def _load_story() -> list[dict]:
    if not STORY_PATH.exists():
        raise SystemExit(
            f"[demo-seed] {STORY_PATH} not found — generate it first (the batches "
            f"under data/batches are merged into it)."
        )
    rows = json.loads(STORY_PATH.read_text())
    rows.sort(key=lambda r: r.get("offset_min", 0))
    return rows


def _to_signal_row(rec: dict, now: datetime) -> dict:
    """Map an authored record to a signals-table row, anchoring the timeline to now."""
    offset = int(rec.get("offset_min", 0))
    created = now - timedelta(minutes=STORY_SPAN_MIN - offset)
    return {
        "module_id": MODULE_ID,
        "title": rec["title"],
        "description": rec.get("description"),
        "signal_type": rec.get("signal_type", "earthquake"),
        "source_type": rec.get("source_type", "official"),
        "source": rec.get("source"),
        "severity": rec.get("severity", "unknown"),
        "verification": rec.get("verification", "unverified"),
        "confidence": rec.get("confidence"),
        "lat": rec.get("lat"),
        "lng": rec.get("lng"),
        "place_name": rec.get("place_name"),
        "link": rec.get("link"),
        "created_at": created.isoformat(),
        "observed_at": created.isoformat(),
    }


def _clear_existing() -> None:
    """Delete this module's existing signals so a re-seed REPLACES, not appends.

    DELETE is service-role-only by design (normal module credentials cannot erase
    shared history). This backfill is
    an organiser operation, so it uses SUPABASE_SECRET_KEY directly for the clear
    (the ONLY privileged call in the platform; everyday loaders never do this).
    Without the secret key we CANNOT clear, so we refuse rather than silently
    duplicate the whole 5k-row scenario on every run.
    """
    url = get_env("SUPABASE_URL")
    secret = get_env("SUPABASE_SECRET_KEY")
    if not url or not secret:
        raise SystemExit(
            "[demo-seed] SUPABASE_SECRET_KEY not set — cannot clear old signals, "
            "and re-seeding without clearing would duplicate the whole scenario. "
            "Set SUPABASE_SECRET_KEY in .env (organiser-only), or clear manually:\n"
            "  delete from public.signals where module_id = 'demo-seed';"
        )
    from supabase import create_client

    admin = create_client(url, secret)
    print(f"[demo-seed] clearing old signals for {MODULE_ID} (service role) …")
    admin.table("signals").delete().eq("module_id", MODULE_ID).execute()


def seed() -> None:
    """Clear this module's old signals, then bulk-insert the full scenario.

    Inserts via the shared client (get_client(), which carries the event token)
    in batches — thousands of one-at-a-time publish_signal calls would be
    needlessly slow for a backfill. The clear step is privileged (see
    _clear_existing); everyday publishing just uses publish_signal() (see tick()).
    """
    _clear_existing()
    client = get_client()
    story = _load_story()
    now = datetime.now(UTC)
    rows = [_to_signal_row(r, now) for r in story]

    print(f"[demo-seed] seeding {len(rows)} signals across the 6-hour scenario …")
    BATCH = 500
    for i in range(0, len(rows), BATCH):
        client.table("signals").insert(rows[i : i + BATCH]).execute()
        print(f"  … {min(i + BATCH, len(rows))}/{len(rows)}")

    _seed_pins()
    print("[demo-seed] seed complete. The dashboard now tells the whole story.")


# ─────────────────────────────────────────────────────────────────────────────
# 2b. Module-owned table — this module's OWN Postgres table (public.m_demo_seed_pins,
#     defined in backend/schema.sql), written with the same event token as signals
#     via module_table(). Demonstrates per-module tables + realtime.
# ─────────────────────────────────────────────────────────────────────────────
_OPS_PINS = [
    ("cordon", "USAR cordon — Cuba St", "Facade collapse; footpath closed", -41.2945, 174.7720),
    ("staging", "Ambulance staging — Basin Reserve", "Casualty collection point", -41.3010, 174.7770),
    ("hazard", "Gas leak — Newtown", "Fire & Emergency on scene; avoid area", -41.3120, 174.7787),
    ("welfare", "Welfare centre — TSB Arena", "Open; capacity ~800", -41.2865, 174.7810),
]


def _seed_pins() -> None:
    """Replace this module's ops pins with a fresh set (organiser clear + insert)."""
    tbl = module_table(MODULE_ID, "pins")
    # A plain filtered delete works here because these rows are ours and the delete
    # policy is module-scoped like inserts; keep it simple for the demo backfill.
    try:
        tbl.delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()
    except Exception:
        pass  # table may be empty / first run
    rows = [
        {"kind": k, "label": lbl, "note": note, "lat": lat, "lng": lng}
        for (k, lbl, note, lat, lng) in _OPS_PINS
    ]
    module_table(MODULE_ID, "pins").insert(rows).execute()
    print(f"[demo-seed] seeded {len(rows)} ops pins into m_demo_seed_pins")


# ─────────────────────────────────────────────────────────────────────────────
# 3. The everyday pattern — a polling loop. This is what a real module does:
#    fetch a source, publish new signals, heartbeat, repeat.
# ─────────────────────────────────────────────────────────────────────────────
_AFTERSHOCK_AREAS = [
    ("Wellington CBD", -41.2865, 174.7762),
    ("Petone", -41.2230, 174.8700),
    ("Seaview", -41.2400, 174.9080),
    ("Miramar", -41.3150, 174.8160),
]


def sample() -> dict:
    """One representative signal payload (NOT inserted). CI validates this against
    schema/signal.schema.json.
    """
    lat, lng = geocode("Wellington CBD") or (-41.2865, 174.7762)
    return {
        "module_id": MODULE_ID,
        "title": "M3.8 aftershock, 8 km deep, near Wellington",
        "signal_type": "aftershock",
        "source_type": "sensor",
        "source": "GeoNet seismograph",
        "description": "Light shaking felt across the region. No new damage reported.",
        "severity": "minor",
        "verification": "verified",
        "confidence": 0.97,
        "lat": lat,
        "lng": lng,
        "place_name": "Wellington CBD",
    }


def tick() -> None:
    """One polling cycle: publish a fresh aftershock.

    This is the SDK's core write path — publish_signal() validates the payload and
    inserts it (the SDK attaches the event token for you). run_every() heartbeats
    each tick, so the dashboard's health strip stays green.
    """
    place, lat, lng = random.choice(_AFTERSHOCK_AREAS)
    mag = round(random.uniform(2.5, 4.2), 1)
    row = publish_signal(
        module_id=MODULE_ID,
        title=f"M{mag} aftershock near {place}",
        signal_type="aftershock",
        source_type="sensor",
        source="GeoNet seismograph",
        description=f"Aftershock recorded near {place}. Part of the ongoing sequence.",
        severity="minor" if mag < 3.5 else "moderate",
        verification="verified",
        confidence=0.96,
        lat=lat,
        lng=lng,
        place_name=place,
    )
    print(f"[demo-seed] published aftershock {row.get('id')}")


# ─────────────────────────────────────────────────────────────────────────────
# 4. Entrypoint — register, seed once, then poll forever (the scheduling pattern).
# ─────────────────────────────────────────────────────────────────────────────
def main() -> None:
    """`python -m src.main` runs the live loop; `… src.main seed` just backfills.

    run_every(seconds, tick) is the platform's scheduler: it calls tick() on a
    fixed interval (clamped to a 5-second floor so one loader can't flood the
    shared feed), heartbeats each cycle, catches exceptions so a bad tick doesn't
    kill the loop, and exits cleanly on Ctrl-C. In production these loaders run
    wherever WCC runs Python (Azure Functions / Container Apps) on a schedule.
    """
    if len(sys.argv) > 1 and sys.argv[1] == "seed":
        register()
        seed()
        return

    register()
    seed()
    # Then keep the story alive: a fresh aftershock roughly every 45s.
    run_every(45, tick)


if __name__ == "__main__":
    main()
