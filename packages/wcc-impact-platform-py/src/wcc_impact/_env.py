"""Env loading + module-scoped Supabase clients.

Loads the repo-root .env (python-dotenv, searching upward from the CWD) so
loaders never handle credentials in code. ``MODULE_TOKEN`` is attached as
``x-module-token`` and resolves to exactly one module in RLS. ``EVENT_TOKEN``
is accepted only during an organiser-opened legacy migration window; helper
writes also attach their target ``x-module-id``. Without either token the
client is read-only.
"""

from __future__ import annotations

import os

from dotenv import find_dotenv, load_dotenv

from .errors import HackPlatformError

_env_loaded = False
_clients: dict[str, object] = {}  # module-id-specific only for legacy headers


def load_env() -> None:
    """Load the repo-root .env once (searches upward from the CWD).

    Called automatically by every helper — you normally never call this.

    Example:
        load_env(); print(os.environ.get("SUPABASE_URL"))
    """
    global _env_loaded
    if not _env_loaded:
        # usecwd=True: search from where the loader runs, walking up to repo root.
        load_dotenv(find_dotenv(usecwd=True), override=False)
        _env_loaded = True


def get_env(name: str) -> str | None:
    """Return an env var after ensuring .env is loaded. None if unset/empty."""
    load_env()
    value = os.environ.get(name, "").strip()
    return value or None


def get_client(module_id: str | None = None):
    """Return a cached Supabase client with least-privilege write headers.

    Example:
        rows = get_client().table("signals").select("*").limit(5).execute().data
    """
    cache_key = module_id or "__read_only__"
    if cache_key in _clients:
        return _clients[cache_key]

    url = get_env("SUPABASE_URL")
    key = get_env("SUPABASE_PUBLISHABLE_KEY")
    if not url or not key:
        raise HackPlatformError(
            "SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY are not set. "
            "Run `cp .env.example .env` at the repo root — those two values "
            "are prefilled."
        )

    from supabase import ClientOptions, create_client

    module_token = get_env("MODULE_TOKEN")
    legacy_token = get_env("EVENT_TOKEN")
    if module_id and module_token:
        options = ClientOptions(headers={"x-module-token": module_token})
        client = create_client(url, key, options=options)
    elif module_id and legacy_token:
        # Migration-only: RLS also requires the helper's exact target module id
        # and an organiser-opened, time-bounded legacy window.
        headers = {"x-event-token": legacy_token}
        headers["x-module-id"] = module_id
        options = ClientOptions(headers=headers)
        client = create_client(url, key, options=options)
    else:
        # Public reads never carry a module or legacy credential.
        client = create_client(url, key)
    _clients[cache_key] = client
    return client


def token_hint(module_id: str | None = None) -> str:
    """One-line hint appended to write errors."""
    if get_env("MODULE_TOKEN"):
        return (
            f"Check that MODULE_TOKEN belongs to {module_id or 'this module'}, "
            "that it has not been rotated/revoked, and that the module is enabled."
        )
    if get_env("EVENT_TOKEN"):
        return (
            "EVENT_TOKEN is legacy-only. Ask an organiser for this team's "
            "MODULE_TOKEN, or confirm that the short migration window is open."
        )
    return (
        "MODULE_TOKEN is empty in your .env — writes are rejected without it. "
        "Copy this team's token from its check-in card into the repo-root .env."
    )
