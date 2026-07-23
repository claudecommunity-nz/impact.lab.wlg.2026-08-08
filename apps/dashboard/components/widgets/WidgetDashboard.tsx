"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  HardDrive,
  LayoutGrid,
  LayoutDashboard,
  Plus,
  RotateCcw,
  Search,
  Settings2,
  Undo2,
  X,
} from "lucide-react";
import {
  noCompactor,
  ResponsiveGridLayout,
  useContainerWidth,
  type Layout,
  type ResponsiveLayouts,
} from "react-grid-layout";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Button,
  Card,
  CardContent,
  Input,
  ModuleIcon,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  WidgetEmpty,
  cn,
  useModules,
  useUser,
  type WidgetDisplayMode,
} from "@wcc-impact/plugin-sdk";
import registry from "../../registry.gen";
import {
  loadPersonalDashboardLayout,
  savePersonalDashboardLayout,
} from "../../lib/dashboard-layouts";
import {
  DASHBOARD_BREAKPOINTS,
  DASHBOARD_STORAGE_KEY,
  autoArrangeDashboardLayout,
  createDefaultDashboardLayout,
  createWidgetInstance,
  dashboardBreakpointForWidth,
  findWidgetDefinition,
  flattenWidgetRegistry,
  hasWidgetDefinitionInstance,
  parseStoredDashboardLayout,
  resolvedWidgetSizes,
  sanitizeDashboardLayout,
  type DashboardBreakpoint,
  type DashboardLayoutDocument,
  type DashboardWidgetInstance,
  type RegisteredWidget,
  type WidgetPosition,
} from "../../lib/widgets";
import { WidgetMount } from "./WidgetMount";
import { WidgetShell } from "./WidgetShell";

type SyncState = "device" | "syncing" | "synced" | "not-synced";
type RemovedWidget = { instance: DashboardWidgetInstance; index: number };

const BREAKPOINT_WIDTHS = Object.fromEntries(
  Object.entries(DASHBOARD_BREAKPOINTS).map(([name, value]) => [
    name,
    value.minWidth,
  ]),
) as Record<DashboardBreakpoint, number>;

const BREAKPOINT_COLS = Object.fromEntries(
  Object.entries(DASHBOARD_BREAKPOINTS).map(([name, value]) => [
    name,
    value.cols,
  ]),
) as Record<DashboardBreakpoint, number>;

const GRID_BREAKPOINTS = Object.keys(
  DASHBOARD_BREAKPOINTS,
) as DashboardBreakpoint[];

function displayMode(position: WidgetPosition): WidgetDisplayMode {
  if (position.w <= 3 || position.h <= 2) return "compact";
  if (position.w >= 6 || position.h >= 5) return "expanded";
  return "regular";
}

function documentToGridLayouts(
  document: DashboardLayoutDocument,
  definitions: readonly RegisteredWidget[],
  editing: boolean,
): ResponsiveLayouts<DashboardBreakpoint> {
  return Object.fromEntries(
    GRID_BREAKPOINTS.map((breakpoint) => [
      breakpoint,
      document.widgets.map((instance) => {
        const definition = findWidgetDefinition(
          definitions,
          instance.moduleId,
          instance.widgetId,
        );
        const sizes = resolvedWidgetSizes(definition?.widget);
        const cols = DASHBOARD_BREAKPOINTS[breakpoint].cols;
        return {
          i: instance.instanceId,
          ...instance.layouts[breakpoint],
          minW: Math.min(cols, sizes.minSize.w),
          minH: sizes.minSize.h,
          maxW: Math.min(cols, sizes.maxSize.w),
          maxH: sizes.maxSize.h,
          static: !editing,
          isDraggable: editing && breakpoint !== "sm",
          isResizable: editing && breakpoint !== "sm",
        };
      }),
    ]),
  ) as ResponsiveLayouts<DashboardBreakpoint>;
}

