import sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock

sys.path.insert(0, str(Path(__file__).parents[1]))

from src import main as newsroom


class FakeTable:
    def __init__(self, name: str, inserted: list[dict]) -> None:
        self.name = name
        self.inserted = inserted
        self.operations: list[tuple[str, object, dict]] = []
        self.result_data: list[dict] = []

    def upsert(self, rows, **kwargs):
        self.operations.append(("upsert", rows, kwargs))
        self.result_data = (
            self.inserted
            if self.name == "articles" and kwargs.get("ignore_duplicates")
            else rows
        )
        return self

    def insert(self, row):
        self.operations.append(("insert", row, {}))
        self.result_data = [row]
        return self

    def execute(self):
        return SimpleNamespace(data=self.result_data)


def test_refresh_batches_article_signal_updates(monkeypatch) -> None:
    items = [
        {
            "url": f"https://example.test/{index}",
            "title": f"Story {index}",
            "summary": None,
            "source_id": "test",
            "source_name": "Test",
            "published_at": f"2026-07-23T10:0{index}:00+00:00",
            "image_url": None,
        }
        for index in range(2)
    ]
    inserted = [
        {
            **item,
            "id": f"article-{index}",
            "created_at": "2026-07-23T10:00:00+00:00",
            "place_name": None,
            "lat": None,
            "lng": None,
            "signal_id": None,
        }
        for index, item in enumerate(items)
    ]
    status = [{
        "source_id": "test",
        "name": "Test",
        "url": "https://example.test/feed",
        "format": "rss",
        "category": None,
        "last_fetched_at": "2026-07-23T10:00:00+00:00",
        "last_status": "ok",
        "last_error": None,
        "last_item_count": 2,
        "last_duration_ms": 5,
    }]
    tables = {
        name: FakeTable(name, inserted)
        for name in ("sources", "articles", "refreshes")
    }
    publish = Mock(side_effect=[{"id": "signal-0"}, {"id": "signal-1"}])
    heartbeat = Mock()

    monkeypatch.setattr(newsroom, "_fetch_all", lambda: (items, status))
    monkeypatch.setattr(
        newsroom, "module_table", lambda module_id, name: tables[name]
    )
    monkeypatch.setattr(newsroom, "publish_signal", publish)
    monkeypatch.setattr(newsroom, "heartbeat", heartbeat)

    newsroom.refresh()

    article_upserts = [
        operation
        for operation in tables["articles"].operations
        if operation[0] == "upsert"
    ]
    assert len(article_upserts) == 2
    _, updates, options = article_upserts[1]
    assert options == {"on_conflict": "id"}
    assert [row["signal_id"] for row in updates] == ["signal-0", "signal-1"]
    assert publish.call_count == 2
    heartbeat.assert_called_once_with("newsroom")
