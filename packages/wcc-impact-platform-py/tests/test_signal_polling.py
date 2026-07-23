from __future__ import annotations

import importlib
from types import SimpleNamespace

import pytest

from wcc_impact import HackPlatformError


loop_mod = importlib.import_module("wcc_impact.loop")
signals_mod = importlib.import_module("wcc_impact.signals")


class FakeQuery:
    def __init__(self) -> None:
        self.calls: list[tuple] = []

    def select(self, columns: str) -> FakeQuery:
        self.calls.append(("select", columns))
        return self

    def order(self, column: str, *, desc: bool) -> FakeQuery:
        self.calls.append(("order", column, desc))
        return self

    def limit(self, count: int) -> FakeQuery:
        self.calls.append(("limit", count))
        return self

    def eq(self, column: str, value: str) -> FakeQuery:
        self.calls.append(("eq", column, value))
        return self

    def gt(self, column: str, value: str) -> FakeQuery:
        self.calls.append(("gt", column, value))
        return self

    def execute(self) -> SimpleNamespace:
        self.calls.append(("execute",))
        return SimpleNamespace(data=[{"id": "signal-1"}])


class FakeClient:
    def __init__(self, query: FakeQuery) -> None:
        self.query = query

    def table(self, name: str) -> FakeQuery:
        self.query.calls.append(("table", name))
        return self.query


def test_fetch_signals_can_drain_oldest_first(monkeypatch: pytest.MonkeyPatch) -> None:
    query = FakeQuery()
    monkeypatch.setattr(
        signals_mod,
        "get_client",
        lambda _module_id=None: FakeClient(query),
    )

    rows = signals_mod.fetch_signals(
        module_id="team-one",
        signal_type="alert",
        since="2026-08-08T00:00:00+00:00",
        limit=25,
        oldest_first=True,
    )

    assert rows == [{"id": "signal-1"}]
    assert ("order", "created_at", False) in query.calls
    assert ("limit", 25) in query.calls
    assert ("eq", "module_id", "team-one") in query.calls
    assert ("eq", "signal_type", "alert") in query.calls
    assert ("gt", "created_at", "2026-08-08T00:00:00+00:00") in query.calls


@pytest.mark.parametrize("limit", [0, -1, True, 1.5])
def test_fetch_signals_rejects_invalid_limit(limit: object) -> None:
    with pytest.raises(HackPlatformError, match="positive integer"):
        signals_mod.fetch_signals(limit=limit)  # type: ignore[arg-type]


def test_on_new_signals_retries_before_advancing_cursor(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    baseline_at = "2026-08-08T00:00:00+00:00"
    new_at = "2026-08-08T00:00:01+00:00"
    new_row = {"id": "signal-new", "created_at": new_at}
    poll_cursors: list[str] = []
    poll_orders: list[bool] = []

    def fake_fetch_signals(**kwargs: object) -> list[dict]:
        if kwargs.get("limit") == 1 and "since" not in kwargs:
            return [{"id": "signal-old", "created_at": baseline_at}]

        poll_cursors.append(str(kwargs["since"]))
        poll_orders.append(bool(kwargs.get("oldest_first")))
        if kwargs["since"] == baseline_at:
            return [new_row]
        return []

    handler_batches: list[list[dict]] = []

    def handler(rows: list[dict]) -> None:
        handler_batches.append(rows)
        if len(handler_batches) == 1:
            raise RuntimeError("temporary handler failure")

    def fake_run_every(_seconds: float, fn: object) -> None:
        for _ in range(3):
            try:
                fn()  # type: ignore[operator]
            except RuntimeError:
                pass

    monkeypatch.setattr(loop_mod.signals, "fetch_signals", fake_fetch_signals)
    monkeypatch.setattr(loop_mod, "run_every", fake_run_every)

    loop_mod.on_new_signals(handler, poll_seconds=5)

    assert handler_batches == [[new_row], [new_row]]
    assert poll_cursors == [baseline_at, baseline_at, new_at]
    assert poll_orders == [True, True, True]
