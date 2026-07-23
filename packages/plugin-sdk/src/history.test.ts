import assert from "node:assert/strict";
import test from "node:test";
import type { SignalRow } from "@wcc-impact/shared";

import { normalizeSignalPage } from "./history";

function row(id: string, createdAt: string): SignalRow {
  return {
    id,
    created_at: createdAt,
    module_id: "team-one",
    title: id,
    signal_type: "flood",
    source_type: "sensor",
    severity: "unknown",
    verification: "unverified",
    media_urls: [],
  };
}

test("limit+1 history results expose a stable tuple cursor", () => {
  const page = normalizeSignalPage(
    [
      row("00000000-0000-0000-0000-000000000003", "2026-08-08T01:00:00Z"),
      row("00000000-0000-0000-0000-000000000002", "2026-08-08T01:00:00Z"),
      row("00000000-0000-0000-0000-000000000001", "2026-08-08T00:59:00Z"),
    ],
    2,
    "2026-08-08T01:01:00Z",
  );

  assert.deepEqual(page.signals.map((signal) => signal.id), [
    "00000000-0000-0000-0000-000000000003",
    "00000000-0000-0000-0000-000000000002",
  ]);
  assert.equal(page.hasMore, true);
  assert.deepEqual(page.nextCursor, {
    createdAt: "2026-08-08T01:00:00Z",
    id: "00000000-0000-0000-0000-000000000002",
  });
});

test("final history page has no cursor or duplicate continuation", () => {
  const page = normalizeSignalPage(
    [row("00000000-0000-0000-0000-000000000001", "2026-08-08T00:59:00Z")],
    2,
  );
  assert.equal(page.hasMore, false);
  assert.equal(page.nextCursor, null);
});
