import assert from "node:assert/strict";
import test from "node:test";

import {
  aggregateStateReducer,
  initialAggregateState,
  normalizeSignalAggregates,
} from "./aggregates";

const raw = {
  generated_at: "2026-08-08T01:00:00Z",
  newest_created_at: "2026-08-08T00:59:00Z",
  total: 650,
  active_60m: 120,
  new_15m: 30,
  previous_15m: 12,
  official_active_60m: 42,
  distinct_places: 18,
  by_severity: { minor: 100, moderate: 200, severe: 50, extreme: 10, unknown: 290 },
  by_source: { official: 200, community: 150, media: 100, sensor: 200 },
  by_verification: {
    unverified: 300,
    corroborated: 100,
    verified: 200,
    false_report: 50,
  },
  by_module: { "team-one": 620, "team-two": 30 },
  module_signal_types: [
    { module_id: "team-one", signal_type: "flood", count: 610 },
  ],
};

test("normalizes authoritative totals beyond the 500-row realtime cap", () => {
  const aggregates = normalizeSignalAggregates(raw);
  assert.equal(aggregates.total, 650);
  assert.equal(aggregates.byModule["team-one"], 620);
  assert.deepEqual(aggregates.moduleSignalTypes[0], {
    moduleId: "team-one",
    signalType: "flood",
    count: 610,
  });
});

test("invalidations and errors retain last-known data as stale", () => {
  const data = normalizeSignalAggregates(raw);
  const loaded = aggregateStateReducer(initialAggregateState, { type: "success", data });
  const invalidated = aggregateStateReducer(loaded, { type: "invalidate" });
  assert.equal(invalidated.data?.total, 650);
  assert.equal(invalidated.stale, true);

  const failed = aggregateStateReducer(invalidated, {
    type: "error",
    error: "temporary database timeout",
  });
  assert.equal(failed.data?.total, 650);
  assert.equal(failed.stale, true);
  assert.equal(failed.error, "temporary database timeout");

  const refreshed = aggregateStateReducer(failed, { type: "success", data });
  assert.equal(refreshed.stale, false);
  assert.equal(refreshed.error, null);
});
