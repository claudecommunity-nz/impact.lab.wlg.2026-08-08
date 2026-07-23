import assert from "node:assert/strict";
import test from "node:test";
import type { SignalAggregates, SignalRow } from "@wcc-impact/shared";

import { applyAuthoritativeAggregates, deriveCop } from "./cop";

function recentSignal(index: number): SignalRow {
  return {
    id: `00000000-0000-0000-0000-${String(index).padStart(12, "0")}`,
    created_at: "2026-08-08T00:59:00Z",
    module_id: "team-one",
    title: `Signal ${index}`,
    signal_type: "flood",
    source_type: "sensor",
    severity: "unknown",
    verification: "unverified",
    media_urls: [],
  };
}

test("home COP uses database totals beyond the recent 500 rows", () => {
  const recent = deriveCop(
    Array.from({ length: 500 }, (_, index) => recentSignal(index)),
    [],
    Date.parse("2026-08-08T01:00:00Z"),
  );
  const aggregates: SignalAggregates = {
    generatedAt: "2026-08-08T01:00:00Z",
    newestCreatedAt: "2026-08-08T00:59:00Z",
    total: 650,
    active60m: 120,
    new15m: 30,
    previous15m: 12,
    officialActive60m: 42,
    distinctPlaces: 18,
    bySeverity: { minor: 100, moderate: 200, severe: 50, extreme: 10, unknown: 290 },
    bySource: { official: 200, community: 150, media: 100, sensor: 200 },
    byVerification: {
      unverified: 300,
      corroborated: 100,
      verified: 200,
      false_report: 50,
    },
    byModule: { "team-one": 650 },
    moduleSignalTypes: [{ moduleId: "team-one", signalType: "flood", count: 640 }],
  };

  const authoritative = applyAuthoritativeAggregates(recent, aggregates);
  assert.equal(recent.total, 500);
  assert.equal(authoritative.total, 650);
  assert.equal(authoritative.new15, 30);
  assert.equal(authoritative.velocity, 18);
  assert.equal(authoritative.needsTriage, 300);
  assert.equal(authoritative.suburbCount, 18);
  assert.equal(authoritative.latest.length, 80);
});

test("historical severe reports do not keep the current regional status critical", () => {
  const historicalSevere: SignalRow = {
    ...recentSignal(1),
    created_at: "2026-08-07T20:00:00Z",
    severity: "severe",
  };
  const current = deriveCop(
    [historicalSevere],
    [],
    Date.parse("2026-08-08T01:00:00Z"),
  );

  assert.equal(current.criticalCount, 0);
  assert.equal(current.threat.level, "monitoring");
});
