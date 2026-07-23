"""Durable SQLite outbox for loader signal publishing.

The outbox is deliberately local: loaders run on participant laptops and must
survive venue-WiFi outages and process restarts without needing another service.
Rows are drained oldest-first. A failed oldest row blocks newer rows until its
bounded exponential backoff expires, preserving the order in which a loader
observed events.
"""

from __future__ import annotations

import json
import random
import re
import sqlite3
import time
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Callable

from dotenv import find_dotenv

from ._env import get_env
from .errors import HackPlatformError

BASE_RETRY_SECONDS = 2.0
MAX_RETRY_SECONDS = 60.0
RETRY_JITTER = 0.25
DEFAULT_FLUSH_LIMIT = 100
_SCHEMA_VERSION = 1


@dataclass(frozen=True)
class QueueHealth:
    """Safe queue state suitable for the public module registry."""

    depth: int
    oldest_queued_at: str | None
    next_attempt_at: str | None
    last_success_at: str | None
    last_error: str | None
    dead_letters: int

    def as_dict(self) -> dict:
        return {
            "depth": self.depth,
            "oldest_queued_at": self.oldest_queued_at,
            "next_attempt_at": self.next_attempt_at,
            "last_success_at": self.last_success_at,
            "last_error": self.last_error,
            "dead_letters": self.dead_letters,
        }


@dataclass(frozen=True)
class FlushResult:
    """Rows delivered during one bounded drain plus the resulting health."""

    sent: dict[str, dict]
    health: QueueHealth


def durable_signals_enabled(explicit: bool | None) -> bool:
    """Resolve the durable mode flag.

    Durability is on by default for the event. Set
    ``WCC_IMPACT_DURABLE_SIGNALS=0`` or pass ``durable=False`` for the old
    immediate-write-and-raise behaviour.
    """

    if explicit is not None:
        return explicit
    value = (get_env("WCC_IMPACT_DURABLE_SIGNALS") or "1").lower()
    return value not in {"0", "false", "no", "off"}


def outbox_path(module_id: str) -> Path:
    """Return the per-module spool path, with an env override for tests/tools."""

    configured = get_env("WCC_IMPACT_OUTBOX_PATH")
    if configured:
        return Path(configured).expanduser().resolve()

    env_path = find_dotenv(usecwd=True)
    root = Path(env_path).resolve().parent if env_path else Path.cwd().resolve()
    safe_id = re.sub(r"[^a-zA-Z0-9_.-]+", "_", module_id)
    return root / ".wcc-impact" / f"{safe_id}-signals.sqlite3"


def enqueue(path: Path, payload: dict, idempotency_key: str) -> bool:
    """Persist a payload once. Returns False when the key is already queued."""

    with _connect(path) as conn:
        before = conn.total_changes
        conn.execute(
            """
            insert or ignore into signal_outbox
              (idempotency_key, module_id, payload_json, enqueued_at)
            values (?, ?, ?, ?)
            """,
            (
                idempotency_key,
                payload["module_id"],
                json.dumps(payload, separators=(",", ":"), sort_keys=True),
                time.time(),
            ),
        )
        return conn.total_changes > before


def drain(
    path: Path,
    sender: Callable[[dict], dict],
    *,
    limit: int = DEFAULT_FLUSH_LIMIT,
    now: Callable[[], float] = time.time,
    jitter: Callable[[], float] = random.random,
) -> FlushResult:
    """Send ready rows oldest-first, stopping after the first network failure."""

    if isinstance(limit, bool) or not isinstance(limit, int) or limit < 1:
        raise HackPlatformError("signal queue flush limit must be a positive integer")

    sent: dict[str, dict] = {}
    with _connect(path) as conn:
        while len(sent) < limit:
            row = conn.execute(
                """
                select id, idempotency_key, payload_json, attempts, next_attempt_at
                from signal_outbox
                order by id
                limit 1
                """
            ).fetchone()
            if row is None or row["next_attempt_at"] > now():
                break

            try:
                payload = json.loads(row["payload_json"])
                if not isinstance(payload, dict):
                    raise ValueError("queued payload is not a JSON object")
            except (json.JSONDecodeError, TypeError, ValueError) as error:
                _dead_letter(conn, row, f"Corrupt queued signal: {error}", now())
                continue

            try:
                result = sender(payload)
            except Exception as error:
                attempts = int(row["attempts"]) + 1
                base = min(
                    MAX_RETRY_SECONDS,
                    BASE_RETRY_SECONDS * (2 ** min(attempts - 1, 20)),
                )
                delay = min(
                    MAX_RETRY_SECONDS,
                    max(0.0, base * (1 - RETRY_JITTER + (2 * RETRY_JITTER * jitter()))),
                )
                message = _bounded_error(error)
                conn.execute(
                    """
                    update signal_outbox
                    set attempts = ?, next_attempt_at = ?, last_error = ?
                    where id = ?
                    """,
                    (attempts, now() + delay, message, row["id"]),
                )
                _set_meta(conn, "last_error", message)
                break

            sent[row["idempotency_key"]] = result
            conn.execute("delete from signal_outbox where id = ?", (row["id"],))
            _set_meta(conn, "last_success_at", str(now()))

        return FlushResult(sent=sent, health=_health(conn))


