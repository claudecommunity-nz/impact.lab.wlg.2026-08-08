"use client";

import { AlertOctagon, AlertTriangle, Radar, ShieldCheck } from "lucide-react";
import { cn } from "@wcc-impact/ui";
import type { ThreatStatus, ThreatLevel } from "../lib/cop";

// Each level owns its own chrome. These are alert-status colours (their own
// scale), deliberately NOT the per-signal severity data scale.
const STYLES: Record<
  ThreatLevel,
  { wrap: string; chip: string; Icon: typeof Radar }
> = {
  critical: {
    wrap: "border-destructive/40 bg-destructive/10",
    chip: "bg-destructive text-destructive-foreground",
    Icon: AlertOctagon,
  },
  major: {
    wrap: "border-urgency/40 bg-urgency/10",
    chip: "bg-urgency text-urgency-foreground",
    Icon: AlertTriangle,
  },
  elevated: {
    wrap: "border-amber-500/40 bg-amber-500/10",
    chip: "bg-amber-500 text-black",
    Icon: AlertTriangle,
  },
  monitoring: {
    wrap: "border-border bg-card",
    chip: "bg-ok/15 text-ok",
    Icon: ShieldCheck,
  },
};

/**
 * The first-3-seconds answer: a computed status banner whose colour + one word
 * says "how bad, right now" before anyone reads. Level is derived from active
 * signals (see deriveThreat), never hand-set.
 */
export function SituationBanner({
  threat,
  updated,
}: {
  threat: ThreatStatus;
  updated: string;
}) {
  const s = STYLES[threat.level];
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border px-4 py-3",
        s.wrap,
      )}
    >
      <span
        className={cn(
          "flex items-center gap-2 rounded-md px-2.5 py-1 text-xs font-bold tracking-wide uppercase",
          s.chip,
        )}
      >
        <s.Icon className="size-4" />
        {threat.label}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{threat.headline}</p>
        <p className="truncate text-xs text-muted-foreground">{threat.action}</p>
      </div>
      <span className="flex items-center gap-1.5 text-[11px] whitespace-nowrap text-muted-foreground tabular-nums">
        <Radar className="size-3.5" />
        Updated {updated}
      </span>
    </div>
  );
}
