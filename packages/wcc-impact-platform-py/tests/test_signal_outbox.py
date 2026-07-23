"""Durable signal publishing: outage, restart, replay, order, and corruption."""

from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest

from wcc_impact import outbox
from wcc_impact import signals


def _payload(key: str, title: str = "Queued signal") -> dict:
    return {
        "module_id": "team-outbox",
        "title": title,
        "signal_type": "test",
        "source_type": "sensor",
        "severity": "unknown",
        "verification": "unverified",
        "media_urls": [],
        "idempotency_key": key,
    }


def test_network_failure_persists_validated_signal(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    spool = tmp_path / "signals.sqlite3"
    monkeypatch.setenv("WCC_IMPACT_OUTBOX_PATH", str(spool))
    monkeypatch.setattr(signals, "_sync_queue_health", lambda *_: None)
    monkeypatch.setattr(
        signals,
        "_insert_payload",
        lambda _payload: (_ for _ in ()).throw(ConnectionError("venue WiFi down")),
    )

    receipt = signals.publish_signal(
        module_id="team-outbox",
        title="Flooding observed",
        signal_type="flood",
        source_type="community",
        idempotency_key="upstream-123",
        durable=True,
    )

    assert receipt["queued"] is True
    assert receipt["idempotency_key"] == "upstream-123"
    assert receipt["queue_depth"] == 1
    assert spool.exists()
    assert outbox.health(spool).depth == 1
    assert "venue WiFi down" in (outbox.health(spool).last_error or "")


def test_restart_resumes_queued_writes(tmp_path: Path) -> None:
    spool = tmp_path / "signals.sqlite3"
    now = [100.0]
    outbox.enqueue(spool, _payload("restart-1"), "restart-1")

    failed = outbox.drain(
        spool,
        lambda _payload: (_ for _ in ()).throw(ConnectionError("offline")),
        now=lambda: now[0],
        jitter=lambda: 0.5,
    )
    assert failed.health.depth == 1

    # A new drain opens a new SQLite connection, matching a loader restart.
    now[0] = 200.0
    sent = outbox.drain(
        spool,
        lambda payload: {"id": "signal-1", **payload},
        now=lambda: now[0],
    )
    assert list(sent.sent) == ["restart-1"]
    assert sent.health.depth == 0
    assert sent.health.last_success_at is not None


def test_duplicate_replay_is_queued_and_sent_once(tmp_path: Path) -> None:
    spool = tmp_path / "signals.sqlite3"
    assert outbox.enqueue(spool, _payload("same-key"), "same-key") is True
    assert outbox.enqueue(
        spool,
        _payload("same-key", title="different replay body"),
        "same-key",
    ) is False

    calls: list[str] = []
    result = outbox.drain(
        spool,
        lambda payload: calls.append(payload["title"]) or {"id": "one"},
    )
    assert calls == ["Queued signal"]
    assert result.health.depth == 0


def test_database_duplicate_resolves_to_existing_signal(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    existing = {"id": "already-there", **_payload("stable-source-id")}

    class Query:
        data = [existing]

        def insert(self, _payload: dict):
            return self

        def select(self, _columns: str):
            return self

        def eq(self, _column: str, _value: str):
            return self

        def limit(self, _limit: int):
            return self

        def execute(self):
            if not hasattr(self, "_insert_failed"):
                self._insert_failed = True
                raise RuntimeError("duplicate key value violates unique constraint")
            return self

    query = Query()

    class Client:
        def table(self, name: str):
            assert name == "signals"
            return query

    monkeypatch.setattr(signals, "get_client", lambda _module_id=None: Client())
    assert signals._insert_payload(_payload("stable-source-id")) == existing


def test_queue_preserves_insertion_order(tmp_path: Path) -> None:
    spool = tmp_path / "signals.sqlite3"
    for key in ("one", "two", "three"):
        outbox.enqueue(spool, _payload(key, title=key), key)

    order: list[str] = []
    outbox.drain(
        spool,
        lambda payload: order.append(payload["idempotency_key"]) or payload,
    )
    assert order == ["one", "two", "three"]


def test_retry_backoff_is_exponential_jittered_and_bounded(tmp_path: Path) -> None:
    spool = tmp_path / "signals.sqlite3"
    now = [1_000.0]
    outbox.enqueue(spool, _payload("retry"), "retry")

    delays: list[float] = []
    for _ in range(10):
        outbox.drain(
            spool,
            lambda _payload: (_ for _ in ()).throw(ConnectionError("still down")),
            now=lambda: now[0],
            jitter=lambda: 1.0,
        )
        with sqlite3.connect(spool) as conn:
            next_attempt = conn.execute(
                "select next_attempt_at from signal_outbox"
            ).fetchone()[0]
        delays.append(next_attempt - now[0])
        now[0] = next_attempt

    assert delays[:4] == [2.5, 5.0, 10.0, 20.0]
    assert max(delays) == outbox.MAX_RETRY_SECONDS
    assert all(0 < delay <= outbox.MAX_RETRY_SECONDS for delay in delays)


def test_corrupt_payload_is_quarantined_without_blocking_newer_rows(
    tmp_path: Path,
) -> None:
    spool = tmp_path / "signals.sqlite3"
    outbox.enqueue(spool, _payload("corrupt"), "corrupt")
    outbox.enqueue(spool, _payload("valid"), "valid")
    with sqlite3.connect(spool) as conn:
        conn.execute(
            "update signal_outbox set payload_json = ? where idempotency_key = ?",
            ("{not-json", "corrupt"),
        )

    sent: list[str] = []
    result = outbox.drain(
        spool,
        lambda payload: sent.append(payload["idempotency_key"]) or payload,
    )
    assert sent == ["valid"]
    assert result.health.depth == 0
    assert result.health.dead_letters == 1
    assert "Corrupt queued signal" in (result.health.last_error or "")


def test_corrupt_sqlite_file_is_preserved_and_recovered(tmp_path: Path) -> None:
    spool = tmp_path / "signals.sqlite3"
    spool.write_bytes(b"not a sqlite database")

    recovered = outbox.health(spool)

    assert recovered.depth == 0
    assert recovered.last_error is not None
    assert list(tmp_path.glob("signals.sqlite3.corrupt-*"))


def test_public_error_text_redacts_credentials(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    secret_key = "sb_" + "secret_" + "abcdefghijklmnopqrst"
    database_url = "postgresql:" + "//user:password@example.test/postgres"
    monkeypatch.setenv("MODULE_TOKEN", "module-token-must-not-leak")
    message = outbox._bounded_error(
        RuntimeError(
            "request module-token-must-not-leak "
            f"{secret_key} "
            f"{database_url}"
        )
    )
    assert "module-token-must-not-leak" not in message
    assert "sb_secret_" not in message
    assert "user:password" not in message
    assert message.count("[redacted]") >= 3
