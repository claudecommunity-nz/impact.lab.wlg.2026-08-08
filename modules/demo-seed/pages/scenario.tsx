"use client";

import { useMemo } from "react";
import {
  Card,
  CardContent,
  SignalFeed,
  SignalMap,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  useSignalAggregates,
  useSignalHistory,
  useSignals,
} from "@wcc-impact/plugin-sdk";

const MODULE_ID = "demo-seed";

/**
 * demo-seed sub-page (/modules/demo-seed/scenario) — the live earthquake data
 * this module seeded, on the shared map + feed. Demonstrates a module having a
 * sub-navigation, not just one page.
 */
export default function ScenarioPage() {
  const {
    signals: realtimeSignals,
    error: realtimeError,
  } = useSignals({ moduleId: MODULE_ID });
  const history = useSignalHistory({ moduleId: MODULE_ID }, 100);
  const {
    aggregates,
    loading: aggregateLoading,
    stale: aggregateStale,
    error: aggregateError,
  } = useSignalAggregates();

  const signals = useMemo(() => {
    const byId = new Map(history.signals.map((signal) => [signal.id, signal]));
    for (const signal of realtimeSignals) byId.set(signal.id, signal);
    return [...byId.values()]
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 100);
  }, [history.signals, realtimeSignals]);

  const byType = useMemo(() => {
    if (aggregates) {
      return aggregates.moduleSignalTypes
        .filter((row) => row.moduleId === MODULE_ID)
        .map((row) => [row.signalType, row.count] as const)
        .sort((a, b) => b[1] - a[1]);
    }
    const sample = new Map<string, number>();
    for (const signal of signals) {
      sample.set(signal.signal_type, (sample.get(signal.signal_type) ?? 0) + 1);
    }
    return [...sample.entries()].sort((a, b) => b[1] - a[1]);
  }, [aggregates, signals]);
  const total = aggregates?.byModule[MODULE_ID] ?? null;
  const rowsLoading = history.loading && signals.length === 0;
  const rowsError = history.error ?? realtimeError;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Everything below is real data this module wrote to the shared{" "}
        <code className="rounded bg-muted px-1 py-0.5 text-xs">signals</code> table — the M6.5
        Wellington earthquake scenario, filtered to this module.
      </p>
      <div
        className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
        role="status"
      >
        <strong className="text-foreground">
          {total == null
            ? aggregateLoading
              ? "Loading scenario total…"
              : "Scenario total unavailable"
            : `${total.toLocaleString("en-NZ")} scenario reports`}
        </strong>
        <span aria-hidden="true">·</span>
        <span>
          {rowsLoading
            ? "Loading recent reports…"
            : `Showing the latest ${signals.length.toLocaleString("en-NZ")} on the map and feed`}
        </span>
        {(history.stale || aggregateStale) && <span>· Last confirmed data</span>}
      </div>
      {rowsError && signals.length === 0 && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-foreground">
          Recent scenario reports are temporarily unavailable. {rowsError}
        </p>
      )}
      {aggregateError && !aggregates && (
        <p className="text-xs text-muted-foreground">
          Exact scenario totals are temporarily unavailable.
        </p>
      )}
      <Tabs defaultValue="map" className="flex flex-col gap-3">
        <TabsList>
          <TabsTrigger value="map">Map</TabsTrigger>
          <TabsTrigger value="feed">Feed</TabsTrigger>
          <TabsTrigger value="types">By type</TabsTrigger>
        </TabsList>
        <TabsContent value="map">
          {rowsLoading ? (
            <LoadingPanel label="Loading recent scenario locations…" />
          ) : signals.length > 0 ? (
            <div className="h-[480px] overflow-hidden rounded-lg border border-border">
              <SignalMap signals={signals} className="h-full w-full" />
            </div>
          ) : (
            <EmptyPanel error={rowsError} />
          )}
        </TabsContent>
        <TabsContent value="feed">
          <Card className="max-h-[480px] overflow-y-auto py-0">
            <CardContent className="p-3">
              {rowsLoading ? (
                <p className="text-sm text-muted-foreground">Loading recent scenario reports…</p>
              ) : signals.length > 0 ? (
                <SignalFeed signals={signals} limit={60} />
              ) : (
                <EmptyPanel error={rowsError} compact />
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="types">
          <Card>
            <CardContent className="flex flex-col gap-2 py-4">
              {aggregateLoading && byType.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Loading the authoritative type breakdown…
                </p>
              )}
              {!aggregateLoading && byType.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  {aggregateError
                    ? "The type breakdown is temporarily unavailable."
                    : "No scenario reports have been published yet."}
                </p>
              )}
              {byType.map(([type, n]) => (
                <div key={type} className="flex items-center gap-3">
                  <span className="w-44 shrink-0 text-sm text-foreground">{type}</span>
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <span
                      className="block h-full rounded-full bg-primary"
                      style={{ width: `${(n / (byType[0]?.[1] ?? 1)) * 100}%` }}
                    />
                  </span>
                  <span className="w-10 text-right text-xs text-muted-foreground tabular-nums">
                    {n}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function LoadingPanel({ label }: { label: string }) {
  return (
    <div
      className="flex h-[480px] items-center justify-center rounded-lg border border-border bg-muted/20 text-sm text-muted-foreground"
      aria-busy="true"
    >
      {label}
    </div>
  );
}

function EmptyPanel({
  error,
  compact = false,
}: {
  error: string | null;
  compact?: boolean;
}) {
  return (
    <div
      className={
        compact
          ? "py-6 text-center text-sm text-muted-foreground"
          : "flex h-[480px] items-center justify-center rounded-lg border border-border bg-muted/20 p-6 text-center text-sm text-muted-foreground"
      }
    >
      {error
        ? "Recent scenario reports are temporarily unavailable."
        : "No scenario reports have been published yet."}
    </div>
  );
}
