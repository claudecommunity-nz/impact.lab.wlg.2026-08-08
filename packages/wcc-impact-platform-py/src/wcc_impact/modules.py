"""register_module + heartbeat — the `modules` table half of the contract.

The `modules` row is what makes your dashboard tile appear and feeds the
health strip. IMPORTANT: client payloads must NEVER include the `enabled`
column — it is the organiser kill-switch, service-role-only, and PostgREST
upserts would try to write every payload column (CONTRACTS.md §4).
"""

from __future__ import annotations

from datetime import UTC, datetime

from ._env import get_client, token_hint
from .errors import HackPlatformError

# Set by register_module; run_every() heartbeats it automatically each tick.
_current_module_id: str | None = None


def register_module(
    *,
    id: str,
    name: str,
    icon: str | None = None,
    description: str | None = None,
) -> dict:
    """Upsert this module into the modules registry; returns the module row.

    The dashboard tile appears the moment this succeeds (the registry table is
    realtime). Call it once at the top of your loader's main(). Never sends
    `enabled` or `updated_at` (service-role/trigger-owned).

    Example:
        register_module(id="team-outage-watch", name="Outage Watch",
                        icon="radio-tower", description="Telco outage detection")
    """
    payload: dict = {"id": id, "name": name}
    if icon is not None:
        payload["icon"] = icon
    if description is not None:
        payload["description"] = description
    # Deliberately no `enabled` / `updated_at` — see module docstring.

    try:
        res = get_client(id).table("modules").upsert(payload).execute()
    except Exception as e:
        raise HackPlatformError(
            f"Module upsert rejected: {e}. {token_hint(id)}"
        ) from e
    if not res.data:
        raise HackPlatformError(f"Module upsert returned no row. {token_hint(id)}")

    global _current_module_id
    _current_module_id = id
    return res.data[0]


def heartbeat(module_id: str) -> None:
    """Update modules.last_seen = now() for the health strip.

    run_every() calls this automatically each tick (for the module you last
    registered) — call it yourself only in custom loops.

    Example:
        heartbeat("team-outage-watch")
    """
    try:
        res = (
            get_client(module_id)
            .table("modules")
            .update({"last_seen": datetime.now(UTC).isoformat()})
            .eq("id", module_id)
            .execute()
        )
    except Exception as e:
        raise HackPlatformError(f"Heartbeat failed: {e}. {token_hint(module_id)}") from e
    # A 0-row update is a silent no-op (loader looks alive but the strip never
    # updates): usually the module_id is wrong or the token was rotated.
    if not res.data:
        print(
            f"[wcc_impact] heartbeat matched no row for module {module_id!r} "
            f"— module missing or credential mismatch. {token_hint(module_id)}"
        )
