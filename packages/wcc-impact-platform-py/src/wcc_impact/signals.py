"""publish_signal + the pydantic mirror of the Signal contract.

NOTE: /schema/signal.schema.json is the SINGLE SOURCE OF TRUTH for the signal
shape. The ``Signal`` model below mirrors it field-for-field so loaders get a
readable validation error *before* the row hits the database — if the two ever
disagree, the JSON Schema wins and this file must be updated.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone, tzinfo
from pathlib import Path
from typing import Literal
from uuid import uuid4
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from . import outbox
from ._env import get_client, token_hint
from .errors import HackPlatformError

SOURCE_TYPES = ("official", "community", "media", "sensor")
SEVERITIES = ("minor", "moderate", "severe", "extreme", "unknown")
VERIFICATIONS = ("unverified", "corroborated", "verified", "false_report")


class Signal(BaseModel):
    """Pydantic mirror of /schema/signal.schema.json (the source of truth)."""

    model_config = ConfigDict(extra="forbid")  # additionalProperties: false

    # db-generated — never supply on insert
    id: str | None = None
    created_at: datetime | None = None
    idempotency_key: str | None = Field(default=None, min_length=1, max_length=200)

    title: str = Field(min_length=1, max_length=200)
    signal_type: str = Field(min_length=1, max_length=100)
    source_type: Literal["official", "community", "media", "sensor"]
    module_id: str = Field(min_length=1, max_length=100)

    source: str | None = Field(default=None, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    lat: float | None = Field(default=None, ge=-90, le=90)
    lng: float | None = Field(default=None, ge=-180, le=180)
    place_name: str | None = Field(default=None, max_length=200)
    severity: Literal["minor", "moderate", "severe", "extreme", "unknown"] = "unknown"
    verification: Literal[
        "unverified", "corroborated", "verified", "false_report"
    ] = "unverified"
    confidence: float | None = Field(default=None, ge=0, le=1)
    link: str | None = Field(default=None, max_length=2000)
    media_urls: list[str] = Field(default_factory=list)
    observed_at: datetime | None = None
    reported_at: datetime | None = None
    raw: dict | None = None


def publish_signal(
    *,
    module_id: str,
    title: str,
    signal_type: str,
    source_type: str,
    source: str | None = None,
    description: str | None = None,
    lat: float | None = None,
    lng: float | None = None,
    place_name: str | None = None,
    severity: str = "unknown",
    verification: str = "unverified",
    confidence: float | None = None,
    link: str | None = None,
    media_urls: list[str] | None = None,
    observed_at: str | datetime | None = None,
    reported_at: str | datetime | None = None,
    raw: dict | None = None,
    idempotency_key: str | None = None,
    durable: bool | None = None,
) -> dict:
    """Validate and publish a signal, durably by default.

    Durable mode persists the validated payload to a per-module SQLite outbox
    before attempting the network. A failed write returns a ``{"queued": True,
    ...}`` receipt; ``run_every`` retries it oldest-first after bounded backoff
    and across process restarts. Pass a stable ``idempotency_key`` derived from
    the upstream item to deduplicate it across polls, or let durable mode make a
    UUID for reliable transport retries. Pass ``durable=False`` for the legacy
    immediate-write-and-raise behaviour.

    Example:
        publish_signal(module_id="team-coast-watch",
                       title="Waves over the road at Ōwhiro Bay",
                       signal_type="coastal-hazard", source_type="community",
                       lat=-41.3455, lng=174.7597, severity="severe")
    """
    durable_mode = outbox.durable_signals_enabled(durable)
    if durable_mode and idempotency_key is None:
        idempotency_key = str(uuid4())

    try:
        signal = Signal(
            module_id=module_id,
            title=title,
            signal_type=signal_type,
            source_type=source_type,  # type: ignore[arg-type]
            source=source,
            description=description,
            lat=lat,
            lng=lng,
            place_name=place_name,
            severity=severity,  # type: ignore[arg-type]
            verification=verification,  # type: ignore[arg-type]
            confidence=confidence,
            link=link,
            media_urls=media_urls or [],
            observed_at=_parse_dt(observed_at),
            reported_at=_parse_dt(reported_at),
            raw=raw,
            idempotency_key=idempotency_key,
        )
    except ValidationError as e:
        raise HackPlatformError(f"Signal failed validation:\n{e}") from e

    payload = signal.model_dump(
        mode="json", exclude_none=True, exclude={"id", "created_at"}
    )

    if not durable_mode:
        return _insert_payload(payload)

    key = signal.idempotency_key
    assert key is not None  # generated above; keeps the queue identity stable
    path = outbox.outbox_path(module_id)
    try:
        outbox.enqueue(path, payload, key)
    except Exception as error:
        raise HackPlatformError(
            f"Could not persist signal to the durable outbox at {path}: {error}"
        ) from error

    flushed = _flush_path(module_id, path)
    if key in flushed.sent:
        return flushed.sent[key]

    receipt = {
        "queued": True,
        "idempotency_key": key,
        "module_id": module_id,
        "title": signal.title,
        "queue_depth": flushed.health.depth,
        "queue_oldest_at": flushed.health.oldest_queued_at,
        "last_error": flushed.health.last_error,
    }
    print(
        f"[wcc_impact] signal queued for retry "
        f"(module={module_id}, depth={flushed.health.depth}, key={key})"
    )
    return receipt


def flush_signal_queue(
    module_id: str,
    *,
    limit: int = outbox.DEFAULT_FLUSH_LIMIT,
) -> dict:
    """Attempt a bounded oldest-first drain and return public queue health.

    ``run_every`` calls this automatically. Custom loops may call it after
    reconnecting; failures stay queued and are reflected in ``last_error``.
    """

    path = outbox.outbox_path(module_id)
    result = _flush_path(module_id, path, limit=limit)
    return {"sent": len(result.sent), **result.health.as_dict()}


def signal_queue_health(module_id: str) -> dict:
    """Return local queue depth/timestamps/error state without sending rows."""

    health = outbox.health(outbox.outbox_path(module_id))
    return health.as_dict()


def _flush_signal_queue_if_present(module_id: str) -> None:
    """Internal loop hook: avoid creating a spool for loaders that opted out."""

    path = outbox.outbox_path(module_id)
    if path.exists():
        _flush_path(module_id, path)


def _flush_path(
    module_id: str,
    path: Path,
    *,
    limit: int = outbox.DEFAULT_FLUSH_LIMIT,
) -> outbox.FlushResult:
    result = outbox.drain(path, _insert_payload, limit=limit)
    _sync_queue_health(module_id, result.health)
    return result


def _sync_queue_health(module_id: str, health: outbox.QueueHealth) -> None:
    """Best-effort mirror into modules; local SQLite remains authoritative."""

    payload = {
        "queue_depth": health.depth,
        "queue_oldest_at": health.oldest_queued_at,
        "queue_last_success_at": health.last_success_at,
        "queue_last_error": health.last_error,
        "queue_dead_letters": health.dead_letters,
        "queue_updated_at": datetime.now(timezone.utc).isoformat(),
    }
    try:
        get_client().table("modules").update(payload).eq("id", module_id).execute()
    except Exception:
        # The most likely reason queue health cannot sync is the same outage
        # that caused the queue. The next successful drain publishes it.
        pass


def _insert_payload(payload: dict) -> dict:
    """Insert once, resolving an ambiguous/duplicate result by stable key."""

    try:
        res = get_client().table("signals").insert(payload).execute()
    except Exception as e:  # supabase/postgrest raise assorted exception types
        existing = _existing_idempotent_row(payload)
        if existing is not None:
            return existing
        raise HackPlatformError(
            f"Insert into signals rejected: {e}. {token_hint()}"
        ) from e
    if not res.data:
        existing = _existing_idempotent_row(payload)
        if existing is not None:
            return existing
        raise HackPlatformError(f"Insert into signals returned no row. {token_hint()}")
    return res.data[0]


def _existing_idempotent_row(payload: dict) -> dict | None:
    key = payload.get("idempotency_key")
    if not key:
        return None
    try:
        res = (
            get_client()
            .table("signals")
            .select("*")
            .eq("module_id", payload["module_id"])
            .eq("idempotency_key", key)
            .limit(1)
            .execute()
        )
    except Exception:
        return None
    return res.data[0] if res.data else None


# The event runs in Wellington, so a timezone-naive timestamp from a novice
# loader is almost always a NZ wall-clock reading, not UTC. Assume event-local
# and attach Pacific/Auckland — otherwise a naive value serialises as UTC and
# lands ~12h off on the map/feed.
try:
    _EVENT_TZ: tzinfo = ZoneInfo("Pacific/Auckland")
except ZoneInfoNotFoundError:
    # No system tz database and no tzdata package (the win32 dependency covers
    # normal installs). Fixed NZST beats crashing every import of wcc_impact.
    _EVENT_TZ = timezone(timedelta(hours=12), "NZST")
    print(
        "[wcc_impact] tz database not found — naive timestamps will be treated "
        "as fixed UTC+12 (install the 'tzdata' package for proper NZDT handling)"
    )


def fetch_signals(
    *,
    module_id: str | None = None,
    signal_type: str | None = None,
    since: str | datetime | None = None,
    limit: int = 100,
    oldest_first: bool = False,
) -> list[dict]:
    """Read signals from the shared table. Reads are public.

    This is the supported way for one module to react to another module's
    signals — the loader-side counterpart of the UI's useSignals(filter).
    Results are newest first by default; set ``oldest_first=True`` when
    draining chronological batches. ``since`` is exclusive (strictly newer
    than); naive timestamps are treated as event-local, same as publish_signal.

    Example:
        floods = fetch_signals(signal_type="flooding", since="2026-08-08T09:00:00+12:00")
    """
    if isinstance(limit, bool) or not isinstance(limit, int) or limit < 1:
        raise HackPlatformError("fetch_signals limit must be a positive integer")

    q = (
        get_client()
        .table("signals")
        .select("*")
        .order("created_at", desc=not oldest_first)
        .limit(limit)
    )
    if module_id is not None:
        q = q.eq("module_id", module_id)
    if signal_type is not None:
        q = q.eq("signal_type", signal_type)
    cutoff = _parse_dt(since)
    if cutoff is not None:
        q = q.gt("created_at", cutoff.isoformat())
    try:
        res = q.execute()
    except Exception as e:  # supabase/postgrest raise assorted exception types
        raise HackPlatformError(f"Reading signals failed: {e}") from e
    return res.data or []


def _parse_dt(value: str | datetime | None) -> datetime | None:
    """Accept ISO strings or datetimes for observed_at / reported_at.

    Naive (offset-less) values are treated as event-local (Pacific/Auckland).
    """
    if value is None:
        dt = value
    elif isinstance(value, datetime):
        dt = value
    else:
        try:
            dt = datetime.fromisoformat(value)
        except ValueError as e:
            raise HackPlatformError(
                f"Not an ISO 8601 timestamp: {value!r} "
                f"(e.g. '2026-08-08T10:30:00+12:00')"
            ) from e
    if dt is not None and dt.tzinfo is None:
        dt = dt.replace(tzinfo=_EVENT_TZ)
    return dt
