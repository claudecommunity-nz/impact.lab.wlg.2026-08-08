"""newsroom loader — ingest NZ news RSS/Atom every 5 minutes.

A worked example of a real, scheduled data module:

  • fetches live RSS/Atom feeds from major NZ outlets (stdlib only — the nz-news
    skill was the guide; this reimplements the fetch so the module is self-contained),
  • stores full articles in its OWN table (m_newsroom_articles), deduped by url,
  • publishes each genuinely-new article as a signal on the SHARED feed and stores
    that signal_id back on the article (references + own tables),
  • tracks per-feed health (m_newsroom_sources) and logs every cycle
    (m_newsroom_refreshes),
  • re-runs forever on run_every(300, ...).

Run:
  uv run --directory modules/newsroom/loader --package newsroom-loader python -m src.main
  # one cycle only (no loop):
  uv run --directory modules/newsroom/loader --package newsroom-loader python -m src.main once
"""

from __future__ import annotations

import datetime as dt
import re
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

from wcc_impact import geocode, heartbeat, module_table, publish_signal, register_module, run_every

MODULE_ID = "newsroom"
REFRESH_SECONDS = 300  # every 5 minutes
NEW_SIGNAL_CAP = 40    # max signals published per cycle (articles are all stored)
FETCH_TIMEOUT = 12

# Feeds (from the nz-news skill). Primary sources are ingested; RNZ category
# feeds add depth without duplicating the main RNZ feed too much.
FEEDS = [
    {"id": "herald", "name": "NZ Herald", "url": "https://rss.nzherald.co.nz/rss/xml/nzhrsscid_000000001.xml", "format": "rss"},
    {"id": "stuff", "name": "Stuff", "url": "https://www.stuff.co.nz/rss", "format": "atom"},
    {"id": "rnz", "name": "RNZ", "url": "https://www.rnz.co.nz/rss/news.xml", "format": "rss"},
    {"id": "newsroom", "name": "Newsroom", "url": "https://www.newsroom.co.nz/rss", "format": "rss"},
    {"id": "spinoff", "name": "The Spinoff", "url": "https://thespinoff.co.nz/feed", "format": "atom"},
    {"id": "interest", "name": "Interest.co.nz", "url": "https://www.interest.co.nz/rss", "format": "rss"},
    {"id": "rnz-national", "name": "RNZ National", "url": "https://www.rnz.co.nz/rss/national.xml", "format": "rss", "category": "national"},
    {"id": "rnz-politics", "name": "RNZ Politics", "url": "https://www.rnz.co.nz/rss/political.xml", "format": "rss", "category": "politics"},
]

# Wellington-region place names — if one appears in a headline we geocode it so
# the article also drops a pin on the shared map. Most national news won't match.
WELLINGTON_PLACES = [
    "Wellington", "Lower Hutt", "Upper Hutt", "Porirua", "Petone", "Karori",
    "Newtown", "Miramar", "Island Bay", "Kilbirnie", "Johnsonville", "Tawa",
    "Kāpiti", "Kapiti", "Wairarapa", "Masterton", "Ōwhiro Bay", "Thorndon",
]

# ─── RSS/Atom parsing (stdlib + regex, ported from the nz-news skill) ─────────
_UA = "wcc-emergency-newsroom/1.0 (+hackathon)"


def _fetch_text(url: str) -> str:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": _UA,
            "Accept": "application/rss+xml,application/atom+xml,application/xml,text/xml,*/*",
        },
    )
    with urllib.request.urlopen(req, timeout=FETCH_TIMEOUT) as resp:  # noqa: S310 (trusted feed URLs)
        return resp.read().decode("utf-8", "replace")


def _decode(text: str) -> str:
    for a, b in (("&amp;", "&"), ("&lt;", "<"), ("&gt;", ">"), ("&quot;", '"'), ("&#39;", "'"), ("&apos;", "'")):
        text = text.replace(a, b)
    return text


def _strip_cdata(text: str) -> str:
    m = re.match(r"^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$", text)
    return m.group(1) if m else text


