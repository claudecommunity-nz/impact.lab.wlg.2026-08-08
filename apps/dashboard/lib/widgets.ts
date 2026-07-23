import type { ModuleRegistryEntry, ModuleWidget, WidgetSize } from "@wcc-impact/shared";

export const DASHBOARD_LAYOUT_VERSION = 1;
export const DASHBOARD_STORAGE_KEY = "wcc.dashboard.layout.v1";
export const MAX_WIDGET_INSTANCES = 100;
export const MAX_LAYOUT_BYTES = 64 * 1024;

export const DASHBOARD_BREAKPOINTS = {
  lg: { minWidth: 1200, cols: 12 },
  md: { minWidth: 600, cols: 8 },
  sm: { minWidth: 0, cols: 1 },
} as const;

export type DashboardBreakpoint = keyof typeof DASHBOARD_BREAKPOINTS;
const GRID_BREAKPOINTS = Object.keys(
  DASHBOARD_BREAKPOINTS,
) as DashboardBreakpoint[];

export function dashboardBreakpointForWidth(
  width: number,
): DashboardBreakpoint {
  if (width >= DASHBOARD_BREAKPOINTS.lg.minWidth) return "lg";
  if (width >= DASHBOARD_BREAKPOINTS.md.minWidth) return "md";
  return "sm";
}

