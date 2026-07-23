import assert from "node:assert/strict";
import test from "node:test";
import type { ModuleRegistryEntry } from "@wcc-impact/shared";
import {
  DASHBOARD_LAYOUT_VERSION,
  autoArrangeDashboardLayout,
  createDefaultDashboardLayout,
  createWidgetInstance,
  dashboardBreakpointForWidth,
  flattenWidgetRegistry,
  parseStoredDashboardLayout,
  resolveWidgetRuntimeState,
  sanitizeDashboardLayout,
} from "./widgets";

const registry: ModuleRegistryEntry[] = [
  {
    contractVersion: 1,
    id: "team-example",
    name: "Example",
    icon: "box",
    description: "Test module",
    hasUi: false,
    widgets: [
      {
        id: "summary",
        name: "Summary",
        description: "A test summary.",
        ui: async () => ({ default: () => null }),
        defaultSize: { w: 4, h: 3 },
        minSize: { w: 2, h: 2 },
        maxSize: { w: 6, h: 5 },
      },
      {
        id: "repeatable",
        name: "Repeatable",
        description: "A repeatable test widget.",
        ui: async () => ({ default: () => null }),
        allowMultiple: true,
      },
    ],
  },
];

const definitions = flattenWidgetRegistry(registry);

test("dashboard breakpoint follows the measured grid width", () => {
  assert.equal(dashboardBreakpointForWidth(599), "sm");
  assert.equal(dashboardBreakpointForWidth(600), "md");
  assert.equal(dashboardBreakpointForWidth(1199), "md");
  assert.equal(dashboardBreakpointForWidth(1200), "lg");
});

test("registry flattening retains module identity and lazy widget definitions", () => {
  assert.deepEqual(
    definitions.map((definition) => definition.key),
    ["team-example/summary", "team-example/repeatable"],
  );
  assert.equal(typeof definitions[0]?.widget.ui, "function");
});

test("known widgets wait for the runtime module registry before becoming unavailable", () => {
  assert.equal(resolveWidgetRuntimeState(true, false, true), "loading");
  assert.equal(resolveWidgetRuntimeState(true, true, false), "available");
  assert.equal(resolveWidgetRuntimeState(true, false, false), "unavailable");
  assert.equal(resolveWidgetRuntimeState(false, false, true), "unavailable");
});

test("stored layout parsing rejects corrupt, old, and oversized documents", () => {
  assert.equal(parseStoredDashboardLayout("{", definitions), null);
  assert.equal(
    parseStoredDashboardLayout(
      JSON.stringify({ version: 99, widgets: [] }),
      definitions,
    ),
    null,
  );
  assert.equal(parseStoredDashboardLayout(" ".repeat(70_000), definitions), null);
});

test("sanitizer clamps positions and dimensions to definition constraints", () => {
  const sanitized = sanitizeDashboardLayout(
    {
      version: DASHBOARD_LAYOUT_VERSION,
      widgets: [
        {
          instanceId: "one",
          moduleId: "team-example",
          widgetId: "summary",
          configVersion: 1,
          config: {},
          layouts: {
            lg: { x: 99, y: -4, w: 12, h: 1 },
            md: { x: -1, y: 2, w: 1, h: 20 },
            sm: { x: 5, y: 2, w: 8, h: 3 },
          },
        },
      ],
    },
    definitions,
  );
  assert.ok(sanitized);
  assert.deepEqual(sanitized.widgets[0]?.layouts.lg, {
    x: 6,
    y: 0,
    w: 6,
    h: 2,
  });
  assert.deepEqual(sanitized.widgets[0]?.layouts.sm, {
    x: 0,
    y: 2,
    w: 1,
    h: 3,
  });
});

test("single-instance widgets dedupe while repeatable and unknown widgets survive", () => {
  const make = (instanceId: string, widgetId: string) => ({
    instanceId,
    moduleId: "team-example",
    widgetId,
    configVersion: 1,
    config: {},
    layouts: {
      lg: { x: 0, y: 0, w: 4, h: 3 },
      md: { x: 0, y: 0, w: 4, h: 3 },
      sm: { x: 0, y: 0, w: 1, h: 3 },
    },
  });
  const sanitized = sanitizeDashboardLayout(
    {
      version: 1,
      widgets: [
        make("summary-1", "summary"),
        make("summary-2", "summary"),
        make("repeat-1", "repeatable"),
        make("repeat-2", "repeatable"),
        make("missing", "removed-in-a-later-deploy"),
      ],
    },
    definitions,
  );
  assert.ok(sanitized);
  assert.deepEqual(
    sanitized.widgets.map((widget) => widget.instanceId),
    ["summary-1", "repeat-1", "repeat-2", "missing"],
  );
});

test("new instances fill the first available row before growing downward", () => {
  const definition = definitions[0]!;
  const first = createWidgetInstance(
    definition,
    "first",
    { version: 1, widgets: [] },
  );
  const second = createWidgetInstance(
    definition,
    "second",
    { version: 1, widgets: [first] },
  );
  assert.equal(first.layouts.lg.y, 0);
  assert.equal(second.layouts.lg.y, 0);
  assert.equal(second.layouts.lg.x, first.layouts.lg.w);
  assert.equal(first.layouts.sm.w, 1);
  assert.equal(second.layouts.sm.y, first.layouts.sm.h);
});

test("auto arrange removes avoidable gaps without changing sizes or order", () => {
  const definition = definitions[1]!;
  const first = createWidgetInstance(
    definition,
    "first",
    { version: 1, widgets: [] },
  );
  const second = createWidgetInstance(
    definition,
    "second",
    { version: 1, widgets: [first] },
  );
  const gapped = {
    version: 1 as const,
    widgets: [
      { ...first, layouts: { ...first.layouts, lg: { ...first.layouts.lg, y: 8 } } },
      { ...second, layouts: { ...second.layouts, lg: { ...second.layouts.lg, x: 0, y: 12 } } },
    ],
  };
  const arranged = autoArrangeDashboardLayout(gapped, definitions);
  assert.deepEqual(
    arranged.widgets.map((widget) => widget.instanceId),
    ["first", "second"],
  );
  assert.equal(arranged.widgets[0]?.layouts.lg.y, 0);
  assert.equal(arranged.widgets[1]?.layouts.lg.y, 0);
  assert.equal(arranged.widgets[1]?.layouts.lg.x, arranged.widgets[0]?.layouts.lg.w);
});

test("default layout is organiser-curated and does not auto-place arbitrary modules", () => {
  assert.deepEqual(createDefaultDashboardLayout(definitions), {
    version: 1,
    widgets: [],
  });
});
