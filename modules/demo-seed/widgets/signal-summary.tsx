"use client";

import { useMemo } from "react";
import {
  WidgetContent,
  WidgetMetric,
  WidgetSkeleton,
  useSignals,
  type WidgetProps,
} from "@wcc-impact/plugin-sdk";

const MODULE_ID = "demo-seed";

/** Reference metric widget: body only; the dashboard supplies the shared Card. */
export default function SignalSummaryWidget({ displayMode }: WidgetProps) {
  const { signals, loading } = useSignals({ moduleId: MODULE_ID });
  const severe = useMemo(
    () =>
      signals.filter(
        (signal) => signal.severity === "severe" || signal.severity === "extreme",
      ).length,
    [signals],
  );

  if (loading && signals.length === 0) return <WidgetSkeleton rows={2} />;

  return (
    <WidgetContent>
      <WidgetMetric
        label="Scenario signals"
        value={signals.length}
        hint={`${severe} serious · live from the shared feed`}
      >
        {displayMode !== "compact" && (
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-severity-severe"
              style={{
                width: `${signals.length ? Math.max(3, (severe / signals.length) * 100) : 0}%`,
              }}
            />
          </div>
        )}
      </WidgetMetric>
    </WidgetContent>
  );
}