def _tag(xml: str, tag: str) -> str:
    m = re.search(rf"<{tag}[^>]*>([\s\S]*?)</{tag}>", xml, re.IGNORECASE)
    return _decode(_strip_cdata(m.group(1).strip())) if m else ""


def _attr(xml: str, tag: str, attr: str) -> str:
    m = re.search(rf'<{tag}[^>]*?{attr}="([^"]*)"', xml, re.IGNORECASE)
    return _decode(m.group(1)) if m else ""


def _strip_html(text: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", text)).strip()


def _parse_date(raw: str) -> str | None:
    """Return an ISO 8601 string, or None if unknown/unparseable."""
    raw = (raw or "").strip()
    if not raw:
        return None
    for fmt in ("%a, %d %b %Y %H:%M:%S %z", "%a, %d %b %Y %H:%M:%S %Z"):
        try:
            return dt.datetime.strptime(raw, fmt).astimezone(dt.timezone.utc).isoformat()
        except Exception:
            pass
    try:
        return dt.datetime.fromisoformat(raw.replace("Z", "+00:00")).astimezone(dt.timezone.utc).isoformat()
    except Exception:
        return None


def _first_image(block: str) -> str | None:
    for pat in (
        r'<enclosure[^>]*url="([^"]+)"',
        r'<media:content[^>]*url="([^"]+)"',
        r'<media:thumbnail[^>]*url="([^"]+)"',
        r'<img[^>]*src="([^"]+)"',
    ):
        m = re.search(pat, block, re.IGNORECASE)
        if m:
            return _decode(m.group(1))
    return None


def _parse_feed(xml: str, feed: dict) -> list[dict]:
    items: list[dict] = []
    is_atom = feed.get("format") == "atom"
    container = r"<entry>([\s\S]*?)</entry>" if is_atom else r"<item>([\s\S]*?)</item>"
    for m in re.finditer(container, xml, re.IGNORECASE):
        block = m.group(1)
        title = _strip_html(_tag(block, "title"))
        link = _attr(block, "link", "href") if is_atom else _tag(block, "link")
        if is_atom:
            published = _tag(block, "published") or _tag(block, "updated")
            summary = _strip_html(_tag(block, "summary") or _tag(block, "content"))
        else:
            published = _tag(block, "pubDate")
            summary = _strip_html(_tag(block, "description"))
        if not title or not link:
            continue
        items.append({
            "title": title[:200],
            "url": link.strip(),
            "summary": summary[:2000] if summary else None,
            "published_at": _parse_date(published),
            "source_id": feed["id"],
            "source_name": feed["name"],
            "image_url": _first_image(block),
        })
    return items


def _fetch_all() -> tuple[list[dict], list[dict]]:
    """Fetch every feed concurrently. Returns (items, source_status_rows)."""
    items: list[dict] = []
    status: list[dict] = []

    def one(feed: dict) -> dict:
        start = time.monotonic()
        try:
            xml = _fetch_text(feed["url"])
            got = _parse_feed(xml, feed)
            return {"feed": feed, "items": got, "ok": True, "error": None, "ms": round((time.monotonic() - start) * 1000)}
        except Exception as e:  # noqa: BLE001
            return {"feed": feed, "items": [], "ok": False, "error": str(e)[:300], "ms": round((time.monotonic() - start) * 1000)}

    with ThreadPoolExecutor(max_workers=8) as pool:
        for res in as_completed([pool.submit(one, f) for f in FEEDS]):
            r = res.result()
            items.extend(r["items"])
            status.append({
                "source_id": r["feed"]["id"],
                "name": r["feed"]["name"],
                "url": r["feed"]["url"],
                "format": r["feed"].get("format", "rss"),
                "category": r["feed"].get("category"),
                "last_fetched_at": dt.datetime.now(dt.timezone.utc).isoformat(),
                "last_status": "ok" if r["ok"] else "error",
                "last_error": r["error"],
                "last_item_count": len(r["items"]),
                "last_duration_ms": r["ms"],
            })
    return items, status


def _geocode_article(item: dict) -> tuple[str | None, float | None, float | None]:
    haystack = f"{item['title']} {item.get('summary') or ''}".lower()
    for place in WELLINGTON_PLACES:
        if place.lower() in haystack:
            latlng = geocode(place)
            return (place, latlng[0], latlng[1]) if latlng else (place, None, None)
    return None, None, None


# ─── The 5-minute cycle ──────────────────────────────────────────────────────
def register() -> None:
    register_module(
        id=MODULE_ID,
        name="Newsroom",
        icon="newspaper",
        description="Live NZ news ingested every 5 minutes — stored, mapped, and open to public discussion.",
    )


def seed_sources(status: list[dict]) -> None:
    """Upsert the managed-feed rows (health updated each cycle)."""
    module_table(MODULE_ID, "sources").upsert(status, on_conflict="source_id").execute()


def refresh() -> None:
    started = dt.datetime.now(dt.timezone.utc)
    items, status = _fetch_all()
    seed_sources(status)
    sources_ok = sum(1 for s in status if s["last_status"] == "ok")
    sources_failed = len(status) - sources_ok

    # In-memory dedup within this batch (feeds overlap on url).
    seen: dict[str, dict] = {}
    for it in items:
        seen.setdefault(it["url"], it)
    candidates = [
        {
            "url": it["url"],
            "title": it["title"],
            "summary": it.get("summary"),
            "source_id": it["source_id"],
            "source_name": it["source_name"],
            "published_at": it.get("published_at"),
            "image_url": it.get("image_url"),
        }
        for it in seen.values()
    ]

    # DB-level dedup + insert in ONE call: upsert with ignore_duplicates maps to
    # INSERT ... ON CONFLICT (url) DO NOTHING RETURNING *, so `.data` is ONLY the
    # genuinely-new rows — no pre-fetch of existing urls, nothing extra pulled.
    inserted = (
        module_table(MODULE_ID, "articles")
        .upsert(candidates, on_conflict="url", ignore_duplicates=True)
        .execute()
        .data
    )
    inserted.sort(key=lambda r: r.get("published_at") or "", reverse=True)  # freshest first
    new_articles = len(inserted)

    # Publish a signal for up to NEW_SIGNAL_CAP of the new articles, then write the
    # signal_id (+ any geocode) back onto the article row (references + own table).
    new_signals = 0
    for art in inserted[:NEW_SIGNAL_CAP]:
        place, lat, lng = _geocode_article(art)
        row = publish_signal(
            module_id=MODULE_ID,
            title=art["title"],
            signal_type="news-article",
            source_type="media",
            source=art["source_name"],
            description=art.get("summary"),
            severity="unknown",
            lat=lat,
            lng=lng,
            place_name=place,
            link=art["url"],
            observed_at=art.get("published_at"),
            raw={"source_id": art["source_id"], "article_url": art["url"]},
        )
        module_table(MODULE_ID, "articles").update(
            {"signal_id": row.get("id"), "place_name": place, "lat": lat, "lng": lng}
        ).eq("id", art["id"]).execute()
        new_signals += 1

    finished = dt.datetime.now(dt.timezone.utc)
    module_table(MODULE_ID, "refreshes").insert({
        "started_at": started.isoformat(),
        "finished_at": finished.isoformat(),
        "duration_ms": round((finished - started).total_seconds() * 1000),
        "sources_ok": sources_ok,
        "sources_failed": sources_failed,
        "new_articles": new_articles,
        "new_signals": new_signals,
    }).execute()
    heartbeat(MODULE_ID)
    print(f"[newsroom] cycle: {sources_ok}/{len(status)} feeds ok, {new_articles} new articles, {new_signals} new signals")


def sample() -> dict:
    """One representative signal payload (NOT inserted) — CI validates it."""
    return {
        "module_id": MODULE_ID,
        "title": "RNZ: Wellington Fault study updates shaking estimates",
        "signal_type": "news-article",
        "source_type": "media",
        "source": "RNZ",
        "description": "A new GNS study revises expected shaking intensities across the region.",
        "severity": "unknown",
        "link": "https://www.rnz.co.nz/news/example",
    }


def main() -> None:
    register()
    if len(sys.argv) > 1 and sys.argv[1] == "once":
        refresh()
        return
    refresh()
    run_every(REFRESH_SECONDS, refresh)


if __name__ == "__main__":
    main()
