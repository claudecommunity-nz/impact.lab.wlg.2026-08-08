"use client";

import type { ReactNode } from "react";
import { LocateFixed, RefreshCw, TriangleAlert, X } from "lucide-react";
import type { MapLocationSelection } from "@wcc-impact/plugin-sdk";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Spinner,
} from "@wcc-impact/plugin-sdk";
import { severityColor, timeAgo } from "@wcc-impact/ui";
import type { LocationInsightState } from "../lib/location-insight";

const RADII = [
  { label: "500 m", value: 500 },
  { label: "1 km", value: 1_000 },
  { label: "3 km", value: 3_000 },
] as const;

function distanceLabel(distanceM: number): string {
  return distanceM < 1_000
    ? `${Math.round(distanceM)} m`
    : `${(distanceM / 1_000).toFixed(1)} km`;
}

function typeLabel(value: string): string {
  return value.replaceAll("-", " ");
}

export function LocationInsightOverlay({
  selection,
  radiusM,
  onRadiusChange,
  onClose,
  insight,
}: {
  selection: MapLocationSelection | null;
  radiusM: number;
  onRadiusChange: (radiusM: number) => void;
  onClose: () => void;
  insight: LocationInsightState;
}) {
  if (!selection) {
    return (
      <div className="pointer-events-none absolute inset-x-3 bottom-3 z-20 flex md:inset-x-auto md:left-3">
        <div className="flex items-center gap-2 rounded-full border border-border/80 bg-background/95 px-3 py-2 text-xs font-medium text-foreground shadow-lg backdrop-blur">
          <LocateFixed className="size-4 text-primary" aria-hidden />
          Click the map or a report to inspect nearby evidence
        </div>
      </div>
    );
  }

  const { summary } = insight;

  return (
    <div className="pointer-events-none absolute inset-x-3 top-3 bottom-3 z-20 flex items-end md:right-auto md:left-3 md:w-[430px]">
      <Card
        className="pointer-events-auto max-h-full w-full gap-0 overflow-y-auto border-border/80 bg-background/95 py-0 shadow-2xl backdrop-blur"
        aria-live="polite"
      >
        <CardHeader className="gap-2 border-b border-border px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <LocateFixed className="size-4 shrink-0 text-primary" aria-hidden />
                <CardTitle className="text-sm">What’s happening here?</CardTitle>
              </div>
              {selection.title ? (
                <p className="mt-1 truncate text-xs font-medium text-foreground">
                  {selection.title}
                </p>
              ) : null}
              <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                {selection.lat.toFixed(5)}, {selection.lng.toFixed(5)} · last 24 hours ·
                nearest 40 max
              </p>
            </div>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              className="shrink-0"
              onClick={onClose}
              aria-label="Close location insight"
            >
              <X aria-hidden />
            </Button>
          </div>
          <div className="flex items-center gap-1" aria-label="Search radius">
            {RADII.map((radius) => (
              <Button
                key={radius.value}
                type="button"
                size="xs"
                variant={radiusM === radius.value ? "default" : "outline"}
                onClick={() => onRadiusChange(radius.value)}
                aria-pressed={radiusM === radius.value}
              >
                {radius.label}
              </Button>
            ))}
          </div>
        </CardHeader>

        <CardContent className="space-y-3 px-4 py-3">
          {insight.loading ? (
            <div className="flex min-h-24 items-center justify-center gap-2 text-sm text-muted-foreground">
              <Spinner />
              Checking nearby reports…
            </div>
          ) : insight.error ? (
            <div className="rounded-lg border border-destructive/35 bg-destructive/[0.06] p-3">
              <p className="text-sm font-semibold text-destructive">
                Nearby evidence unavailable
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{insight.error}</p>
              <Button
                type="button"
                size="xs"
                variant="outline"
                className="mt-2"
                onClick={insight.refresh}
              >
                <RefreshCw aria-hidden />
                Retry
              </Button>
            </div>
          ) : summary.activeCount === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-muted/25 p-4 text-center">
              <p className="text-sm font-semibold text-foreground">
                No active reports in this radius
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                This means no shared evidence was found, not that the location is safe.
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2">
                <SummaryMetric label="Active shown" value={summary.activeCount} />
                <SummaryMetric
                  label="Highest shown"
                  value={typeLabel(summary.highestSeverity)}
                  color={severityColor(summary.highestSeverity)}
                />
                <SummaryMetric label="Severe + shown" value={summary.seriousCount} />
              </div>

              <div className="flex flex-wrap gap-1.5 text-[11px]">
                <Badge variant="secondary">
                  {summary.moduleCount} module{summary.moduleCount === 1 ? "" : "s"}
                </Badge>
                <Badge variant="secondary">
                  {summary.sourceTypeCount} source type
                  {summary.sourceTypeCount === 1 ? "" : "s"}
                </Badge>
                <Badge variant="secondary">
                  {summary.verifiedOrOfficialCount} verified / official
                </Badge>
                {summary.typeCounts.slice(0, 3).map(({ signalType, count }) => (
                  <Badge key={signalType} variant="outline">
                    {typeLabel(signalType)} {count}
                  </Badge>
                ))}
              </div>

              {insight.resultsTruncated ? (
                <InsightWarning>
                  Showing the nearest 40 reports. More evidence may exist in this radius,
                  so counts and highest severity are incomplete.
                </InsightWarning>
              ) : null}

              {insight.rejectedRowCount > 0 ? (
                <InsightWarning>
                  {insight.rejectedRowCount} returned report
                  {insight.rejectedRowCount === 1 ? " could" : "s could"} not be
                  interpreted. This summary is incomplete.
                </InsightWarning>
              ) : null}

              {summary.coarseLocationCount > 0 ? (
                <InsightWarning>
                  {summary.coarseLocationCount} report
                  {summary.coarseLocationCount === 1 ? " uses" : "s use"} a suburb,
                  region, or unknown centroid. Distances are indicative.
                </InsightWarning>
              ) : null}

              <div>
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Priority evidence nearby
                </p>
                <div className="divide-y divide-border rounded-lg border border-border bg-card">
                  {summary.topReports.map((report) => (
                    <div key={report.signal.id} className="px-3 py-2">
                      <div className="flex items-start gap-2">
                        <span
                          className="mt-1.5 size-2 shrink-0 rounded-full"
                          style={{ backgroundColor: severityColor(report.signal.severity) }}
                          aria-hidden
                        />
                        <div className="min-w-0 flex-1">
                          <p className="line-clamp-2 text-xs font-semibold leading-snug text-foreground">
                            {report.signal.title}
                          </p>
                          <p className="mt-1 text-[10px] text-muted-foreground">
                            {distanceLabel(report.distanceM)} ·{" "}
                            {timeAgo(report.eventAt)} · {report.signal.verification}
                            {report.signal.place_name
                              ? ` · ${report.signal.place_name}`
                              : ""}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          <p className="text-[10px] leading-relaxed text-muted-foreground">
            Nearby reports are evidence, not a confirmed incident. Verification and
            operational judgement still apply.
            {summary.dismissedCount > 0
              ? ` ${summary.dismissedCount} dismissed report${
                  summary.dismissedCount === 1 ? " was" : "s were"
                } excluded.`
              : ""}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function InsightWarning({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-2 rounded-lg border border-severity-moderate/40 bg-severity-moderate/10 p-2.5 text-[11px] leading-relaxed text-foreground">
      <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <span>{children}</span>
    </div>
  );
}

function SummaryMetric({
  label,
  value,
  color,
}: {
  label: string;
  value: number | string;
  color?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 px-2.5 py-2">
      <p className="flex items-center gap-1.5 text-sm font-bold capitalize text-foreground">
        {color ? (
          <span
            className="size-2 shrink-0 rounded-full"
            style={{ backgroundColor: color }}
            aria-hidden
          />
        ) : null}
        {value}
      </p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}
