"""Env loading + the shared Supabase client.

Loads the repo-root .env (python-dotenv, searching upward from the CWD) so
loaders never handle credentials directly, and attaches the room-only
``x-event-token`` header to every Supabase call when EVENT_TOKEN is set
(CONTRACTS.md §2-3). Without the token the client is read-only — RLS rejects
writes.
"""

from __future__ import annotations

import os

from dotenv import find_dotenv, load_dotenv

from .errors import HackPlatformError

_env_loaded = False
_client = None  # cached supabase.Client


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


def get_client():
    """Return the shared Supabase client (created once, x-event-token attached).

    Example:
        rows = get_client().table("signals").select("*").limit(5).execute().data
    """
    global _client
    if _client is not None:
        return _client

    url = get_env("SUPABASE_URL")
    key = get_env("SUPABASE_PUBLISHABLE_KEY")
    if not url or not key:
        raise HackPlatformError(
            "SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY are not set. "
            "Run `cp .env.example .env` at the repo root — those two values "
            "are prefilled."
        )

    from supabase import ClientOptions, create_client

    token = get_env("EVENT_TOKEN")
    if token:
        # Every write policy checks this header (CONTRACTS.md §3).
        options = ClientOptions(headers={"x-event-token": token})
        _client = create_client(url, key, options=options)
    else:
        # No token configured -> read-only mode; omit the header entirely.
        _client = create_client(url, key)
    return _client


def token_hint() -> str:
    """One-line hint appended to write errors — the usual cause is the token."""
    if get_env("EVENT_TOKEN"):
        return (
            "Check that your module is registered AND enabled "
            "(register_module first; organisers can disable modules), and that "
            "EVENT_TOKEN in .env matches the value on your check-in card."
        )
    return (
        "EVENT_TOKEN is empty in your .env — writes are rejected without it. "
        "Copy it from your check-in card into the repo-root .env."
    )
