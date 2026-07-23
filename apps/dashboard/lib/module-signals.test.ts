import assert from "node:assert/strict";
import test from "node:test";
import type { SignalRow } from "@wcc-impact/shared";

import {
  mergeRecentModuleSignals,
  resolveModuleReportState,
} from "./module-signals";

function signal(
  id: string,
  moduleId: string,
  createdAt: string,
  title = id,
): SignalRow {
  return {
    id,
    created_at: createdAt,
    module_id: moduleId,
    title,
    signal_type: "test",
    source_type: "sensor",
    severity: "unknown",
    verification: "unverified",
    media_urls: [],
  };
}

test("module history survives the global realtime cap and merges live updates", () => {
  const result = mergeRecentModuleSignals(
    "team-one",
    [
      signal("old", "team-one", "2026-08-08T00:00:00Z"),
      signal("shared", "team-one", "2026-08-08T00:01:00Z", "history title"),
    ],
    [
      signal("other", "team-two", "2026-08-08T00:03:00Z"),
      signal("new", "team-one", "2026-08-08T00:02:00Z"),
      signal("shared", "team-one", "2026-08-08T00:01:00Z", "realtime title"),
    ],
  );

  assert.deepEqual(
    result.map((row) => row.id),
    ["new", "shared", "old"],
  );
  assert.equal(result[1]?.title, "realtime title");
});

test("module windows are newest-first and bounded", () => {
  const result = mergeRecentModuleSignals(
    "team-one",
    [
      signal("one", "team-one", "2026-08-08T00:00:00Z"),
      signal("two", "team-one", "2026-08-08T00:01:00Z"),
      signal("three", "team-one", "2026-08-08T00:02:00Z"),
    ],
    [],
    2,
  );
  assert.deepEqual(
    result.map((row) => row.id),
    ["three", "two"],
  );
});

test("module report state does not confuse loading, unavailable, and empty", () => {
  const base = {
    rowCount: 0,
    total: null,
    historyLoading: false,
    historyError: null,
    realtimeLoading: false,
    aggregateLoading: false,
    aggregateError: null,
  };

  assert.equal(
    resolveModuleReportState({ ...base, historyLoading: true }),
    "loading",
  );
  assert.equal(
    resolveModuleReportState({ ...base, rowCount: 1, historyLoading: true }),
    "ready",
  );
  assert.equal(
    resolveModuleReportState({ ...base, total: 42 }),
    "unavailable",
  );
  assert.equal(
    resolveModuleReportState({
      ...base,
      historyError: "timeout",
      realtimeLoading: true,
    }),
    "loading",
  );
  assert.equal(
    resolveModuleReportState({ ...base, historyError: "timeout" }),
    "unavailable",
  );
  assert.equal(resolveModuleReportState({ ...base, total: 0 }), "empty");
});
