import assert from "node:assert/strict";
import test from "node:test";

import { buildSupabaseActivity, sanitizePublicRow } from "./supabase";

test("builds module, signal, table, and media activity totals", () => {
  const activity = buildSupabaseActivity(
    {
      modules: [
        {
          id: "team-one",
          name: "Team One",
          enabled: true,
          last_seen: "2026-08-08T00:00:00Z",
          updated_at: "2026-08-08T00:00:00Z",
        },
      ],
      recentSignals: [
        {
          id: "signal-1",
          created_at: "2026-08-08T00:01:00Z",
          title: "Flooding",
          signal_type: "flood",
          module_id: "team-one",
          source_type: "sensor",
          severity: "moderate",
          verification: "verified",
        },
      ],
      signalCount: 650,
      moduleSignalCounts: { "team-one": 650 },
      declaredTables: [
        {
          moduleId: "team-one",
          logicalName: "readings",
          physicalName: "m_team_one_readings",
          count: 24,
          rows: [{ id: "row-1", reading: 7 }],
        },
      ],
      media: [
        {
          moduleId: "team-one",
          name: "photo.jpg",
          createdAt: "2026-08-08T00:01:00Z",
          size: 123,
          mimeType: "image/jpeg",
          publicUrl: "https://example.test/photo.jpg",
        },
      ],
    },
    "2026-08-08T00:02:00Z",
  );

  assert.equal(activity.source.status, "ok");
  assert.equal(activity.totals.signals, 650);
  assert.equal(activity.modules[0]?.signalCount, 650);
  assert.deepEqual(activity.modules[0]?.declaredTables, ["readings"]);
  assert.equal(activity.tables[0]?.rows[0]?.reading, 7);
  assert.equal(activity.totals.previewedMedia, 1);
});

test("redacts secret-shaped fields and bounds public table previews", () => {
  const preview = sanitizePublicRow({
    id: "row-1",
    api_token: "do-not-render",
    nested: { password: "do-not-render", safe: "visible" },
    long: "x".repeat(800),
  }) as Record<string, unknown>;

  assert.equal(preview.api_token, "[redacted]");
  assert.deepEqual(preview.nested, { password: "[redacted]", safe: "visible" });
  assert.equal((preview.long as string).length, 500);
});

test("Supabase source errors degrade independently without discarding usable data", () => {
  const activity = buildSupabaseActivity(
    {
      modules: [{ id: "team-one", name: "Team One", enabled: true, updated_at: "now" }],
      errors: ["media listing failed"],
    },
    "2026-08-08T00:00:00Z",
  );

  assert.equal(activity.source.status, "degraded");
  assert.equal(activity.modules.length, 1);
  assert.match(activity.source.message ?? "", /media listing failed/);
});

