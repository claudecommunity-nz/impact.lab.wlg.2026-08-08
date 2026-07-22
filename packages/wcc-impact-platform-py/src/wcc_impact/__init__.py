"""wcc_impact — loader-side helpers for the WCC Emergency Hack.

The Python mirror of @wcc-impact/plugin-sdk (PLAN §5, CONTRACTS.md §7). Reads env
from the repo-root .env automatically and attaches the x-event-token to every
Supabase write — you never handle credentials in code.

Typical loader (modules/<team>/loader/src/main.py):

    from wcc_impact import register_module, publish_signal, run_every, geocode

    MODULE_ID = "team-outage-watch"

    def poll():
        latlng = geocode("Karori")
        publish_signal(module_id=MODULE_ID, title="Cell site down in Karori",
                       signal_type="outage", source_type="official",
                       lat=latlng[0] if latlng else None,
                       lng=latlng[1] if latlng else None,
                       severity="moderate")

    def main():
        register_module(id=MODULE_ID, name="Outage Watch", icon="radio-tower")
        run_every(60, poll)

All functions raise wcc_impact.HackPlatformError (a RuntimeError) with a
readable message on failure.
"""

from .ai import DEFAULT_MODEL, analyze_image, ask_claude
from .errors import HackPlatformError
from .geocode import geocode
from .loop import MIN_INTERVAL_SECONDS, run_every
from .modules import heartbeat, register_module
from .signals import SEVERITIES, SOURCE_TYPES, VERIFICATIONS, Signal, publish_signal
from .storage import upload_file
from .tables import module_table, module_table_name, module_table_prefix

__all__ = [
    "DEFAULT_MODEL",
    "HackPlatformError",
    "MIN_INTERVAL_SECONDS",
    "SEVERITIES",
    "SOURCE_TYPES",
    "Signal",
    "VERIFICATIONS",
    "analyze_image",
    "ask_claude",
    "geocode",
    "heartbeat",
    "module_table",
    "module_table_name",
    "module_table_prefix",
    "publish_signal",
    "register_module",
    "run_every",
    "upload_file",
]
