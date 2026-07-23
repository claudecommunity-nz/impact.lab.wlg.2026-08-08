"use client";

import { useMemo } from "react";
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
  SignalFeed,
  SignalMap,
  useSignalAggregates,
  useSignalHistory,
  useSignals,
} from "@wcc-impact/plugin-sdk";
import {
  mergeRecentModuleSignals,
  resolveModuleReportState,
} from "../lib/module-signals";

/**
 * The free page every data-only module gets (PLAN §4.3): a live map + feed
 * filtered to the module's own signals. Description and health render in the
 * shared module-page header (ModulePageClient), so this is just the data view.
 *
 * @example <GeneratedModulePage id="team-outage-watch" />
 */
export function GeneratedModulePage({ id }: { id: string }) {
  const {
    signals: realtimeSignals,
    loading: realtimeLoading,
    error: realtimeError,
  } = useSignals({ moduleId: id });
  const history = useSignalHistory({ moduleId: id }, 100);
  const {
    aggregates,
    loading: aggregateLoading,
    stale: aggregateStale,
    error: aggregateError,
  } = useSignalAggregates();
  const signals = useMemo(
    () => mergeRecentModuleSignals(id, history.signals, realtimeSignals),
    [history.signals, id, realtimeSignals],
  );
  const total = aggregates?.byModule[id] ?? null;
  const reportState = resolveModuleReportState({
    rowCount: signals.length,
    total,
    historyLoading: history.loading,
    historyError: history.error,
    realtimeLoading,
    aggregateLoading,
    aggregateError,
  });

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="ops-kicker">Module operating picture</div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Location and report detail from this module only. Map and feed show
            the latest 100 reports.
          </p>
        </div>
        {total == null && aggregateLoading ? (
          <Skeleton className="h-6 w-32" />
        ) : (
          <Badge variant="secondary" className="text-xs font-medium tabular-nums">
            {total == null
              ? "Total unavailable"
              : `${total.toLocaleString("en-NZ")} report${total === 1 ? "" : "s"} recorded`}
          </Badge>
        )}
      </div>

      {(history.error ||
        history.stale ||
        realtimeError ||
        aggregateError ||
        aggregateStale) &&
        signals.length > 0 && (
          <p
            className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
            role="status"
          >
            Showing the latest {signals.length.toLocaleString("en-NZ")} cached
            reports
            {total != null
              ? ` from ${total.toLocaleString("en-NZ")} recorded`
              : ""}
            . Some live data could not be refreshed.
          </p>
        )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(340px,0.85fr)]">
        <Card className="ops-panel h-[58vh] min-h-[380px] gap-0 overflow-hidden rounded-lg py-0">
          <CardHeader className="ops-panel-header">
            <CardTitle className="text-sm font-semibold">Module map</CardTitle>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 p-0">
            {reportState === "loading" ? (
              <ModulePanelState label="Loading module locations…" />
            ) : reportState === "unavailable" ? (
              <ModulePanelState label="Module reports are temporarily unavailable." />
            ) : reportState === "empty" ? (
              <ModulePanelState label="No reports have been published by this module yet." />
            ) : (
              <SignalMap signals={signals} className="h-full w-full" />
            )}
          </CardContent>
        </Card>

        <Card className="ops-panel h-[58vh] min-h-[380px] gap-0 overflow-hidden rounded-lg py-0">
          <CardHeader className="ops-panel-header">
            <CardTitle className="text-sm font-semibold">Latest reports</CardTitle>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 p-0">
            {reportState === "loading" ? (
              <ModulePanelState label="Loading recent module reports…" />
            ) : reportState === "unavailable" ? (
              <ModulePanelState label="Module reports are temporarily unavailable." />
            ) : reportState === "empty" ? (
              <ModulePanelState label="No reports have been published by this module yet." />
            ) : (
              <SignalFeed
                signals={signals}
                className="h-full overflow-y-auto"
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ModulePanelState({ label }: { label: string }) {
  return (
    <div
      className="flex h-full min-h-[330px] items-center justify-center bg-muted/15 p-6 text-center text-sm text-muted-foreground"
      role="status"
    >
      {label}
    </div>
  );
}
