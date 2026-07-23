# Durable signal ingestion

`publish_signal()` is safe across venue-WiFi outages and loader restarts without
making the golden path more complicated.

## Delivery path

1. Validate the payload against the Python mirror of `schema/signal.schema.json`.
2. Add an `idempotency_key` (the caller's stable key, or a generated UUID).
3. Commit the payload to a per-module SQLite outbox under `.wcc-impact/`.
4. Attempt queued rows oldest-first.
5. On failure, retain the row and schedule bounded exponential backoff with jitter
   (2 seconds initially, capped at 60 seconds).
6. On success, remove the local row and publish queue health to the module registry.

`run_every()` checks the outbox while it heartbeats, so ordinary loaders need no
queue code. A restart reopens the same SQLite file. Newer rows never overtake an
older retrying row.

## Upstream deduplication

Transport retries are always idempotent. To also deduplicate an item that appears
in repeated source polls, pass a stable source identity:

```python
publish_signal(
    module_id=MODULE_ID,
    title=item["title"],
    signal_type="road-closure",
    source_type="official",
    idempotency_key=f"nzta:{item['id']}",
)
```

The database unique constraint is `(module_id, idempotency_key)`. If the first
insert committed but its response was lost, the retry selects and returns that
existing public signal instead of inserting another.

## Queue health and recovery

`signal_queue_health(MODULE_ID)` returns:

- `depth` and `oldest_queued_at`;
- `next_attempt_at`;
- `last_success_at` and a bounded `last_error`; and
- `dead_letters`.

The safe fields are mirrored to `modules` and shown on `/activity`; queued
payloads never leave the laptop until their normal signal insert.

Malformed queued JSON is moved to a dead-letter table so it cannot block newer
valid work. A corrupt SQLite database is preserved beside the replacement as
`*.corrupt-<timestamp>` for organiser inspection. Nothing is silently deleted.

For a custom loop, call `flush_signal_queue(MODULE_ID)`. Set
`WCC_IMPACT_OUTBOX_PATH` only for tooling/tests. Set
`WCC_IMPACT_DURABLE_SIGNALS=0` or pass `durable=False` to deliberately restore
immediate-write failure semantics.
