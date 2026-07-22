"""geocode — Wellington-region place lookup (CONTRACTS §7).

A built-in gazetteer of ~45 Wellington suburbs and landmarks with a fuzzy
match (instant, offline) first, then a rate-limited Nominatim (OpenStreetMap)
fallback bounded to the Wellington region for street addresses and places the
gazetteer doesn't know. Fallback results — including misses — are cached
in-process, and network failures degrade to None. Returns None when nothing
resolves — publish the signal with place_name only in that case.
"""

from __future__ import annotations

import difflib
import time

import httpx

# (lat, lng) WGS84 — approximate centroids, good enough for a city-scale map.
_GAZETTEER: dict[str, tuple[float, float]] = {
    # central city
    "wellington central": (-41.2865, 174.7762),
    "te aro": (-41.2951, 174.7748),
    "lambton quay": (-41.2784, 174.7767),
    "cuba street": (-41.2938, 174.7754),
    "courtenay place": (-41.2937, 174.7817),
    "thorndon": (-41.2727, 174.7768),
    "pipitea": (-41.2745, 174.7797),
    "mount cook": (-41.3004, 174.7746),
    "mount victoria": (-41.2960, 174.7940),
    "oriental bay": (-41.2905, 174.7947),
    "roseneath": (-41.2925, 174.8005),
    # inner suburbs
    "kelburn": (-41.2851, 174.7669),
    "aro valley": (-41.2946, 174.7643),
    "brooklyn": (-41.3059, 174.7627),
    "vogeltown": (-41.3129, 174.7684),
    "newtown": (-41.3095, 174.7794),
    "berhampore": (-41.3193, 174.7757),
    "hataitai": (-41.3047, 174.7940),
    "northland": (-41.2793, 174.7568),
    "wilton": (-41.2650, 174.7550),
    "wadestown": (-41.2660, 174.7710),
    "karori": (-41.2851, 174.7400),
    "makara": (-41.2850, 174.7120),
    # south coast
    "island bay": (-41.3369, 174.7737),
    "owhiro bay": (-41.3455, 174.7597),
    "happy valley": (-41.3300, 174.7560),
    "red rocks": (-41.3595, 174.7290),
    "lyall bay": (-41.3282, 174.7952),
    "moa point": (-41.3420, 174.8090),
    "breaker bay": (-41.3310, 174.8290),
    # east
    "kilbirnie": (-41.3186, 174.7962),
    "rongotai": (-41.3242, 174.8014),
    "miramar": (-41.3159, 174.8168),
    "seatoun": (-41.3251, 174.8340),
    "shelly bay": (-41.2940, 174.8210),
    "evans bay": (-41.3050, 174.8050),
    # north
    "ngaio": (-41.2510, 174.7720),
    "khandallah": (-41.2440, 174.7940),
    "johnsonville": (-41.2231, 174.8046),
    "newlands": (-41.2270, 174.8180),
    "churton park": (-41.1946, 174.8054),
    "tawa": (-41.1694, 174.8288),
    # landmarks
    "wellington railway station": (-41.2790, 174.7803),
    "wellington airport": (-41.3272, 174.8053),
    "sky stadium": (-41.2730, 174.7859),
    "te papa": (-41.2905, 174.7821),
    "wellington hospital": (-41.3088, 174.7794),
    "zealandia": (-41.2900, 174.7530),
    "wellington botanic garden": (-41.2825, 174.7672),
    "wellington cable car": (-41.2784, 174.7683),
    # wider region (scenario spillover)
    "petone": (-41.2280, 174.8700),
    "lower hutt": (-41.2094, 174.9080),
    "wainuiomata": (-41.2523, 174.9450),
    "eastbourne": (-41.2895, 174.8994),
    "days bay": (-41.2810, 174.9060),
    "porirua": (-41.1339, 174.8404),
    "upper hutt": (-41.1244, 175.0707),
}

_MACRONS = str.maketrans("āēīōūĀĒĪŌŪ", "aeiouaeiou")


def _normalise(name: str) -> str:
    cleaned = name.translate(_MACRONS).lower().replace("'", " ").replace("-", " ")
    return " ".join(cleaned.split())


# ---------- Nominatim fallback (rate-limited, Wellington-bounded) ----------

_NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
# lon,lat corner pairs (Nominatim viewbox format), covering the greater
# Wellington region — with bounded=1 results outside this box are dropped.
_WELLINGTON_VIEWBOX = "174.5,-40.8,175.2,-41.6"
# Nominatim's public usage policy: max 1 request/second, identify yourself.
_MIN_INTERVAL_S = 1.1
_USER_AGENT = "wcc-emergency-hack-2026/0.1 (wcc_impact.geocode)"

_last_request = 0.0
# In-process cache — misses (None) are cached too, so a recurring unknown
# place name never re-hits the room-shared rate limit.
_cache: dict[str, tuple[float, float] | None] = {}


def _nominatim(query: str) -> tuple[float, float] | None:
    """Rate-limited Nominatim lookup, bounded to the Wellington region.

    Best-effort by design: any network/HTTP/parse failure returns None so a
    loader on flaky venue WiFi degrades to feed-only signals, never crashes.

    Example:
        _nominatim("1 Molesworth Street")  # (-41.27..., 174.77...) or None
    """
    global _last_request
    wait = _MIN_INTERVAL_S - (time.monotonic() - _last_request)
    if wait > 0:
        time.sleep(wait)
    _last_request = time.monotonic()
    try:
        resp = httpx.get(
            _NOMINATIM_URL,
            params={
                "q": query,
                "format": "jsonv2",
                "limit": 1,
                "countrycodes": "nz",
                "viewbox": _WELLINGTON_VIEWBOX,
                "bounded": 1,
            },
            headers={"User-Agent": _USER_AGENT},
            timeout=10,
        )
        resp.raise_for_status()
        results = resp.json()
        if results:
            return (float(results[0]["lat"]), float(results[0]["lon"]))
    except Exception:  # noqa: BLE001 — offline/rate-limited/odd payload ⇒ not found
        pass
    return None


def geocode(place_name: str) -> tuple[float, float] | None:
    """Wellington-region place lookup -> (lat, lng), or None if not found.

    Gazetteer first: exact match (macron/case/whitespace-insensitive), then a
    fuzzy match for typos ("Owhiro bay", "Kilbernie") — instant, offline.
    Anything else falls back to Nominatim (OpenStreetMap), rate-limited to
    ~1 request/second and bounded to the Wellington region; fallback results
    (including misses) are cached in-process, and network failures return
    None. Never invent coordinates when you get None — publish with
    place_name only.

    Example:
        latlng = geocode("Ōwhiro Bay")           # (-41.3455, 174.7597) — gazetteer
        street = geocode("113 The Esplanade")    # Nominatim fallback (needs network)
        if latlng:
            lat, lng = latlng
    """
    if not place_name or not place_name.strip():
        return None
    key = _normalise(place_name)
    if key in _GAZETTEER:
        return _GAZETTEER[key]
    close = difflib.get_close_matches(key, _GAZETTEER.keys(), n=1, cutoff=0.8)
    if close:
        return _GAZETTEER[close[0]]
    if key not in _cache:
        _cache[key] = _nominatim(place_name.strip())
    return _cache[key]
