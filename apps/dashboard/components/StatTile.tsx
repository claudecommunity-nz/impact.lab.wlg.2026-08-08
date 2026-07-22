"use client";

import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { Card, CardContent, cn, SEVERITY_COLORS } from "@wcc-impact/ui";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@wcc-impact/ui/components/ui/hover-card";
import type { Severity } from "@wcc-impact/shared";

/**
 * One KPI tile: uppercase label, big tabular-nums value, optional signed delta
 * caret, a hint line, and a slot for a meter/sparkline. The KPI row is just a
 * grid of these — the backbone of a dense-but-calm ops header.
 */
export function StatTile({
  label,
  value,
  delta,
  deltaGood,
  hint,
  accent,
  children,
}: {
  label: string;
  value: ReactNode;
  delta?: number;
  /** whether a positive delta is good (green) or bad (red). Default: bad. */
  deltaGood?: boolean;
  hint?: string;
  accent?: string;
  children?: ReactNode;
}) {
  const showDelta = delta != null && delta !== 0;
  const positive = (delta ?? 0) > 0;
  // For most ops metrics, "more" is bad (rising hazards); flip with deltaGood.
  const good = positive ? deltaGood === true : deltaGood !== true;
  return (
    <Card
      className="gap-0 py-3.5 shadow-none"
      style={accent ? { borderLeftColor: accent, borderLeftWidth: 3 } : undefined}
    >
      <CardContent className="flex flex-col gap-1 px-4">
        <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
          {label}
        </span>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl leading-none font-semibold tabular-nums text-foreground">
            {value}
          </span>
          {delta != null && (
            <span
              className={cn(
                "flex items-center gap-0.5 text-xs font-medium tabular-nums",
                !showDelta
                  ? "text-muted-foreground"
                  : good
                    ? "text-ok"
                    : "text-urgency",
              )}
            >
              {!showDelta ? (
                <Minus className="size-3" />
              ) : positive ? (
                <ArrowUpRight className="size-3" />
              ) : (
                <ArrowDownRight className="size-3" />
              )}
              {Math.abs(delta)}
            </span>
          )}
        </div>
        {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
        {children && <div className="mt-2">{children}</div>}
      </CardContent>
    </Card>
  );
}

const METER_ORDER: Severity[] = ["extreme", "severe", "moderate", "minor", "unknown"];

/**
 * A single stacked severity bar (extreme→unknown), data-driven off the fixed
 * severity scale, with a HoverCard on each band for exact counts. The palette
 * itself teaches the CAP scale, so it's reused identically everywhere.
 */
export function SeverityMeter({
  counts,
  className,
}: {
  counts: Record<string, number>;
  className?: string;
}) {
  const total = Math.max(
    1,
    Object.values(counts).reduce((a, b) => a + b, 0),
  );
  return (
    <div className={cn("flex h-2 w-full overflow-hidden rounded-full bg-muted", className)}>
      {METER_ORDER.map((sev) => {
        const n = counts[sev] ?? 0;
        if (!n) return null;
        const pct = Math.round((n / total) * 100);
        return (
          <HoverCard key={sev} openDelay={80} closeDelay={40}>
            <HoverCardTrigger asChild>
              <div
                style={{ width: `${(n / total) * 100}%`, background: SEVERITY_COLORS[sev] }}
                className="h-full transition-[width] duration-500"
              />
            </HoverCardTrigger>
            <HoverCardContent className="w-auto px-3 py-1.5 text-xs">
              <span className="font-medium capitalize">{sev}</span> · {n} ({pct}%)
            </HoverCardContent>
          </HoverCard>
        );
      })}
    </div>
  );
}
