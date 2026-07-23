"""publish_signal + the pydantic mirror of the Signal contract.

NOTE: /schema/signal.schema.json is the SINGLE SOURCE OF TRUTH for the signal
shape. The ``Signal`` model below mirrors it field-for-field so loaders get a
readable validation error *before* the row hits the database — if the two ever
disagree, the JSON Schema wins and this file must be updated.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone, tzinfo
from typing import Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, ConfigDict, Field, ValidationError

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
) -> dict:
    """Validate against the Signal contract, insert into `signals`, return the row.

    The moment this succeeds your signal is on the shared live map and feed.
    RLS requires: the event token (attached automatically), a registered AND
    enabled module_id, title <= 200 chars, description <= 2000 chars.

    Example:
        publish_signal(module_id="team-coast-watch",
                       title="Waves over the road at Ōwhiro Bay",
                       signal_type="coastal-hazard", source_type="community",
                       lat=-41.3455, lng=174.7597, severity="severe")
    """
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
        )
    except ValidationError as e:
        raise HackPlatformError(f"Signal failed validation:\n{e}") from e

    payload = signal.model_dump(
        mode="json", exclude_none=True, exclude={"id", "created_at"}
    )
    try:
        res = get_client().table("signals").insert(payload).execute()
    except Exception as e:  # supabase/postgrest raise assorted exception types
        raise HackPlatformError(
            f"Insert into signals rejected: {e}. {token_hint()}"
        ) from e
    if not res.data:
        raise HackPlatformError(f"Insert into signals returned no row. {token_hint()}")
    return res.data[0]


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
