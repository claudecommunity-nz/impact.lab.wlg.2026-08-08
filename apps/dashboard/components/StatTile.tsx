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
  icon,
  children,
}: {
  label: string;
  value: ReactNode;
  delta?: number;
  /** whether a positive delta is good (green) or bad (red). Default: bad. */
  deltaGood?: boolean;
  hint?: string;
  accent?: string;
  icon?: ReactNode;
  children?: ReactNode;
}) {
  const showDelta = delta != null && delta !== 0;
  const positive = (delta ?? 0) > 0;
  // For most ops metrics, "more" is bad (rising hazards); flip with deltaGood.
  const good = positive ? deltaGood === true : deltaGood !== true;
  return (
    <Card
      className="ops-panel group gap-0 overflow-hidden py-0 shadow-none motion-safe:transition-[border-color,transform] motion-safe:duration-200 motion-safe:hover:-translate-y-px hover:border-foreground/20"
      style={accent ? { borderTopColor: accent, borderTopWidth: 3 } : undefined}
    >
      <CardContent className="flex min-h-[104px] flex-col justify-between gap-2 px-4 py-3.5">
        <div className="flex items-start justify-between gap-2">
          <span className="ops-kicker">{label}</span>
          {icon && (
            <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground transition-colors group-hover:text-foreground">
              {icon}
            </span>
          )}
        </div>
        <div>
          <div className="flex items-baseline gap-2">
            <span className="text-[1.65rem] leading-none font-semibold tracking-[-0.035em] tabular-nums text-foreground">
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
          {hint && <span className="mt-1.5 block text-[10px] text-muted-foreground">{hint}</span>}
        </div>
        {children && <div>{children}</div>}
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
  const summary = METER_ORDER.map((severity) => `${severity} ${counts[severity] ?? 0}`).join(", ");
  return (
    <div
      role="img"
      aria-label={`Severity distribution: ${summary}`}
      className={cn("flex h-2 w-full overflow-hidden rounded-full bg-muted", className)}
    >
      {METER_ORDER.map((sev) => {
        const n = counts[sev] ?? 0;
        if (!n) return null;
        const pct = Math.round((n / total) * 100);
        return (
          <HoverCard key={sev} openDelay={80} closeDelay={40}>
            <HoverCardTrigger asChild>
              <div
                style={{ width: `${(n / total) * 100}%`, background: SEVERITY_COLORS[sev] }}
                className="h-full motion-safe:transition-[width] motion-safe:duration-500"
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