export interface WidgetPosition {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DashboardWidgetInstance {
  instanceId: string;
  moduleId: string;
  widgetId: string;
  configVersion: number;
  config: Record<string, unknown>;
  layouts: Record<DashboardBreakpoint, WidgetPosition>;
}

export interface DashboardLayoutDocument {
  version: typeof DASHBOARD_LAYOUT_VERSION;
  widgets: DashboardWidgetInstance[];
}

export interface RegisteredWidget {
  key: string;
  module: ModuleRegistryEntry;
  widget: ModuleWidget;
}

export type WidgetRuntimeState = "loading" | "available" | "unavailable";

/** A missing build-time definition is unavailable immediately; a known widget
 * waits for the runtime module registry before deciding enabled/disabled. */
export function resolveWidgetRuntimeState(
  definitionExists: boolean,
  moduleEnabled: boolean,
  modulesLoading: boolean,
): WidgetRuntimeState {
  if (!definitionExists) return "unavailable";
  if (modulesLoading) return "loading";
  return moduleEnabled ? "available" : "unavailable";
}

const FALLBACK_SIZE: WidgetSize = { w: 4, h: 3 };
const FALLBACK_MIN: WidgetSize = { w: 2, h: 2 };
const FALLBACK_MAX: WidgetSize = { w: 12, h: 12 };

export function widgetDefinitionKey(moduleId: string, widgetId: string): string {
  return `${moduleId}/${widgetId}`;
}

export function flattenWidgetRegistry(
  registry: readonly ModuleRegistryEntry[],
): RegisteredWidget[] {
  return registry.flatMap((module) =>
    (module.widgets ?? []).map((widget) => ({
      key: widgetDefinitionKey(module.id, widget.id),
      module,
      widget,
    })),
  );
}

export function findWidgetDefinition(
  definitions: readonly RegisteredWidget[],
  moduleId: string,
  widgetId: string,
): RegisteredWidget | undefined {
  const key = widgetDefinitionKey(moduleId, widgetId);
  return definitions.find((definition) => definition.key === key);
}

function integer(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.round(value)
    : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function resolvedWidgetSizes(widget?: ModuleWidget): {
  defaultSize: WidgetSize;
  minSize: WidgetSize;
  maxSize: WidgetSize;
} {
  const minSize = widget?.minSize ?? FALLBACK_MIN;
  const maxSize = widget?.maxSize ?? FALLBACK_MAX;
  const requested = widget?.defaultSize ?? FALLBACK_SIZE;
  return {
    minSize,
    maxSize,
    defaultSize: {
      w: clamp(requested.w, minSize.w, maxSize.w),
      h: clamp(requested.h, minSize.h, maxSize.h),
    },
  };
}

function sanitizePosition(
  raw: unknown,
  cols: number,
  widget?: ModuleWidget,
  fallbackY = 0,
): WidgetPosition {
  const source =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const sizes = resolvedWidgetSizes(widget);
  const minW = Math.min(cols, sizes.minSize.w);
  const maxW = Math.min(cols, sizes.maxSize.w);
  const w = clamp(integer(source.w, Math.min(cols, sizes.defaultSize.w)), minW, maxW);
  const h = clamp(
    integer(source.h, sizes.defaultSize.h),
    sizes.minSize.h,
    sizes.maxSize.h,
  );
  return {
    x: clamp(integer(source.x, 0), 0, Math.max(0, cols - w)),
    y: Math.max(0, integer(source.y, fallbackY)),
    w,
    h,
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function defaultWidgetConfig(
  widget?: ModuleWidget,
): Record<string, unknown> {
  return Object.fromEntries(
    (widget?.options ?? []).map((option) => {
      if (option.type === "text") {
        return [option.key, option.defaultValue ?? ""];
      }
      if (option.type === "select") {
        return [
          option.key,
          option.defaultValue ?? option.choices[0]?.value ?? "",
        ];
      }
      if (option.type === "number") {
        return [option.key, option.defaultValue ?? option.min ?? 0];
      }
      return [option.key, option.defaultValue ?? false];
    }),
  );
}

export function sanitizeWidgetConfig(
  value: unknown,
  widget?: ModuleWidget,
): Record<string, unknown> {
  if (!widget) return isPlainObject(value) ? value : {};
  const source = isPlainObject(value) ? value : {};
  const defaults = defaultWidgetConfig(widget);
  return Object.fromEntries(
    (widget.options ?? []).map((option) => {
      const raw = source[option.key];
      const fallback = defaults[option.key];
      if (option.type === "text") {
        const text = typeof raw === "string" ? raw : String(fallback ?? "");
        return [option.key, text.slice(0, option.maxLength ?? 500)];
      }
      if (option.type === "select") {
        const allowed = new Set(option.choices.map((choice) => choice.value));
        return [
          option.key,
          typeof raw === "string" && allowed.has(raw) ? raw : fallback,
        ];
      }
      if (option.type === "number") {
        const number =
          typeof raw === "number" && Number.isFinite(raw)
            ? raw
            : Number(fallback ?? 0);
        return [
          option.key,
          clamp(
            number,
            option.min ?? Number.NEGATIVE_INFINITY,
            option.max ?? Number.POSITIVE_INFINITY,
          ),
        ];
      }
      return [
        option.key,
        typeof raw === "boolean" ? raw : Boolean(fallback),
      ];
    }),
  );
}

export function sanitizeDashboardLayout(
  value: unknown,
  definitions: readonly RegisteredWidget[],
): DashboardLayoutDocument | null {
  if (!isPlainObject(value) || value.version !== DASHBOARD_LAYOUT_VERSION) return null;
  if (!Array.isArray(value.widgets) || value.widgets.length > MAX_WIDGET_INSTANCES) {
    return null;
  }

  const instances: DashboardWidgetInstance[] = [];
  const instanceIds = new Set<string>();
  const singletonDefinitions = new Set<string>();

  for (const raw of value.widgets) {
    if (!isPlainObject(raw)) continue;
    if (
      typeof raw.instanceId !== "string" ||
      typeof raw.moduleId !== "string" ||
      typeof raw.widgetId !== "string" ||
      !raw.instanceId ||
      !raw.moduleId ||
      !raw.widgetId ||
      instanceIds.has(raw.instanceId)
    ) {
      continue;
    }

    const definition = findWidgetDefinition(
      definitions,
      raw.moduleId,
      raw.widgetId,
    );
    const definitionKey = widgetDefinitionKey(raw.moduleId, raw.widgetId);
    if (
      definition &&
      definition.widget.allowMultiple !== true &&
      singletonDefinitions.has(definitionKey)
    ) {
      continue;
    }

    const layoutSource = isPlainObject(raw.layouts) ? raw.layouts : {};
    const fallbackY = instances.reduce(
      (bottom, instance) =>
        Math.max(bottom, instance.layouts.lg.y + instance.layouts.lg.h),
      0,
    );
    const lg = sanitizePosition(
      layoutSource.lg,
      DASHBOARD_BREAKPOINTS.lg.cols,
      definition?.widget,
      fallbackY,
    );
    const md = sanitizePosition(
      layoutSource.md ?? lg,
      DASHBOARD_BREAKPOINTS.md.cols,
      definition?.widget,
      fallbackY,
    );
    const sm = sanitizePosition(
      layoutSource.sm ?? { ...lg, x: 0, w: 1 },
      DASHBOARD_BREAKPOINTS.sm.cols,
      definition?.widget,
      fallbackY,
    );

    instances.push({
      instanceId: raw.instanceId,
      moduleId: raw.moduleId,
      widgetId: raw.widgetId,
      configVersion: Math.max(1, integer(raw.configVersion, 1)),
      config: sanitizeWidgetConfig(raw.config, definition?.widget),
      layouts: { lg, md, sm },
    });
    instanceIds.add(raw.instanceId);
    if (definition?.widget.allowMultiple !== true) {
      singletonDefinitions.add(definitionKey);
    }
  }

  return { version: DASHBOARD_LAYOUT_VERSION, widgets: instances };
}

export function parseStoredDashboardLayout(
  raw: string | null,
  definitions: readonly RegisteredWidget[],
): DashboardLayoutDocument | null {
  if (!raw || new Blob([raw]).size > MAX_LAYOUT_BYTES) return null;
  try {
    return sanitizeDashboardLayout(JSON.parse(raw), definitions);
  } catch {
    return null;
  }
}

function positionsOverlap(a: WidgetPosition, b: WidgetPosition): boolean {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

function firstAvailablePosition(
  size: WidgetSize,
  occupied: readonly WidgetPosition[],
  breakpoint: DashboardBreakpoint,
): WidgetPosition {
  const cols = DASHBOARD_BREAKPOINTS[breakpoint].cols;
  const w = Math.min(cols, size.w);
  if (breakpoint === "sm") {
    const y = occupied.reduce(
      (bottom, position) => Math.max(bottom, position.y + position.h),
      0,
    );
    return { x: 0, y, w: 1, h: size.h };
  }

  const bottom = occupied.reduce(
    (value, position) => Math.max(value, position.y + position.h),
    0,
  );
  for (let y = 0; y <= bottom; y++) {
    for (let x = 0; x <= cols - w; x++) {
      const candidate = { x, y, w, h: size.h };
      if (!occupied.some((position) => positionsOverlap(candidate, position))) {
        return candidate;
      }
    }
  }
  return { x: 0, y: bottom, w, h: size.h };
}

function defaultPosition(
  widget: ModuleWidget | undefined,
  occupied: readonly WidgetPosition[],
  breakpoint: DashboardBreakpoint,
): WidgetPosition {
  const cols = DASHBOARD_BREAKPOINTS[breakpoint].cols;
  const size = resolvedWidgetSizes(widget).defaultSize;
  const available = firstAvailablePosition(size, occupied, breakpoint);
  return sanitizePosition(
    available,
    cols,
    widget,
    available.y,
  );
}

export function createWidgetInstance(
  definition: RegisteredWidget,
  instanceId: string,
  current: DashboardLayoutDocument,
): DashboardWidgetInstance {
  const occupied = (breakpoint: DashboardBreakpoint) =>
    current.widgets.map((instance) => instance.layouts[breakpoint]);
  return {
    instanceId,
    moduleId: definition.module.id,
    widgetId: definition.widget.id,
    configVersion: 1,
    config: defaultWidgetConfig(definition.widget),
    layouts: {
      lg: defaultPosition(definition.widget, occupied("lg"), "lg"),
      md: defaultPosition(definition.widget, occupied("md"), "md"),
      sm: defaultPosition(definition.widget, occupied("sm"), "sm"),
    },
  };
}

/** Repack every breakpoint without changing widget order, size, or settings. */
export function autoArrangeDashboardLayout(
  document: DashboardLayoutDocument,
  definitions: readonly RegisteredWidget[],
): DashboardLayoutDocument {
  const arranged = document.widgets.map((instance) => ({
    ...instance,
    layouts: { ...instance.layouts },
  }));
  for (const breakpoint of GRID_BREAKPOINTS) {
    const occupied: WidgetPosition[] = [];
    for (const instance of arranged) {
      const definition = findWidgetDefinition(
        definitions,
        instance.moduleId,
        instance.widgetId,
      );
      const current = sanitizePosition(
        instance.layouts[breakpoint],
        DASHBOARD_BREAKPOINTS[breakpoint].cols,
        definition?.widget,
      );
      const position = firstAvailablePosition(
        { w: current.w, h: current.h },
        occupied,
        breakpoint,
      );
      instance.layouts[breakpoint] = position;
      occupied.push(position);
    }
  }
  return { ...document, widgets: arranged };
}

/**
 * Organiser-authored first-visit preset. Module code never auto-places itself:
 * only these explicit stable keys are considered, and unavailable definitions
 * are simply omitted.
 */
export function createDefaultDashboardLayout(
  definitions: readonly RegisteredWidget[],
): DashboardLayoutDocument {
  const preferred = [
    widgetDefinitionKey("demo-seed", "signal-summary"),
    widgetDefinitionKey("newsroom", "latest-articles"),
  ];
  let document: DashboardLayoutDocument = {
    version: DASHBOARD_LAYOUT_VERSION,
    widgets: [],
  };
  for (const key of preferred) {
    const definition = definitions.find((item) => item.key === key);
    if (!definition) continue;
    const instance = createWidgetInstance(
      definition,
      `default-${definition.module.id}-${definition.widget.id}`,
      document,
    );
    document = { ...document, widgets: [...document.widgets, instance] };
  }
  return document;
}

export function hasWidgetDefinitionInstance(
  document: DashboardLayoutDocument,
  definition: RegisteredWidget,
): boolean {
  return document.widgets.some(
    (instance) =>
      instance.moduleId === definition.module.id &&
      instance.widgetId === definition.widget.id,
  );
}
