"""Offline tests for the run_every polling loop (5 s floor, error handling)."""

import pytest

import wcc_impact.loop as loop_mod
from wcc_impact import run_every


@pytest.fixture(autouse=True)
def no_sleep(monkeypatch):
    """Never actually sleep in tests."""
    monkeypatch.setattr(loop_mod.time, "sleep", lambda _s: None)


@pytest.mark.parametrize("low_interval", [0, 1, 4.9, -10])
def test_interval_below_floor_is_clamped_not_raised(low_interval, capsys):
    """Below the 5s floor: clamp to 5s and warn — never crash the loader.

    We stop the loop after the first tick via KeyboardInterrupt so the test
    doesn't spin; the point is that run_every accepts the low value (no
    ValueError) and prints the clamp warning.
    """
    def stop():
        raise KeyboardInterrupt

    run_every(low_interval, stop)  # must NOT raise ValueError
    assert "below 5s floor" in capsys.readouterr().out


def test_floor_is_five_seconds():
    assert loop_mod.MIN_INTERVAL_SECONDS == 5.0


def test_loop_runs_and_exits_cleanly_on_keyboard_interrupt():
    calls = []

    def fn():
        calls.append(1)
        if len(calls) == 3:
            raise KeyboardInterrupt  # simulates Ctrl-C on the 3rd tick

    run_every(5, fn)  # must return (not raise) — Ctrl-C exits cleanly
    assert len(calls) == 3


def test_fn_exceptions_are_caught_and_loop_continues():
    calls = []

    def fn():
        calls.append(1)
        if len(calls) == 1:
            raise RuntimeError("upstream API hiccup")  # must NOT kill the loop
        raise KeyboardInterrupt  # then stop the test

    run_every(5, fn)
    assert len(calls) == 2
