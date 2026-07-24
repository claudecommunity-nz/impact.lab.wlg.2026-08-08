"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  Clock3,
  Layers3,
  LockKeyhole,
  LocateFixed,
  MapPinned,
  RadioTower,
  RefreshCw,
  ShieldAlert,
  TriangleAlert,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  SignalMap,
  Spinner,
  cn,
  useOperationalRevision,
  useSignals,
  useUser,
  type MapHighlight,
  type MapLocationSelection,
} from "@wcc-impact/plugin-sdk";
import { severityColor, timeAgo } from "@wcc-impact/ui";
import { LocationInsightOverlay } from "../../components/LocationInsightOverlay";
import { DemoRoleLogin } from "../../components/DemoRoleLogin";
import { useAudience } from "../../components/AudienceProvider";
import { useLocationInsight } from "../../lib/location-insight";
import {
  useSeriousPockets,
  type SeriousPocket,
} from "../../lib/serious-pockets";

const WINDOWS = [
  { hours: 6, label: "6 hours" },
  { hours: 24, label: "24 hours" },
  { hours: 168, label: "7 days" },
] as const;

function scopeLabel(hours: number): string {
  return hours === 168 ? "7 days" : `${hours} hours`;
}

function typeLabel(value: string): string {
  return value.replaceAll("-", " ");
}

function accuracyLabel(metres: number): string {
  return metres >= 1_000
    ? `${(metres / 1_000).toFixed(1)} km`
    : `${Math.round(metres)} m`;
}

