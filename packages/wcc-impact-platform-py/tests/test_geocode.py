"""Offline tests for geocode: gazetteer hits, and the (stubbed) Nominatim fallback."""

import importlib

from wcc_impact import geocode

# `wcc_impact.geocode` the attribute is the function (re-exported in
# __init__); grab the submodule itself for monkeypatching internals.
geocode_mod = importlib.import_module("wcc_impact.geocode")


def test_exact_match_with_macron():
    assert geocode("Ōwhiro Bay") == (-41.3455, 174.7597)


def test_match_without_macron_and_odd_casing():
    assert geocode("owhiro bay") == (-41.3455, 174.7597)
    assert geocode("  KARORI  ") == geocode("Karori")


def test_fuzzy_match_typo():
    # One-letter typo should still resolve via difflib fallback.
    assert geocode("Kilbernie") == geocode("Kilbirnie")


def test_landmarks_present():
    assert geocode("Te Papa") is not None
    assert geocode("Wellington Airport") is not None


def test_unknown_place_returns_none(monkeypatch):
    # Stub the network fallback so this test stays offline.
    calls: list[str] = []

    def fake_nominatim(query: str):
        calls.append(query)
        return None

    monkeypatch.setattr(geocode_mod, "_nominatim", fake_nominatim)
    monkeypatch.setattr(geocode_mod, "_cache", {})
    assert geocode("Hobbiton") is None
    assert geocode("") is None  # empty input short-circuits — no network attempt
    assert calls == ["Hobbiton"]


def test_fallback_misses_are_cached(monkeypatch):
    # A recurring unknown place must hit Nominatim once, then come from cache.
    calls: list[str] = []

    def fake_nominatim(query: str):
        calls.append(query)
        return None

    monkeypatch.setattr(geocode_mod, "_nominatim", fake_nominatim)
    monkeypatch.setattr(geocode_mod, "_cache", {})
    assert geocode("Nowhere Special") is None
    assert geocode("Nowhere Special") is None
    assert calls == ["Nowhere Special"]


def test_gazetteer_hits_never_touch_the_network(monkeypatch):
    def boom(query: str):  # noqa: ARG001
        raise AssertionError("gazetteer hit must not call Nominatim")

    monkeypatch.setattr(geocode_mod, "_nominatim", boom)
    assert geocode("Ōwhiro Bay") == (-41.3455, 174.7597)


def test_coordinates_are_wellington_region():
    # Sanity: every gazetteer entry sits in the greater Wellington bounding box.
    from wcc_impact.geocode import _GAZETTEER

    assert len(_GAZETTEER) >= 40
    for name, (lat, lng) in _GAZETTEER.items():
        assert -41.6 < lat < -40.8, name
        assert 174.5 < lng < 175.2, name
