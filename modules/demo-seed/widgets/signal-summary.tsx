"use client";

import { useMemo } from "react";
import {
  WidgetContent,
  WidgetEmpty,
  WidgetMetric,
  WidgetSkeleton,
  useSignalAggregates,
  useSignalHistory,
  type WidgetProps,
} from "@wcc-impact/plugin-sdk";

const MODULE_ID = "demo-seed";

/** Reference metric widget: body only; the dashboard supplies the shared Card. */
export default function SignalSummaryWidget({ displayMode }: WidgetProps) {
  const {
    aggregates,
    loading,
    stale,
    error,
  } = useSignalAggregates();
  const recent = useSignalHistory({ moduleId: MODULE_ID }, 100);
  const signalTotal = aggregates?.byModule[MODULE_ID] ?? null;
  const severe = useMemo(
    () =>
      recent.signals.filter(
        (signal) => signal.severity === "severe" || signal.severity === "extreme",
      ).length,
    [recent.signals],
  );

  if (loading && signalTotal == null) return <WidgetSkeleton rows={2} />;
  if (error && signalTotal == null) {
    return (
      <WidgetEmpty
        title="Scenario totals unavailable"
        description="The last confirmed database total could not be loaded."
      />
    );
  }

  return (
    <WidgetContent>
      <WidgetMetric
        label="Scenario signals"
        value={(signalTotal ?? 0).toLocaleString("en-NZ")}
        hint={
          recent.loading
            ? "Loading the latest severity sample…"
            : recent.error && recent.signals.length === 0
              ? "Latest severity sample unavailable"
            : `${severe} serious in latest ${recent.signals.length}${stale ? " · last confirmed total" : ""}`
        }
      >
        {displayMode !== "compact" && recent.signals.length > 0 && (
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-severity-severe"
              style={{
                width: `${Math.max(3, (severe / recent.signals.length) * 100)}%`,
              }}
            />
          </div>
        )}
      </WidgetMetric>
    </WidgetContent>
  );
}
