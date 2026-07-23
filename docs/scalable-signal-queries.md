# Scalable signal reads

The dashboard keeps the newest 500 enabled-module signals in one realtime client store.
That bounded store keeps maps, feeds, reconnects, and venue-wifi recovery predictable, but
it is not an all-time database view. Exact statistics and historical browsing use two
public database functions added by `20260723110000_scalable_signal_queries.sql`.

## Exact statistics

`signal_aggregates()` scans the enabled-module signal set once and returns:

- total, newest timestamp, 15/30/60-minute windows, and official-source activity;
- severity, source, verification, and distinct-place totals;
- per-module totals and per-module/per-signal-type totals.

The provider caches the last successful response. A signal insert, update, or delete—or a
module enablement change—marks it stale and schedules one refresh after a 750 ms debounce.
Bursty loaders therefore produce one aggregate request rather than one request per row.
If that request fails, the last-known values stay visible with a stale/error indicator.

Core dashboard statistics, manifest `homeStat` tiles, the health strip, and the activity
API use this aggregate. Module UIs can use `useSignalAggregates()`. They must not derive
all-time counts from `useSignals()`, whose recent window is deliberately capped.

## Stable history

`signal_history_page(...)` orders by `(created_at desc, id desc)` and accepts the previous
page's final tuple as its cursor. The UUID tie-breaker makes page boundaries stable even
when many inserts have the same database timestamp.

Use `fetchSignalPage()` for imperative reads or `useSignalHistory()` for a UI with
refresh/load-more behavior. The SDK permits page sizes from 1 to 100, requests one extra
row internally, removes that sentinel row, and returns the next cursor only when needed.
Existing rows remain visible if a later request fails.

## Indexes and verification

- `signals_created_id_idx (created_at desc, id desc)` supports global chronological and
  cursor reads.
- `signals_module_type_created_id_idx
  (module_id, signal_type, created_at desc, id desc)` supports filtered module history.
- Existing single-column indexes remain useful for other signal filters. PostgreSQL may
  choose `signals_created_at_idx` plus an incremental UUID sort for a small global page;
  the compound module/type query uses the new covering order directly.

The migration was exercised inside a rollback-only local transaction with 650 synthetic
signals. `signal_aggregates()` reported all 650 (not 500), and two consecutive 100-row
pages whose rows shared one timestamp produced 200 distinct IDs with zero overlap.
Automated TypeScript tests also cover totals above 500, cursor construction, last pages,
and last-known-data behavior after errors.
