"use client";

import { useMemo } from "react";
import {
  Badge,
  WidgetContent,
  WidgetEmpty,
  useSignals,
  type Signal,
  type WidgetProps,
} from "@wcc-impact/plugin-sdk";

const SEVERITY_RANK: Record<Signal["severity"], number> = {
  unknown: 0,
  minor: 1,
  moderate: 2,
  severe: 3,
  extreme: 4,
};

function text(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

export default function SignalWatchWidget({
  config,
  displayMode,
}: WidgetProps) {
  const { signals } = useSignals();
  const focus = text(config.focus, "fire").trim();
  const minimumSeverity = text(config.minimumSeverity, "all");
  const verifiedOnly = config.verifiedOnly === true;
  const threshold =
    minimumSeverity === "all"
      ? 0
      : SEVERITY_RANK[minimumSeverity as Signal["severity"]] ?? 0;

  const matches = useMemo(() => {
    const needle = focus.toLowerCase();
    return signals
      .filter((signal) => {
        const searchable = [
          signal.title,
          signal.description,
          signal.signal_type,
          signal.place_name,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return (
          (!needle || searchable.includes(needle)) &&
          SEVERITY_RANK[signal.severity] >= threshold &&
          (!verifiedOnly ||
            signal.verification === "verified" ||
            signal.source_type === "official")
        );
      })
      .slice(0, displayMode === "expanded" ? 10 : displayMode === "compact" ? 3 : 6);
  }, [displayMode, focus, signals, threshold, verifiedOnly]);

  if (matches.length === 0) {
    return (
      <WidgetEmpty
        title={`No ${focus || "matching"} signals`}
        description="Edit this widget to change its focus or filters."
      />
    );
  }

  return (
    <WidgetContent className="p-0">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="truncate text-xs text-muted-foreground">
          Monitoring <strong className="text-foreground">{focus || "all signals"}</strong>
        </span>
        <Badge variant="outline">{matches.length} recent</Badge>
      </div>
      <ul className="min-h-0 flex-1 divide-y divide-border overflow-y-auto">
        {matches.map((signal) => (
          <li key={signal.id} className="space-y-1 px-3 py-2.5">
            <p className="line-clamp-2 text-sm leading-snug font-medium text-foreground">
              {signal.title}
            </p>
            <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <span className="capitalize">{signal.severity}</span>
              {signal.place_name && (
                <>
                  <span aria-hidden>·</span>
                  <span className="truncate">{signal.place_name}</span>
                </>
              )}
            </p>
          </li>
        ))}
      </ul>
    </WidgetContent>
  );
}
