---
name: geocoding
description: Turn Wellington place names into lat/lng for the shared map with wcc_impact.geocode — gazetteer first, rate-limited Nominatim fallback, caching, and what to do when lookup fails.
---

# Geocoding

Signals without `lat`/`lng` appear in the feed but **not on the map**. The shared map is
the showcase — geolocate everything you reasonably can.

```python
from wcc_impact import geocode

latlng = geocode("Ōwhiro Bay")        # -> (-41.3455, 174.7597) or None
if latlng:
    lat, lng = latlng
    publish_signal(module_id=MODULE_ID, title=title, signal_type="flooding",
                   source_type="community", lat=lat, lng=lng,
                   place_name="Ōwhiro Bay")
else:
    publish_signal(module_id=MODULE_ID, title=title, signal_type="flooding",
                   source_type="community", place_name="Ōwhiro Bay")  # feed-only is fine
```

How it resolves: a built-in gazetteer of Wellington suburbs and landmarks first (instant,
offline), then a rate-limited Nominatim fallback biased to the Wellington region. Returns
`None` when nothing matches — always handle it; never invent coordinates.

## Rules of thumb

- **Cache your results.** Same place names recur constantly in a feed; the Nominatim
  fallback is rate-limited for the whole room. One dict goes a long way:

  ```python
  _geo_cache: dict[str, tuple[float, float] | None] = {}

  def geo(place: str) -> tuple[float, float] | None:
      if place not in _geo_cache:
          _geo_cache[place] = geocode(place)
      return _geo_cache[place]
  ```

- **Prefer upstream coordinates.** GeoNet and NZTA feeds already carry lat/lng — use
  those directly; geocode only sources that give you prose.
- **Extract the place first.** For free-text reports, pull a place name out (string
  matching against known suburbs, or `ask_claude` — see the ai-claude skill), then
  `geocode()` it. Don't feed whole sentences to `geocode()`.
- **Set `place_name` too**, even when you have coordinates — feed cards and popups show
  it, and it's what humans scan for.
- **Sanity check:** Wellington region is roughly lat -41.0 to -41.5, lng 174.6 to 175.2.
  A signal in the ocean off Peru means a swapped lat/lng.
