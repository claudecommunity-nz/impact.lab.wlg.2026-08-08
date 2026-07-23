import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeResponseAccess,
  normalizeSignalHotspot,
  normalizeTriageCandidate,
} from "./spatial-triage";

const signal = {
  id: "00000000-0000-0000-0000-000000000001",
  created_at: "2026-08-08T01:00:00Z",
  module_id: "team-one",
  title: "Flood water rising near the road",
  signal_type: "flood",
  source_type: "community",
  severity: "severe",
  verification: "unverified",
  media_urls: [],
};

test("response access requires both an approved role and authorization", () => {
  assert.deepEqual(normalizeResponseAccess({ authorized: true, role: "operator" }), {
    authorized: true,
    role: "operator",
  });
  assert.deepEqual(normalizeResponseAccess({ authorized: true, role: "participant" }), {
    authorized: false,
    role: null,
  });
});

test("triage candidates preserve signal evidence and database priority", () => {
  const candidate = normalizeTriageCandidate({
    ...signal,
    event_at: "2026-08-08T00:58:00Z",
    action_priority: "p2",
    verification_priority: "p1",
    nearby_count: 4,
    independent_source_count: 3,
    location_precision: "street",
    accuracy_m: "40",
    reason_codes: ["high_consequence", "independent_corroboration"],
  });

  assert.ok(candidate);
  assert.equal(candidate.signal.id, signal.id);
  assert.equal(candidate.actionPriority, "p2");
  assert.equal(candidate.verificationPriority, "p1");
  assert.equal(candidate.independentSourceCount, 3);
  assert.equal(candidate.accuracyM, 40);
});

test("hotspots reject invalid coordinates instead of placing them at zero", () => {
  const base = {
    key: "flood:1",
    signal_type: "flood",
    first_seen_at: "2026-08-08T00:40:00Z",
    last_seen_at: "2026-08-08T01:00:00Z",
    signal_count: 5,
    unverified_count: 3,
    independent_source_count: 2,
    max_severity: "severe",
    lat: -41.29,
    lng: 174.78,
  };

  assert.ok(normalizeSignalHotspot(base));
  assert.equal(normalizeSignalHotspot({ ...base, lat: "not-a-coordinate" }), null);
});
