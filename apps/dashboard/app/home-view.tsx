"use client";

import { useMemo } from "react";
import {
  Card,
  CardContent,
  SignalMap,
  useModules,
  useSignals,
  SEVERITY_COLORS,
} from "@wcc-impact/plugin-sdk";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@wcc-impact/ui/components/ui/tabs";
import { HealthStrip } from "../components/HealthStrip";
import { SituationBanner } from "../components/SituationBanner";
import { StatTile, SeverityMeter } from "../components/StatTile";
import { SignalsChart } from "../components/SignalsChart";
import { CopRail } from "../components/CopRail";
import { deriveCop, ago, type ThreatLevel } from "../lib/cop";
import { useNow } from "../lib/use-now";

const THREAT_ACCENT: Record<ThreatLevel, string> = {
  critical: SEVERITY_COLORS.extreme,
  major: SEVERITY_COLORS.severe,
  elevated: SEVERITY_COLORS.moderate,
  monitoring: SEVERITY_COLORS.minor,
};

/** Tiny consistent panel header (uppercase label + optional source caption). */
function PanelLabel({ children, caption }: { children: string; caption?: string }) {
  return (
    <div className="flex items-center justify-between px-4 pt-3 pb-2">
      <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        {children}
      </span>
      {caption && <span className="text-[11px] text-muted-foreground/70">{caption}</span>}
    </div>
  );
}

export function HomeView() {
  const { signals } = useSignals();
  const { modules } = useModules();
  const now = useNow(15_000);
  const cop = useMemo(() => deriveCop(signals, modules, now), [signals, modules, now]);
  const updated = signals.length ? ago(signals[0]?.created_at, now) : "—";

  return (
    <div className="flex flex-col gap-3 p-3 md:p-4">
      {/* Status banner — the 3-second answer */}
      <SituationBanner threat={cop.threat} updated={updated} />

      {/* KPI row — auto-fits without breakpoints */}
      <section className="grid shrink-0 gap-3 [grid-template-columns:repeat(auto-fit,minmax(170px,1fr))]">
        <StatTile
          label="Threat level"
          value={cop.threat.label}
          accent={THREAT_ACCENT[cop.threat.level]}
          hint={`${cop.criticalCount} serious hazard${cop.criticalCount === 1 ? "" : "s"}`}
        />
        <StatTile label="Active signals" value={cop.total} hint="tracked now">
          <SeverityMeter counts={cop.severityCounts} />
        </StatTile>
        <StatTile
          label="New (15 min)"
          value={cop.new15}
          delta={cop.velocity}
          hint="vs previous 15 min"
        />
        <StatTile label="Suburbs affected" value={cop.suburbs.length} hint="areas with signals" />
        <StatTile
          label="Needs triage"
          value={cop.needsTriage}
          accent={cop.needsTriage > 0 ? "var(--urgency)" : undefined}
          hint="unverified reports"
        />
        <StatTile
          label="Verified"
          value={`${cop.verifiedPct}%`}
          deltaGood
          hint={`${cop.officialActive} official active`}
        />
      </section>

      {/* Body: map+analytics scroll; the rail sticks alongside on desktop */}
      <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* Left: the map is the centre of gravity — full width, dominant */}
        <div className="flex flex-col gap-3">
          <div className="h-[56vh] min-h-[440px] overflow-hidden rounded-lg border border-border">
            <SignalMap className="h-full w-full" />
          </div>

          <section className="grid shrink-0 gap-3 sm:grid-cols-2">
            <Card className="h-56 gap-0 overflow-hidden py-0">
              <PanelLabel caption="last 3h · by severity">Signal volume</PanelLabel>
              <CardContent className="h-[calc(100%-2.5rem)] px-2 pb-2">
                <SignalsChart buckets={cop.buckets} />
              </CardContent>
            </Card>

            <Card className="h-56 gap-0 overflow-hidden py-0">
              <Tabs defaultValue="severity" className="flex h-full flex-col gap-0">
                <div className="flex items-center justify-between px-4 pt-3 pb-2">
                  <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                    Breakdown
                  </span>
                  <TabsList className="h-7">
                    <TabsTrigger value="severity" className="h-5 px-2 text-[11px]">
                      Severity
                    </TabsTrigger>
                    <TabsTrigger value="source" className="h-5 px-2 text-[11px]">
                      Source
                    </TabsTrigger>
                  </TabsList>
                </div>
                <CardContent className="min-h-0 flex-1 px-4 pb-4">
                  <TabsContent value="severity" className="mt-0 flex flex-col gap-2.5">
                    {(["extreme", "severe", "moderate", "minor", "unknown"] as const).map((sev) => (
                      <Row
                        key={sev}
                        color={SEVERITY_COLORS[sev]}
                        label={sev}
                        n={cop.severityCounts[sev]}
                        total={cop.total}
                      />
                    ))}
                  </TabsContent>
                  <TabsContent value="source" className="mt-0 flex flex-col gap-2.5">
                    {(["official", "community", "media", "sensor"] as const).map((src) => (
                      <Row
                        key={src}
                        color="var(--muted-foreground)"
                        label={src}
                        n={cop.sourceCounts[src]}
                        total={cop.total}
                      />
                    ))}
                  </TabsContent>
                </CardContent>
              </Tabs>
            </Card>
          </section>
        </div>

        {/* Right rail: module health + tabbed density tables. Sticky on desktop
            so it stays in view while the map/analytics column scrolls. */}
        <aside className="flex flex-col gap-3 lg:sticky lg:top-3 lg:h-[calc(100dvh-1.5rem)]">
          <Card className="shrink-0 gap-0 py-0">
            <PanelLabel caption={`${modules.filter((m) => m.enabled).length} live`}>
              Module health
            </PanelLabel>
            <CardContent className="px-3 pb-3">
              <HealthStrip />
            </CardContent>
          </Card>
          <Card className="flex min-h-0 flex-1 flex-col overflow-hidden py-0 max-lg:h-[70vh]">
            <CopRail cop={cop} />
          </Card>
        </aside>
      </div>
    </div>
  );
}

function Row({
  color,
  label,
  n,
  total,
}: {
  color: string;
  label: string;
  n: number;
  total: number;
}) {
  const pct = total ? Math.round((n / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2.5">
      <span className="size-2 shrink-0 rounded-full" style={{ background: color }} aria-hidden />
      <span className="w-20 shrink-0 text-xs capitalize text-foreground">{label}</span>
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
        <span className="block h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </span>
      <span className="w-12 text-right text-[11px] text-muted-foreground tabular-nums">
        {n} · {pct}%
      </span>
    </div>
  );
}
