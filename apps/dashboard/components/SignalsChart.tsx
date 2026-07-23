"use client";

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { SEVERITY_COLORS } from "@wcc-impact/ui";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@wcc-impact/ui/components/ui/chart";
import type { TimeBucket } from "../lib/cop";

// Data marks use the FIXED severity hex (theme-independent); ChartContainer maps
// each config key to a --color-<key> var. Chrome (axes/grid/tooltip) inherits
// the theme via the shadcn chart wrapper — never hardcoded.
const config = {
  extreme: { label: "Extreme", color: SEVERITY_COLORS.extreme },
  severe: { label: "Severe", color: SEVERITY_COLORS.severe },
  moderate: { label: "Moderate", color: SEVERITY_COLORS.moderate },
  minor: { label: "Minor", color: SEVERITY_COLORS.minor },
  unknown: { label: "Unknown", color: SEVERITY_COLORS.unknown },
} satisfies ChartConfig;

// "unknown" stacks first (the platform default severity — dropping it would
// hide every signal published without an explicit severity).
const KEYS = ["unknown", "minor", "moderate", "severe", "extreme"] as const;

/**
 * Signals over the last 3h, stacked by severity — the one view a table can't
 * give: trajectory. Calm styling (no dots, faint grid, low fill opacity).
 */
export function SignalsChart({ buckets }: { buckets: TimeBucket[] }) {
  return (
    <ChartContainer config={config} className="h-full w-full">
      <AreaChart data={buckets} margin={{ left: -20, right: 8, top: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeOpacity={0.2} />
        <XAxis
          dataKey="t"
          tickLine={false}
          axisLine={false}
          minTickGap={40}
          tick={{ fontSize: 10 }}
        />
        <YAxis tickLine={false} axisLine={false} width={28} allowDecimals={false} tick={{ fontSize: 10 }} />
        <ChartTooltip content={<ChartTooltipContent />} />
        {KEYS.map((k) => (
          <Area
            key={k}
            dataKey={k}
            stackId="1"
            type="monotone"
            stroke={`var(--color-${k})`}
            fill={`var(--color-${k})`}
            fillOpacity={0.22}
            strokeWidth={1.5}
            isAnimationActive={false}
          />
        ))}
      </AreaChart>
    </ChartContainer>
  );
}
