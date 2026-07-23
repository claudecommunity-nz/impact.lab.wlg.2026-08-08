import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeNearbySignal,
  normalizeNearbySignalResponse,
  summarizeNearbySignals,
  type NearbySignal,
} from "./location-insight";

const baseSignal = {
  id: "00000000-0000-0000-0000-000000000001",
  created_at: "2026-08-08T01:00:00Z",
  module_id: "team-one",
  title: "Flood water rising near the road",
  signal_type: "flood",
  source_type: "community",
  severity: "severe",
  verification: "unverified",
  media_urls: [],
  lat: -41.29,
  lng: 174.78,
};

test("nearby signal normalization accepts Postgres numeric output", () => {
  const nearby = normalizeNearbySignal({
    ...baseSignal,
    event_at: "2026-08-08T00:58:00Z",
    distance_m: "125.4",
    location_precision: "street",
    accuracy_m: "40",
  });

  assert.ok(nearby);
  assert.equal(nearby.signal.id, baseSignal.id);
  assert.equal(nearby.distanceM, 125.4);
  assert.equal(nearby.accuracyM, 40);
  assert.equal(nearby.locationPrecision, "street");
});

test("nearby signal normalization rejects invalid locations and distances", () => {
  assert.equal(
    normalizeNearbySignal({ ...baseSignal, lat: null, distance_m: 10 }),
    null,
  );
  assert.equal(
    normalizeNearbySignal({ ...baseSignal, distance_m: -1 }),
    null,
  );
});

test("nearby response reports partial schema drift and refuses false empties", () => {
  const partial = normalizeNearbySignalResponse([
    { ...baseSignal, distance_m: 10, location_precision: "exact" },
    { ...baseSignal, id: "broken", lat: null, distance_m: 20 },
  ]);
  assert.equal(partial.signals.length, 1);
  assert.equal(partial.rejectedRowCount, 1);
  assert.equal(partial.resultsTruncated, false);
  assert.equal(
    normalizeNearbySignalResponse(
      Array.from({ length: 40 }, () => ({
        ...baseSignal,
        distance_m: 10,
        location_precision: "exact",
      })),
    ).resultsTruncated,
    true,
  );

  assert.throws(
    () => normalizeNearbySignalResponse([{ ...baseSignal, lat: null, distance_m: 20 }]),
    /could not be interpreted/,
  );
  assert.throws(
    () => normalizeNearbySignalResponse({ rows: [] }),
    /unsupported format/,
  );
});

test("nearby summary distinguishes evidence, diversity, and coarse locations", () => {
  const rows = [
    {
      ...baseSignal,
      distance_m: 180,
      location_precision: "suburb",
    },
    {
      ...baseSignal,
      id: "00000000-0000-0000-0000-000000000002",
      module_id: "team-two",
      source_type: "official",
      severity: "extreme",
      verification: "verified",
      signal_type: "landslide",
      distance_m: 450,
      location_precision: "exact",
    },
    {
      ...baseSignal,
      id: "00000000-0000-0000-0000-000000000003",
      module_id: "team-three",
      severity: "minor",
      verification: "false_report",
      distance_m: 50,
      location_precision: "exact",
    },
  ]
    .map(normalizeNearbySignal)
    .filter((row): row is NearbySignal => row !== null);

  const summary = summarizeNearbySignals(rows);
  assert.equal(summary.activeCount, 2);
  assert.equal(summary.dismissedCount, 1);
  assert.equal(summary.highestSeverity, "extreme");
  assert.equal(summary.seriousCount, 2);
  assert.equal(summary.moduleCount, 2);
  assert.equal(summary.sourceTypeCount, 2);
  assert.equal(summary.verifiedOrOfficialCount, 1);
  assert.equal(summary.coarseLocationCount, 1);
  assert.deepEqual(summary.typeCounts, [
    { signalType: "flood", count: 1 },
    { signalType: "landslide", count: 1 },
  ]);
  assert.equal(summary.topReports[0]?.signal.signal_type, "landslide");
});