def health(path: Path, *, create: bool = True) -> QueueHealth:
    """Read current queue health. A missing optional queue is an empty queue."""

    if not create and not path.exists():
        return QueueHealth(0, None, None, None, None, 0)
    with _connect(path) as conn:
        return _health(conn)


def _connect(path: Path) -> sqlite3.Connection:
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        conn = sqlite3.connect(path, timeout=5)
        conn.row_factory = sqlite3.Row
        conn.execute("pragma busy_timeout = 5000")
        conn.execute("pragma journal_mode = wal")
        _initialise(conn)
        return conn
    except sqlite3.DatabaseError as error:
        try:
            conn.close()
        except UnboundLocalError:
            pass
        backup = _recover_corrupt_database(path)
        print(
            f"[wcc_impact] corrupt signal spool moved to {backup}; "
            "a clean queue was created"
        )
        conn = sqlite3.connect(path, timeout=5)
        conn.row_factory = sqlite3.Row
        conn.execute("pragma busy_timeout = 5000")
        conn.execute("pragma journal_mode = wal")
        _initialise(conn)
        _set_meta(conn, "last_error", _bounded_error(error))
        return conn


def _initialise(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        create table if not exists signal_outbox (
          id integer primary key autoincrement,
          idempotency_key text not null unique,
          module_id text not null,
          payload_json text not null,
          enqueued_at real not null,
          attempts integer not null default 0,
          next_attempt_at real not null default 0,
          last_error text
        );

        create table if not exists signal_outbox_dead_letters (
          id integer primary key autoincrement,
          idempotency_key text,
          payload_json text not null,
          error text not null,
          failed_at real not null
        );

        create table if not exists signal_outbox_meta (
          key text primary key,
          value text
        );

        pragma user_version = 1;
        """
    )
    version = conn.execute("pragma user_version").fetchone()[0]
    if version != _SCHEMA_VERSION:
        raise sqlite3.DatabaseError(
            f"unsupported signal spool schema version {version}"
        )


def _recover_corrupt_database(path: Path) -> Path:
    stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    backup = path.with_name(f"{path.name}.corrupt-{stamp}")
    counter = 1
    while backup.exists():
        backup = path.with_name(f"{path.name}.corrupt-{stamp}-{counter}")
        counter += 1
    if path.exists():
        path.replace(backup)
    for suffix in ("-wal", "-shm"):
        sidecar = Path(f"{path}{suffix}")
        if sidecar.exists():
            sidecar.replace(Path(f"{backup}{suffix}"))
    return backup


def _dead_letter(
    conn: sqlite3.Connection,
    row: sqlite3.Row,
    message: str,
    failed_at: float,
) -> None:
    conn.execute(
        """
        insert into signal_outbox_dead_letters
          (idempotency_key, payload_json, error, failed_at)
        values (?, ?, ?, ?)
        """,
        (row["idempotency_key"], row["payload_json"], message, failed_at),
    )
    conn.execute("delete from signal_outbox where id = ?", (row["id"],))
    _set_meta(conn, "last_error", message)


def _health(conn: sqlite3.Connection) -> QueueHealth:
    row = conn.execute(
        """
        select count(*) as depth, min(enqueued_at) as oldest,
               min(next_attempt_at) as next_attempt
        from signal_outbox
        """
    ).fetchone()
    dead_letters = conn.execute(
        "select count(*) from signal_outbox_dead_letters"
    ).fetchone()[0]
    return QueueHealth(
        depth=int(row["depth"]),
        oldest_queued_at=_iso(row["oldest"]),
        next_attempt_at=_iso(row["next_attempt"]) if row["depth"] else None,
        last_success_at=_iso(_meta_float(conn, "last_success_at")),
        last_error=_get_meta(conn, "last_error"),
        dead_letters=int(dead_letters),
    )


def _get_meta(conn: sqlite3.Connection, key: str) -> str | None:
    row = conn.execute(
        "select value from signal_outbox_meta where key = ?", (key,)
    ).fetchone()
    return row["value"] if row else None


def _meta_float(conn: sqlite3.Connection, key: str) -> float | None:
    value = _get_meta(conn, key)
    try:
        return float(value) if value is not None else None
    except ValueError:
        return None


def _set_meta(conn: sqlite3.Connection, key: str, value: str) -> None:
    conn.execute(
        """
        insert into signal_outbox_meta (key, value) values (?, ?)
        on conflict (key) do update set value = excluded.value
        """,
        (key, value),
    )


def _iso(value: float | None) -> str | None:
    if value is None:
        return None
    return datetime.fromtimestamp(value, UTC).isoformat()


def _bounded_error(error: Exception) -> str:
    message = f"{type(error).__name__}: {error}".replace("\x00", "")
    for name in (
        "EVENT_TOKEN",
        "SUPABASE_PUBLISHABLE_KEY",
        "ANTHROPIC_API_KEY",
        "SUPABASE_ACCESS_TOKEN",
        "GITHUB_TOKEN",
    ):
        value = get_env(name)
        if value and len(value) >= 4:
            message = message.replace(value, "[redacted]")
    message = re.sub(
        r"(?:sk-ant-|sb_secret_)[A-Za-z0-9_-]{12,}",
        "[redacted]",
        message,
    )
    message = re.sub(
        r"postgresql://[^@\s]+@",
        "postgresql://[redacted]@",
        message,
    )
    return message[:500]