function applyGridLayouts(
  document: DashboardLayoutDocument,
  layouts: ResponsiveLayouts<DashboardBreakpoint>,
): DashboardLayoutDocument {
  return {
    ...document,
    widgets: document.widgets.map((instance) => {
      const next = { ...instance.layouts };
      for (const breakpoint of GRID_BREAKPOINTS) {
        const item = layouts[breakpoint]?.find(
          (candidate) => candidate.i === instance.instanceId,
        );
        if (item) {
          next[breakpoint] = {
            x: item.x,
            y: item.y,
            w: item.w,
            h: item.h,
          };
        }
      }
      return { ...instance, layouts: next };
    }),
  };
}

export function WidgetDashboard() {
  const definitions = useMemo(() => flattenWidgetRegistry(registry), []);
  const defaultLayout = useMemo(
    () => createDefaultDashboardLayout(definitions),
    [definitions],
  );
  const { modules } = useModules();
  const { user } = useUser();
  const [saved, setSaved] = useState<DashboardLayoutDocument>(defaultLayout);
  const [draft, setDraft] = useState<DashboardLayoutDocument>(defaultLayout);
  const [hydrated, setHydrated] = useState(false);
  const [editing, setEditing] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [syncState, setSyncState] = useState<SyncState>("device");
  const [removed, setRemoved] = useState<RemovedWidget | null>(null);
  const validLocalRef = useRef(false);
  const remoteLoadedForRef = useRef<string | null>(null);
  const { width, mounted, containerRef } = useContainerWidth({
    measureBeforeMount: true,
  });
  const breakpoint = dashboardBreakpointForWidth(width);

  const current = editing ? draft : saved;
  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(saved),
    [draft, saved],
  );
  const enabledIds = useMemo(
    () => new Set(modules.filter((module) => module.enabled).map((module) => module.id)),
    [modules],
  );
  const gridLayouts = useMemo(
    () => documentToGridLayouts(current, definitions, editing),
    [current, definitions, editing],
  );

  useEffect(() => {
    const parsed = parseStoredDashboardLayout(
      localStorage.getItem(DASHBOARD_STORAGE_KEY),
      definitions,
    );
    validLocalRef.current = parsed !== null;
    const initial = parsed ?? defaultLayout;
    setSaved(initial);
    setDraft(initial);
    setHydrated(true);
    if (!parsed && localStorage.getItem(DASHBOARD_STORAGE_KEY)) {
      setAnnouncement("The saved dashboard was invalid, so the default was restored.");
    }
  }, [defaultLayout, definitions]);

  useEffect(() => {
    if (!hydrated || !user || validLocalRef.current) return;
    if (remoteLoadedForRef.current === user.id) return;
    remoteLoadedForRef.current = user.id;
    void loadPersonalDashboardLayout(user, definitions)
      .then((remote) => {
        if (!remote) return;
        setSaved(remote.document);
        setDraft(remote.document);
        localStorage.setItem(DASHBOARD_STORAGE_KEY, JSON.stringify(remote.document));
        validLocalRef.current = true;
        setSyncState("synced");
        setAnnouncement("Your synced dashboard was loaded.");
      })
      .catch(() => {
        setSyncState("not-synced");
      });
  }, [definitions, hydrated, user]);

  useEffect(() => {
    const receiveStoredLayout = (event: StorageEvent) => {
      if (event.key !== DASHBOARD_STORAGE_KEY || editing) return;
      const parsed = parseStoredDashboardLayout(event.newValue, definitions);
      if (!parsed) return;
      setSaved(parsed);
      setDraft(parsed);
      setAnnouncement("Dashboard updated from another tab.");
    };
    window.addEventListener("storage", receiveStoredLayout);
    return () => window.removeEventListener("storage", receiveStoredLayout);
  }, [definitions, editing]);

  useEffect(() => {
    const preventLoss = (event: BeforeUnloadEvent) => {
      if (!editing || !dirty) return;
      event.preventDefault();
    };
    window.addEventListener("beforeunload", preventLoss);
    return () => window.removeEventListener("beforeunload", preventLoss);
  }, [dirty, editing]);

  const updateGrid = useCallback(
    (_active: Layout, layouts: ResponsiveLayouts<DashboardBreakpoint>) => {
      if (!editing) return;
      setDraft((previous) => applyGridLayouts(previous, layouts));
    },
    [editing],
  );

  const beginEdit = () => {
    setDraft(saved);
    setRemoved(null);
    setEditing(true);
    setAnnouncement("Dashboard editing enabled.");
  };

  const cancelEdit = () => {
    setDraft(saved);
    setRemoved(null);
    setEditing(false);
    setAnnouncement("Dashboard changes cancelled.");
  };

  const saveEdit = async () => {
    const sanitized = sanitizeDashboardLayout(draft, definitions) ?? defaultLayout;
    try {
      localStorage.setItem(DASHBOARD_STORAGE_KEY, JSON.stringify(sanitized));
    } catch {
      setAnnouncement("The dashboard could not be saved on this device.");
      return;
    }
    validLocalRef.current = true;
    setSaved(sanitized);
    setDraft(sanitized);
    setEditing(false);
    setRemoved(null);
    setSyncState(user ? "syncing" : "device");
    setAnnouncement("Dashboard saved on this device.");
    if (user) {
      try {
        await savePersonalDashboardLayout(user, sanitized);
        setSyncState("synced");
        setAnnouncement("Dashboard saved and synced.");
      } catch {
        setSyncState("not-synced");
        setAnnouncement("Dashboard saved on this device, but cloud sync is unavailable.");
      }
    }
  };

  const addWidget = (definition: RegisteredWidget) => {
    if (
      definition.widget.allowMultiple !== true &&
      hasWidgetDefinitionInstance(draft, definition)
    ) {
      return;
    }
    const instance = createWidgetInstance(
      definition,
      crypto.randomUUID(),
      draft,
    );
    setDraft((previous) => ({
      ...previous,
      widgets: [...previous.widgets, instance],
    }));
    setGalleryOpen(false);
    setAnnouncement(`${definition.widget.name} added to the dashboard.`);
    window.setTimeout(() => {
      document
        .querySelector<HTMLElement>(
          `[data-widget-instance="${instance.instanceId}"] button`,
        )
        ?.focus();
    }, 100);
  };

  const removeWidget = (instanceId: string) => {
    setDraft((previous) => {
      const index = previous.widgets.findIndex(
        (instance) => instance.instanceId === instanceId,
      );
      if (index < 0) return previous;
      setRemoved({ instance: previous.widgets[index]!, index });
      return {
        ...previous,
        widgets: previous.widgets.filter(
          (instance) => instance.instanceId !== instanceId,
        ),
      };
    });
    setAnnouncement("Widget removed. Undo is available.");
  };

  const undoRemove = () => {
    if (!removed) return;
    setDraft((previous) => {
      const widgets = [...previous.widgets];
      widgets.splice(removed.index, 0, removed.instance);
      return { ...previous, widgets };
    });
    setAnnouncement("Widget restored.");
    setRemoved(null);
  };

  const tidyLayout = () => {
    setDraft((previous) =>
      autoArrangeDashboardLayout(previous, definitions),
    );
    setAnnouncement("Widgets arranged into the first available spaces.");
  };

  const updateInstance = (
    instanceId: string,
    change: (instance: DashboardWidgetInstance) => DashboardWidgetInstance,
  ) => {
    setDraft((previous) => ({
      ...previous,
      widgets: previous.widgets.map((instance) =>
        instance.instanceId === instanceId ? change(instance) : instance,
      ),
    }));
  };

  const moveWidget = (
    instance: DashboardWidgetInstance,
    direction: "left" | "right" | "up" | "down",
  ) => {
    if (breakpoint === "sm" && (direction === "up" || direction === "down")) {
      setDraft((previous) => {
        const index = previous.widgets.findIndex(
          (candidate) => candidate.instanceId === instance.instanceId,
        );
        const target = direction === "up" ? index - 1 : index + 1;
        if (index < 0 || target < 0 || target >= previous.widgets.length) return previous;
        const widgets = [...previous.widgets];
        const [item] = widgets.splice(index, 1);
        widgets.splice(target, 0, item!);
        return {
          ...previous,
          widgets: widgets.map((candidate, order) => ({
            ...candidate,
            layouts: {
              ...candidate.layouts,
              sm: { ...candidate.layouts.sm, x: 0, y: order * 3 },
            },
          })),
        };
      });
    } else {
      updateInstance(instance.instanceId, (candidate) => {
        const position = candidate.layouts[breakpoint];
        const cols = DASHBOARD_BREAKPOINTS[breakpoint].cols;
        const next = {
          ...position,
          x:
            direction === "left"
              ? Math.max(0, position.x - 1)
              : direction === "right"
                ? Math.min(cols - position.w, position.x + 1)
                : position.x,
          y:
            direction === "up"
              ? Math.max(0, position.y - 1)
              : direction === "down"
                ? position.y + 1
                : position.y,
        };
        return {
          ...candidate,
          layouts: { ...candidate.layouts, [breakpoint]: next },
        };
      });
    }
    setAnnouncement(`Widget moved ${direction}.`);
  };

  const resizeWidget = (
    instance: DashboardWidgetInstance,
    direction: "larger" | "smaller",
  ) => {
    const definition = findWidgetDefinition(
      definitions,
      instance.moduleId,
      instance.widgetId,
    );
    const sizes = resolvedWidgetSizes(definition?.widget);
    updateInstance(instance.instanceId, (candidate) => {
      const position = candidate.layouts[breakpoint];
      const cols = DASHBOARD_BREAKPOINTS[breakpoint].cols;
      const delta = direction === "larger" ? 1 : -1;
      const minW = Math.min(cols, sizes.minSize.w);
      const maxW = Math.min(cols, sizes.maxSize.w);
      const next = {
        ...position,
        w:
          breakpoint === "sm"
            ? 1
            : Math.min(maxW, Math.max(minW, position.w + delta)),
        h: Math.min(
          sizes.maxSize.h,
          Math.max(sizes.minSize.h, position.h + delta),
        ),
      };
      next.x = Math.min(next.x, cols - next.w);
      return {
        ...candidate,
        layouts: { ...candidate.layouts, [breakpoint]: next },
      };
    });
    setAnnouncement(`Widget made ${direction}.`);
  };

  const filteredDefinitions = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return definitions.filter(
      (definition) =>
        enabledIds.has(definition.module.id) &&
        (!needle ||
          definition.widget.name.toLowerCase().includes(needle) ||
          definition.widget.description.toLowerCase().includes(needle) ||
          definition.module.name.toLowerCase().includes(needle)),
    );
  }, [definitions, enabledIds, query]);

  return (
    <section className="space-y-4" aria-labelledby="my-dashboard-title">
      <Card className="ops-panel gap-0 overflow-hidden rounded-lg py-0">
        <CardContent className="flex flex-wrap items-start gap-4 p-4">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
              <LayoutDashboard className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
                Personal workspace
              </p>
              <h1
                id="my-dashboard-title"
                className="text-xl font-semibold tracking-tight text-foreground"
              >
                My dashboard
              </h1>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Module widgets arranged for the way you monitor and respond.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            {editing ? (
              <>
                <Sheet open={galleryOpen} onOpenChange={setGalleryOpen}>
                  <SheetTrigger asChild>
                    <Button type="button" variant="outline">
                      <Plus /> Add widget
                    </Button>
                  </SheetTrigger>
                  <SheetContent className="sm:max-w-md">
                    <SheetHeader>
                      <SheetTitle>Add a widget</SheetTitle>
                      <SheetDescription>
                        Widgets are supplied by enabled modules and share the same
                        dashboard template.
                      </SheetDescription>
                    </SheetHeader>
                    <div className="relative px-4">
                      <Search className="pointer-events-none absolute top-2.5 left-6 size-4 text-muted-foreground" />
                      <Input
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Search widgets or modules"
                        className="pl-9"
                        autoFocus
                      />
                    </div>
                    <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 pb-4">
                      {filteredDefinitions.length === 0 && (
                        <WidgetEmpty
                          title="No widgets found"
                          description="Register and enable a module with widgets, or try another search."
                        />
                      )}
                      {filteredDefinitions.map((definition) => {
                        const alreadyAdded = hasWidgetDefinitionInstance(
                          draft,
                          definition,
                        );
                        const disabled =
                          alreadyAdded &&
                          definition.widget.allowMultiple !== true;
                        const size = resolvedWidgetSizes(
                          definition.widget,
                        ).defaultSize;
                        return (
                          <button
                            key={definition.key}
                            type="button"
                            disabled={disabled}
                            onClick={() => addWidget(definition)}
                            className="flex w-full items-start gap-3 rounded-lg border border-border p-3 text-left transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted">
                              <ModuleIcon
                                name={
                                  definition.widget.icon ??
                                  definition.module.icon
                                }
                                className="size-4"
                              />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-medium text-foreground">
                                {definition.widget.name}
                              </span>
                              <span className="block text-xs text-muted-foreground">
                                {definition.module.name} · {size.w}×{size.h}
                              </span>
                              <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                                {definition.widget.description}
                              </span>
                            </span>
                            {disabled && (
                              <Check className="mt-1 size-4 text-muted-foreground" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </SheetContent>
                </Sheet>
                <Button type="button" variant="outline" onClick={tidyLayout}>
                  <LayoutGrid /> Tidy layout
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button type="button" variant="outline">
                      <RotateCcw /> Reset
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Reset the dashboard?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Your current draft will be replaced by the
                        organiser&apos;s default widget layout. You can still
                        Cancel the overall edit afterward.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Keep editing</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => {
                          setDraft(defaultLayout);
                          setRemoved(null);
                          setAnnouncement(
                            "Default dashboard restored in the draft.",
                          );
                        }}
                      >
                        Reset draft
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                <Button type="button" variant="outline" onClick={cancelEdit}>
                  <X /> Cancel
                </Button>
                <Button type="button" onClick={() => void saveEdit()}>
                  <Check /> Save
                </Button>
              </>
            ) : (
              <Button type="button" onClick={beginEdit}>
                <Settings2 /> Edit dashboard
              </Button>
            )}
          </div>
        </CardContent>

        <div className="flex flex-wrap items-center gap-2 border-t border-border bg-muted/25 px-4 py-2.5 text-xs text-muted-foreground">
          <span className="rounded-full border border-border bg-background px-2.5 py-1 font-medium text-foreground">
            {current.widgets.length}{" "}
            {current.widgets.length === 1 ? "widget" : "widgets"}
          </span>
          <span className="rounded-full border border-border bg-background px-2.5 py-1 font-medium text-foreground">
            {enabledIds.size} modules available
          </span>
          <span className="flex items-center gap-1.5">
            <HardDrive className="size-3.5" />
            {syncState === "synced"
              ? "Account synced"
              : syncState === "syncing"
                ? "Syncing…"
                : syncState === "not-synced"
                  ? "This device · sync unavailable"
                  : user
                    ? "This device"
                    : "This device only"}
          </span>
          {editing && dirty && (
            <span className="rounded-full bg-primary/15 px-2.5 py-1 font-medium text-foreground">
              Unsaved changes
            </span>
          )}
        </div>
      </Card>

      {editing && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
          <LayoutGrid className="size-4 text-primary" />
          <span className="mr-auto">
            Drag from a widget header, resize its corner, or use its actions
            menu for precise changes.
          </span>
          {announcement && announcement !== "Dashboard editing enabled." && (
            <span
              data-testid="dashboard-action-status"
              className="rounded-full bg-background px-2.5 py-1 font-medium text-foreground shadow-xs"
              aria-live="polite"
            >
              {announcement}
            </span>
          )}
          {removed && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={undoRemove}
            >
              <Undo2 /> Undo remove
            </Button>
          )}
        </div>
      )}

      <div ref={containerRef} className={cn("min-w-0", editing && "is-editing")}>
        {!hydrated ? (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">
              Loading your dashboard…
            </CardContent>
          </Card>
        ) : current.widgets.length === 0 ? (
          <Card className="border-dashed">
            <WidgetEmpty
              title={editing ? "Your dashboard is empty" : "No widgets yet"}
              description={
                editing
                  ? "Choose Add widget to build your workspace."
                  : "Edit the dashboard to add module widgets."
              }
            />
          </Card>
        ) : mounted ? (
          <ResponsiveGridLayout<DashboardBreakpoint>
            width={width}
            layouts={gridLayouts}
            breakpoints={BREAKPOINT_WIDTHS}
            cols={BREAKPOINT_COLS}
            rowHeight={76}
            margin={{ lg: [12, 12], md: [12, 12], sm: [0, 12] }}
            containerPadding={{ lg: [0, 0], md: [0, 0], sm: [0, 0] }}
            dragConfig={{
              enabled: editing && breakpoint !== "sm",
              handle: ".widget-drag-handle",
              cancel: "button:not(.widget-drag-handle),a,input,textarea,select,[role=menu]",
              bounded: true,
            }}
            resizeConfig={{
              enabled: editing && breakpoint !== "sm",
              handles: ["se"],
            }}
            compactor={noCompactor}
            onLayoutChange={updateGrid}
            className="widget-dashboard-grid"
          >
            {current.widgets.map((instance, index) => {
              const definition = findWidgetDefinition(
                definitions,
                instance.moduleId,
                instance.widgetId,
              );
              const available = definition && enabledIds.has(instance.moduleId);
              const position = instance.layouts[breakpoint];
              const cols = DASHBOARD_BREAKPOINTS[breakpoint].cols;
              const sizes = resolvedWidgetSizes(definition?.widget);
              return (
                <div
                  key={instance.instanceId}
                  data-widget-instance={instance.instanceId}
                  className="min-h-0"
                >
                  <WidgetShell
                    title={definition?.widget.name ?? instance.widgetId}
                    moduleName={definition?.module.name ?? instance.moduleId}
                    icon={definition?.widget.icon ?? definition?.module.icon}
                    editing={editing}
                    unavailable={!available}
                    canMove={{
                      left: breakpoint !== "sm" && position.x > 0,
                      right:
                        breakpoint !== "sm" &&
                        position.x + position.w < cols,
                      up: breakpoint === "sm" ? index > 0 : position.y > 0,
                      down:
                        breakpoint === "sm"
                          ? index < current.widgets.length - 1
                          : true,
                    }}
                    canResize={{
                      larger:
                        position.h < sizes.maxSize.h ||
                        (breakpoint !== "sm" &&
                          position.w < Math.min(cols, sizes.maxSize.w)),
                      smaller:
                        position.h > sizes.minSize.h ||
                        (breakpoint !== "sm" &&
                          position.w > Math.min(cols, sizes.minSize.w)),
                    }}
                    onRemove={() => removeWidget(instance.instanceId)}
                    onMove={(direction) => moveWidget(instance, direction)}
                    onResize={(direction) => resizeWidget(instance, direction)}
                  >
                    {available ? (
                      <WidgetMount
                        definition={definition}
                        instanceId={instance.instanceId}
                        displayMode={displayMode(position)}
                        config={instance.config}
                      />
                    ) : (
                      <WidgetEmpty
                        title="Module unavailable"
                        description="The saved position is being kept. This widget will return when its module is registered and enabled."
                      />
                    )}
                  </WidgetShell>
                </div>
              );
            })}
          </ResponsiveGridLayout>
        ) : null}
      </div>

      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>
    </section>
  );
}
