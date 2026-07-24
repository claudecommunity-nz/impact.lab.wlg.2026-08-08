import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeSeriousPocket,
  normalizeSeriousPocketResponse,
} from "./serious-pockets";

const pocket = {
  key: "serious:4",
  label: "Kilbirnie",
  lat: -41.318,
  lng: 174.795,
  report_count: 9,
  serious_count: 6,
  moderate_count: 3,
  severe_count: 4,
  extreme_count: 2,
  unverified_serious_count: 5,
  verified_or_corroborated_serious_count: 1,
  official_serious_count: 1,
  reported_origin_count: 4,
  signal_types: [
    { signal_type: "flood", count: 5 },
    { signal_type: "landslide", count: 4 },
  ],
  first_seen_at: "2026-08-07T23:00:00Z",
  last_seen_at: "2026-08-08T01:00:00Z",
  precision_status: "mixed",
  coarse_location_count: 3,
  unknown_precision_count: 1,
  max_accuracy_m: "500",
  max_severity: "extreme",
  extent: {
    type: "Polygon",
    coordinates: [
      [
        [174.79, -41.32],
        [174.80, -41.32],
        [174.80, -41.31],
        [174.79, -41.31],
        [174.79, -41.32],
      ],
    ],
  },
};

const responseMetadata = {
  generated_at: "2026-08-08T01:01:00Z",
  since: "2026-08-01T01:01:00Z",
  cell_m: 750,
  min_points: 2,
  candidate_count: 5000,
  candidate_limit: 5000,
  candidates_truncated: true,
  qualifying_pocket_count: 20,
  qualifying_report_count: 400,
  qualifying_serious_count: 300,
  qualifying_unverified_serious_count: 200,
  pocket_limit: 12,
  pockets_truncated: true,
};

test("serious pocket normalization preserves explainable evidence counts", () => {
  const result = normalizeSeriousPocket(pocket);

  assert.ok(result);
  assert.equal(result.seriousCount, 6);
  assert.equal(result.reportedOriginCount, 4);
  assert.equal(result.unverifiedSeriousCount, 5);
  assert.equal(result.maxAccuracyM, 500);
  assert.deepEqual(result.signalTypes, [
    { signalType: "flood", count: 5 },
    { signalType: "landslide", count: 4 },
  ]);
});

test("serious pockets reject invalid coordinates rather than mapping zero", () => {
  assert.equal(normalizeSeriousPocket({ ...pocket, lat: "not-a-coordinate" }), null);
  assert.equal(normalizeSeriousPocket({ ...pocket, lng: 200 }), null);
});

test("response normalization discloses rejected and capped analytical rows", () => {
  const result = normalizeSeriousPocketResponse({
    ...responseMetadata,
    pockets: [pocket, { ...pocket, key: "", lat: null }],
  });

  assert.equal(result.pockets.length, 1);
  assert.equal(result.rejectedPocketCount, 1);
  assert.equal(result.candidatesTruncated, true);
  assert.equal(result.pocketsTruncated, true);
  assert.equal(result.qualifyingSeriousCount, 300);
  assert.equal(result.candidateCount, 5000);
});

test("response normalization refuses malformed false-empty results", () => {
  assert.throws(
    () => normalizeSeriousPocketResponse([]),
    /unsupported format/,
  );
  assert.throws(
    () =>
      normalizeSeriousPocketResponse({
        ...responseMetadata,
        pockets: [{ ...pocket, lat: null }],
      }),
    /could not be interpreted/,
  );
  assert.throws(
    () =>
      normalizeSeriousPocketResponse({
        generated_at: "2026-08-08T01:01:00Z",
        since: "2026-08-01T01:01:00Z",
        pockets: [],
      }),
    /completeness metadata/,
  );
});
