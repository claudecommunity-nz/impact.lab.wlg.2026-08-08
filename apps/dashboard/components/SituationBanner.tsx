"use client";

import { AlertOctagon, AlertTriangle, Radar, ShieldCheck } from "lucide-react";
import { cn } from "@wcc-impact/ui";
import type { ThreatStatus, ThreatLevel } from "../lib/cop";

// Each level owns its own chrome. These are alert-status colours (their own
// scale), deliberately NOT the per-signal severity data scale.
const STYLES: Record<
  ThreatLevel,
  { wrap: string; chip: string; stripe: string; Icon: typeof Radar }
> = {
  critical: {
    wrap: "border-destructive/50 bg-destructive/[0.08]",
    chip: "bg-destructive text-destructive-foreground",
    stripe: "before:bg-destructive",
    Icon: AlertOctagon,
  },
  major: {
    wrap: "border-urgency/50 bg-urgency/[0.08]",
    chip: "bg-urgency text-urgency-foreground",
    stripe: "before:bg-urgency",
    Icon: AlertTriangle,
  },
  elevated: {
    wrap: "border-amber-500/50 bg-amber-500/[0.08]",
    chip: "bg-amber-500 text-black",
    stripe: "before:bg-amber-500",
    Icon: AlertTriangle,
  },
  monitoring: {
    wrap: "border-emerald-500/30 bg-emerald-500/[0.055]",
    chip: "border border-emerald-400/25 bg-emerald-400/10 text-emerald-600 dark:text-emerald-300",
    stripe: "before:bg-emerald-500",
    Icon: ShieldCheck,
  },
  unconfirmed: {
    wrap: "border-amber-500/40 bg-amber-500/[0.07]",
    chip:
      "border border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200",
    stripe: "before:bg-amber-500",
    Icon: AlertTriangle,
  },
};

/**
 * The first-3-seconds answer: a computed status banner whose colour + one word
 * says "how bad, right now" before anyone reads. Level is derived from active
 * signals (see deriveThreat), never hand-set.
 */
export function SituationBanner({
  threat,
  latestReport,
}: {
  threat: ThreatStatus;
  latestReport: string | null;
}) {
  const s = STYLES[threat.level];
  return (
    <div
      role="region"
      aria-label="Regional status"
      className={cn(
        "ops-panel relative grid min-h-16 grid-cols-[1fr_auto] items-center gap-x-3 gap-y-2 overflow-hidden rounded-lg border px-4 py-3.5 before:absolute before:inset-y-0 before:left-0 before:w-1 sm:grid-cols-[auto_minmax(0,1fr)_auto] md:px-5",
        s.wrap,
        s.stripe,
      )}
    >
      <span
        className={cn(
          "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[11px] font-bold tracking-[0.12em] uppercase",
          s.chip,
        )}
      >
        <s.Icon className="size-3.5" />
        {threat.label}
      </span>
      <div className="col-span-2 min-w-0 sm:col-span-1">
        <p className="text-sm leading-snug font-semibold text-foreground">{threat.headline}</p>
        <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{threat.action}</p>
      </div>
      <span className="col-start-2 row-start-1 flex items-center gap-1.5 rounded-md bg-background/55 px-2 py-1 text-[11px] font-medium whitespace-nowrap text-muted-foreground tabular-nums sm:col-start-3">
        <Radar className="size-3.5" />
        {latestReport ? `Latest report ${latestReport}` : "No reports received"}
      </span>
    </div>
  );
}