export function RegionalMapView() {
  const { audience, setAudience } = useAudience();
  const [windowHours, setWindowHours] = useState(168);
  const [selection, setSelection] = useState<MapLocationSelection | null>(null);
  const [radiusM, setRadiusM] = useState(1_000);
  const { signals, loading: signalsLoading, error: signalsError } = useSignals();
  const { user, loading: userLoading } = useUser();
  const operationalRevision = useOperationalRevision();
  const signalRevision = `${signals[0]?.id ?? "none"}:${operationalRevision}`;
  const analysisEnabled = audience === "operations" && Boolean(user);
  const concentrations = useSeriousPockets({
    windowHours,
    signalRevision,
    enabled: analysisEnabled,
  });
  const locationInsight = useLocationInsight({
    selection,
    radiusM,
    windowHours,
    signalRevision,
  });
  const concentrationSnapshotPending = !concentrations.generatedAt;

  const visibleSignals = useMemo(() => {
    const since = Date.now() - windowHours * 60 * 60_000;
    return signals.filter((signal) => {
      const eventAt =
        signal.observed_at ?? signal.reported_at ?? signal.created_at;
      return (
        signal.verification !== "false_report" &&
        Date.parse(eventAt) >= since
      );
    });
  }, [signals, windowHours]);

  const highlights = useMemo<MapHighlight[]>(
    () =>
      concentrations.pockets.map((pocket) => ({
        id: pocket.key,
        lat: pocket.lat,
        lng: pocket.lng,
        label: pocket.label,
        count: pocket.seriousCount,
        highestSeverity: pocket.maxSeverity,
        extent: pocket.extent,
      })),
    [concentrations.pockets],
  );

  const inspectPocket = (pocket: SeriousPocket) => {
    setSelection({
      lat: pocket.lat,
      lng: pocket.lng,
      title: `Nearby evidence at the ${pocket.label} analysis cell`,
    });
  };

  return (
    <div className="ops-surface min-h-[calc(100dvh-2rem)] xl:h-[calc(100dvh-2rem)] xl:overflow-hidden">
      <div className="grid min-h-full xl:h-full xl:grid-cols-[minmax(0,1fr)_420px]">
        <section
          aria-labelledby="regional-map-heading"
          className="flex min-w-0 flex-col border-b border-border xl:border-r xl:border-b-0"
        >
          <header className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-border bg-card/95 px-3 py-2.5 backdrop-blur md:px-4">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <MapPinned className="size-5" aria-hidden />
              </span>
              <div className="min-w-0">
                <h1
                  id="regional-map-heading"
                  className="truncate text-base font-semibold text-foreground"
                >
                  Regional evidence map
                </h1>
                <p className="text-[11px] text-muted-foreground">
                  {audience === "operations"
                    ? "Shared report sample and severe/extreme analysis cells"
                    : "Latest shared report sample · analytical queue requires operations access"}
                </p>
              </div>
            </div>
            <div
              className="flex items-center gap-1 rounded-lg border border-border bg-background p-1"
              aria-label="Map time window"
              role="group"
            >
              {WINDOWS.map((window) => (
                <Button
                  key={window.hours}
                  type="button"
                  size="xs"
                  variant={windowHours === window.hours ? "default" : "ghost"}
                  onClick={() => setWindowHours(window.hours)}
                  aria-pressed={windowHours === window.hours}
                >
                  {window.label}
                </Button>
              ))}
            </div>
          </header>

          <div className="relative h-[58dvh] min-h-[390px] flex-1 bg-[#0b1823] xl:h-auto">
            <SignalMap
              signals={visibleSignals}
              highlights={highlights}
              className="h-full w-full"
              onLocationSelect={setSelection}
              selectedLocation={selection}
              focusSelectedLocation
            />

            <div className="pointer-events-none absolute top-3 right-14 z-10 hidden max-w-[260px] rounded-lg border border-border/80 bg-background/95 px-3 py-2 text-[10px] text-muted-foreground shadow-lg backdrop-blur lg:block">
              <div className="flex items-center gap-2 font-semibold text-foreground">
                <span className="size-2.5 rounded-full bg-severity-severe" aria-hidden />
                Individual report
              </div>
              <div className="mt-1.5 flex items-center gap-2 font-semibold text-foreground">
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-primary bg-[#0b2538] px-1 text-[9px] text-white" aria-hidden>
                  N
                </span>
                Automated 750 m analysis cell
              </div>
            </div>

            <LocationInsightOverlay
              selection={selection}
              radiusM={radiusM}
              onRadiusChange={setRadiusM}
              onClose={() => setSelection(null)}
              insight={locationInsight}
              windowHours={windowHours}
            />
          </div>
        </section>

        <aside
          aria-labelledby="concentrations-heading"
          className="min-h-0 bg-background xl:overflow-y-auto"
        >
          <div className="sticky top-0 z-20 border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Layers3 className="size-4 text-primary" aria-hidden />
                  <h2 id="concentrations-heading" className="text-sm font-semibold">
                    {audience === "operations"
                      ? "Report concentrations"
                      : "Operations analysis"}
                  </h2>
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  {audience === "operations"
                    ? `Bounded cells containing severe or extreme reported severity in the last ${scopeLabel(windowHours)}.`
                    : "Unreviewed report concentrations are restricted to authenticated response members."}
                </p>
              </div>
              {analysisEnabled ? <Button
                type="button"
                size="icon-sm"
                variant="outline"
                onClick={concentrations.refresh}
                disabled={concentrations.loading}
                aria-label="Refresh report concentrations"
              >
                <RefreshCw
                  className={cn(concentrations.loading && "animate-spin")}
                  aria-hidden
                />
              </Button> : null}
            </div>
          </div>

          <div className="space-y-3 p-3">
            {audience !== "operations" ? (
              <div className="rounded-lg border border-border bg-card p-4">
                <span className="flex size-9 items-center justify-center rounded-md bg-muted text-muted-foreground">
                  <LockKeyhole className="size-4.5" aria-hidden />
                </span>
                <h3 className="mt-3 text-sm font-semibold">
                  Response-member analysis
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Public visitors can inspect the latest report sample. The
                  severe/extreme concentration queue includes unreviewed evidence,
                  so database access requires an authenticated response role.
                </p>
                <Button
                  type="button"
                  size="sm"
                  className="mt-3"
                  onClick={() => setAudience("operations")}
                >
                  Open operations access
                </Button>
              </div>
            ) : userLoading ? (
              <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-muted-foreground">
                <Spinner />
                Checking response access…
              </div>
            ) : !user ? (
              <>
                <div className="rounded-lg border border-primary/35 bg-primary/[0.08] p-3 text-xs leading-relaxed">
                  Sign in with a response account to load unreviewed report
                  concentrations. PostgreSQL enforces this boundary; the
                  Operations switch alone does not grant access.
                </div>
                <DemoRoleLogin compact />
              </>
            ) : (
              <>
            <section
              aria-label="Concentration summary"
              className="grid grid-cols-2 gap-2"
            >
              <SidebarMetric
                label="Cells shown"
                value={
                  concentrationSnapshotPending
                    ? "—"
                    : `${concentrations.pockets.length} / ${concentrations.qualifyingPocketCount}`
                }
              />
              <SidebarMetric
                label="Severe + extreme"
                value={
                  concentrationSnapshotPending
                    ? "—"
                    : concentrations.qualifyingSeriousCount
                }
              />
              <SidebarMetric
                label="Unverified severe +"
                value={
                  concentrationSnapshotPending
                    ? "—"
                    : concentrations.qualifyingUnverifiedSeriousCount
                }
              />
              <SidebarMetric
                label="Reports analysed"
                value={
                  concentrationSnapshotPending
                    ? "—"
                    : concentrations.candidateCount
                }
              />
            </section>

            <div className="flex items-start gap-2 rounded-lg border border-primary/35 bg-primary/[0.08] p-3 text-[11px] leading-relaxed">
              <ShieldAlert className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              <p>
                <strong>Automated grouping · not reviewed.</strong> Concentrations
                are analytical evidence, not confirmed incidents or response
                boundaries.
              </p>
            </div>

            {concentrations.candidatesTruncated ? (
              <MapWarning>
                The analysis reached its {concentrations.candidateLimit.toLocaleString()}-
                report safety cap. Cell counts and totals may be incomplete.
              </MapWarning>
            ) : null}

            {concentrations.pocketsTruncated ? (
              <MapWarning>
                Showing {concentrations.pockets.length} of{" "}
                {concentrations.qualifyingPocketCount} qualifying cells. Summary
                totals cover every qualifying cell in the bounded candidate set.
              </MapWarning>
            ) : null}

            {concentrations.rejectedPocketCount > 0 ? (
              <MapWarning>
                {concentrations.rejectedPocketCount} returned concentration could
                not be interpreted and is hidden.
              </MapWarning>
            ) : null}

            {signalsError ? (
              <MapWarning>
                The live report sample is incomplete: {signalsError}
              </MapWarning>
            ) : null}

            {concentrations.error && concentrations.pockets.length > 0 ? (
              <MapWarning>
                Refresh failed; retaining the snapshot calculated{" "}
                {concentrations.generatedAt
                  ? timeAgo(concentrations.generatedAt)
                  : "previously"}
                . {concentrations.error}
              </MapWarning>
            ) : null}

            {concentrations.loading && concentrations.pockets.length === 0 ? (
              <div className="flex min-h-48 items-center justify-center gap-2 rounded-lg border border-dashed border-border text-sm text-muted-foreground">
                <Spinner />
                Analysing severe/extreme reports…
              </div>
            ) : concentrations.error && concentrations.pockets.length === 0 ? (
              <div className="rounded-lg border border-destructive/35 bg-destructive/[0.06] p-4">
                <p className="text-sm font-semibold text-destructive">
                  Concentrations unavailable
                </p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {concentrations.error}
                </p>
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  className="mt-3"
                  onClick={concentrations.refresh}
                >
                  <RefreshCw aria-hidden />
                  Retry
                </Button>
              </div>
            ) : concentrations.pockets.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border bg-muted/20 p-5 text-center">
                <RadioTower className="mx-auto size-5 text-muted-foreground" aria-hidden />
                <p className="mt-2 text-sm font-semibold">
                  No severe/extreme report concentrations found
                </p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  This means the shared bus did not form a qualifying group in
                  this time window. It does not mean the region is safe or that
                  reporting is complete.
                </p>
              </div>
            ) : (
              <>
                <p className="px-1 text-[10px] leading-relaxed text-muted-foreground">
                  Ordered by highest reported severity, report count, reported
                  origins, then recency—not by operational priority.
                </p>
                <ul className="space-y-2" aria-label="Report concentrations">
                {concentrations.pockets.map((pocket) => (
                  <li key={pocket.key}>
                    <PocketCard
                      pocket={pocket}
                      selected={
                        selection?.lat === pocket.lat &&
                        selection?.lng === pocket.lng
                      }
                      onInspect={() => inspectPocket(pocket)}
                    />
                  </li>
                ))}
                </ul>
              </>
            )}

            <div className="space-y-1.5 rounded-lg border border-border bg-card p-3 text-[10px] leading-relaxed text-muted-foreground">
              <p className="flex items-center gap-1.5 font-semibold text-foreground">
                <Clock3 className="size-3.5" aria-hidden />
                Analysis scope
              </p>
              <p>
                Groups reports into fixed {concentrations.cellM || 750}-metre
                NZTM analysis cells, across report types, with at least{" "}
                {concentrations.minPoints || 2} reports and one severe/extreme
                report.
              </p>
              <p>
                {concentrations.generatedAt
                  ? `Calculated ${timeAgo(concentrations.generatedAt)} from ${concentrations.candidateCount.toLocaleString()} eligible reports.`
                  : "Waiting for a confirmed analytical snapshot."}
              </p>
              <p>
                Dashed polygons are cell extents; pins are approximate centroids.
                Selecting one opens supplementary nearby evidence, not exact cell
                membership.
              </p>
              <p>
                Individual markers show at most the latest 500 ingested reports in
                the selected window; the cell analysis considers up to{" "}
                {concentrations.candidateLimit.toLocaleString()}.
              </p>
            </div>

            {signalsLoading ? (
              <p className="flex items-center gap-1.5 px-1 text-[10px] text-muted-foreground">
                <Spinner className="size-3" />
                Live report markers are still loading.
              </p>
            ) : null}
              </>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function SidebarMetric({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-2.5">
      <p className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">
        {value}
      </p>
    </div>
  );
}

function MapWarning({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-severity-moderate/40 bg-severity-moderate/10 p-3 text-[11px] leading-relaxed">
      <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      <p>{children}</p>
    </div>
  );
}

function PocketCard({
  pocket,
  selected,
  onInspect,
}: {
  pocket: SeriousPocket;
  selected: boolean;
  onInspect: () => void;
}) {
  const coarse = pocket.coarseLocationCount > 0;

  return (
    <Card
      className={cn(
        "gap-0 overflow-hidden py-0 shadow-none transition-colors",
        selected
          ? "border-primary ring-2 ring-primary/25"
          : "hover:border-foreground/25",
      )}
    >
      <button
        type="button"
        className="w-full p-3 text-left focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset focus-visible:outline-none"
        onClick={onInspect}
        aria-label={`Inspect nearby evidence at the ${pocket.label} analysis cell`}
      >
        <div className="flex items-start gap-2.5">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-bold text-muted-foreground">
            <Layers3 className="size-3.5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="line-clamp-1 text-sm font-semibold text-foreground">
                  Near {pocket.label}
                </p>
                <p className="mt-0.5 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                  Automated grouping · not reviewed
                </p>
              </div>
              <Badge
                variant="outline"
                className="shrink-0 capitalize"
                style={{
                  borderColor: severityColor(pocket.maxSeverity),
                  color: severityColor(pocket.maxSeverity),
                }}
              >
                Highest reported: {pocket.maxSeverity}
              </Badge>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2">
              <PocketNumber label="Extreme" value={pocket.extremeCount} />
              <PocketNumber label="Severe" value={pocket.severeCount} />
              <PocketNumber label="Origins" value={pocket.reportedOriginCount} />
            </div>

            <div className="mt-2.5 flex flex-wrap gap-1">
              {pocket.signalTypes.slice(0, 4).map((type) => (
                <Badge key={type.signalType} variant="secondary">
                  {typeLabel(type.signalType)} {type.count}
                </Badge>
              ))}
            </div>

            <div className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
              <span>{pocket.reportCount} reports grouped</span>
              <span>{pocket.unverifiedSeriousCount} unverified serious</span>
              <span>
                {pocket.verifiedOrCorroboratedSeriousCount} verified/corroborated
                serious
              </span>
              <span>{pocket.officialSeriousCount} official serious reports</span>
            </div>

            {coarse ? (
              <p className="mt-2 flex items-start gap-1.5 rounded-md bg-severity-moderate/10 p-2 text-[10px] leading-relaxed text-muted-foreground">
                <TriangleAlert className="mt-0.5 size-3 shrink-0" aria-hidden />
                {pocket.coarseLocationCount} location
                {pocket.coarseLocationCount === 1 ? " uses" : "s use"} suburb,
                region, or unknown centroids
                {pocket.maxAccuracyM !== null
                  ? `; declared accuracy reaches ${accuracyLabel(pocket.maxAccuracyM)}`
                  : ""}
                .
              </p>
            ) : null}

            <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-border pt-2 text-[10px] text-muted-foreground">
              <span>Latest {timeAgo(pocket.lastSeenAt)}</span>
              <span className="flex items-center gap-1 font-semibold text-foreground">
                <LocateFixed className="size-3.5" aria-hidden />
                Inspect nearby evidence
              </span>
            </div>
          </div>
        </div>
      </button>
    </Card>
  );
}

function PocketNumber({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-muted/55 px-2 py-1.5">
      <p className="text-base font-semibold tabular-nums text-foreground">{value}</p>
      <p className="text-[9px] font-semibold tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
    </div>
  );
}
