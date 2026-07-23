"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  BellRing,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Gauge,
  Info,
  LoaderCircle,
  MapPinned,
  Navigation,
  PhoneCall,
  RadioTower,
  ShieldAlert,
  Users,
  WifiOff,
} from "lucide-react";
import {
  Card,
  CardContent,
  SignalMap,
  SignIn,
  useModules,
  useSignalAggregates,
  useSignals,
  useUser,
  SEVERITY_COLORS,
  cn,
} from "@wcc-impact/plugin-sdk";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@wcc-impact/ui/components/ui/tabs";
import registry from "../registry.gen";
import { useAudience } from "../components/AudienceProvider";
import { HealthStrip } from "../components/HealthStrip";
import { SituationBanner } from "../components/SituationBanner";
import { StatTile, SeverityMeter } from "../components/StatTile";
import { SignalsChart } from "../components/SignalsChart";
import { CopRail } from "../components/CopRail";
import {
  DemoRoleLogin,
  OperationsSession,
} from "../components/DemoRoleLogin";
import {
  applyAuthoritativeAggregates,
  deriveCop,
  ago,
  type ThreatLevel,
} from "../lib/cop";
import { useNow } from "../lib/use-now";
import { useSpatialTriage } from "../lib/spatial-triage";

const THREAT_ACCENT: Record<ThreatLevel, string> = {
  critical: SEVERITY_COLORS.extreme,
  major: SEVERITY_COLORS.severe,
  elevated: SEVERITY_COLORS.moderate,
  monitoring: SEVERITY_COLORS.minor,
  unconfirmed: "var(--muted-foreground)",
};

/** Tiny consistent panel header (uppercase label + optional source caption). */
function PanelLabel({ children, caption }: { children: string; caption?: string }) {
  return (
    <div className="ops-panel-header">
      <span className="ops-kicker">{children}</span>
      {caption && (
        <span className="text-[10px] font-medium text-muted-foreground tabular-nums">
          {caption}
        </span>
      )}
    </div>
  );
}

export function HomeView() {
  const { audience, setAudience } = useAudience();
  const [operationsRequested, setOperationsRequested] = useState(false);
  const { signals, loading: signalsLoading, error: signalsError } = useSignals();
  const { user, loading: userLoading } = useUser();
  const spatialTriage = useSpatialTriage({
    user,
    operationsRequested,
    signalRevision: signals[0]?.id ?? null,
  });
  const {
    aggregates,
    loading: aggregatesLoading,
    stale: aggregatesStale,
    error: aggregatesError,
  } = useSignalAggregates();
  const { modules, loading: modulesLoading } = useModules();
  const now = useNow(15_000);
  const recentCop = useMemo(
    () => deriveCop(signals, modules, now),
    [signals, modules, now],
  );
  const cop = useMemo(
    () => applyAuthoritativeAggregates(recentCop, aggregates),
    [recentCop, aggregates],
  );
  const latestReportAt = aggregates?.newestCreatedAt ?? signals[0]?.created_at;
  const latestReportAge = latestReportAt ? ago(latestReportAt, now) : null;
  const checkedAt = aggregates?.generatedAt;
  const checkedAge = checkedAt ? ago(checkedAt, now) : null;
  const dataUnavailable = Boolean(
    signalsError && aggregatesError && !aggregates && signals.length === 0,
  );
  const dataPending =
    !dataUnavailable &&
    (signalsLoading || aggregatesLoading) &&
    !aggregates &&
    signals.length === 0;
  const dataState = dataUnavailable
    ? {
        label: "Data unavailable",
        detail: "The dashboard could not confirm a current data snapshot.",
        className:
          "border-destructive/35 bg-destructive/[0.07] text-destructive dark:text-red-300",
        Icon: WifiOff,
      }
    : dataPending
      ? {
          label: "Connecting",
          detail: "Waiting for the first confirmed data snapshot.",
          className:
            "border-amber-500/35 bg-amber-500/[0.07] text-amber-800 dark:text-amber-300",
          Icon: LoaderCircle,
        }
      : signalsError || aggregatesError
        ? {
            label: "Partial data",
            detail: signalsError
              ? "Totals may be available, but the live map and update feed may be incomplete."
              : "The live feed is available, but exact database totals are being retried.",
            className:
              "border-amber-500/35 bg-amber-500/[0.07] text-amber-800 dark:text-amber-300",
            Icon: RadioTower,
          }
      : aggregatesStale
        ? {
            label: checkedAge ? `Data checked ${checkedAge}` : "Refreshing data",
            detail: latestReportAge
              ? `Newest report received ${latestReportAge}.`
              : "Using the most recent confirmed snapshot.",
            className:
              "border-amber-500/35 bg-amber-500/[0.07] text-amber-800 dark:text-amber-300",
            Icon: RadioTower,
          }
        : {
            label: checkedAge ? `Data checked ${checkedAge}` : "Data snapshot ready",
            detail: latestReportAge
              ? `Newest report received ${latestReportAge}.`
              : "No reports have been received in the current snapshot.",
            className:
              "border-emerald-600/30 bg-emerald-600/[0.06] text-emerald-800 dark:text-emerald-300",
            Icon: RadioTower,
          };
  const DataStateIcon = dataState.Icon;
  const displayedThreat = audience === "public" ? cop.publicThreat : cop.threat;
  const localTime = new Intl.DateTimeFormat("en-NZ", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Pacific/Auckland",
  }).format(now);
  const localDate = new Intl.DateTimeFormat("en-NZ", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "Pacific/Auckland",
  }).format(now);
  const countHint = aggregatesError
    ? aggregates
      ? "last known total · retrying"
      : "recent window · totals unavailable"
    : aggregatesStale
      ? "database total · refreshing"
      : aggregatesLoading
        ? "connecting to database"
        : "database total";

  useEffect(() => {
    if (operationsRequested && spatialTriage.access.authorized) {
      setAudience("operations");
    } else if (!spatialTriage.access.authorized) {
      setAudience("public");
    }
  }, [operationsRequested, spatialTriage.access.authorized]);

  function selectAudience(mode: "public" | "operations") {
    if (mode === "public") {
      setOperationsRequested(false);
      setAudience("public");
      return;
    }
    setOperationsRequested(true);
    if (spatialTriage.access.authorized) setAudience("operations");
  }

  // Module-contributed stat tiles (manifest `homeStat`) — each declaring module
  // gets its live signal count on the shared home view. Kill-switched modules
  // drop out (their tile would read 0 anyway; hiding is clearer).
  const enabledIds = useMemo(
    () => new Set(modules.filter((m) => m.enabled).map((m) => m.id)),
    [modules],
  );
  const moduleStats = useMemo(
    () =>
      registry
        .filter((m) => m.homeStat && enabledIds.has(m.id))
        .map((m) => ({
          id: m.id,
          name: m.name,
          label: m.homeStat!.label,
          count: m.homeStat!.signalType
            ? aggregates
              ? (aggregates.moduleSignalTypes.find(
                  (row) =>
                    row.moduleId === m.id &&
                    row.signalType === m.homeStat!.signalType,
                )?.count ?? 0)
              : signals.filter(
                  (signal) =>
                    signal.module_id === m.id &&
                    signal.signal_type === m.homeStat!.signalType,
                ).length
            : aggregates
              ? (aggregates.byModule[m.id] ?? 0)
              : signals.filter((signal) => signal.module_id === m.id).length,
        })),
    [signals, enabledIds, aggregates],
  );

  return (
    <div className="ops-surface min-h-dvh">
      <div className="mx-auto flex max-w-[1720px] flex-col gap-3 px-3 py-3 md:px-5 md:py-4">
        <header className="flex flex-wrap items-end justify-between gap-3 pb-1">
          <div>
            <div className="mb-1.5 flex items-center gap-2">
              <span className="ops-kicker">Wellington region</span>
              <span className="h-3 w-px bg-border" aria-hidden />
              <span className="ops-kicker">Common operating picture</span>
            </div>
            <h1 className="text-2xl leading-none font-semibold tracking-[-0.035em] md:text-[1.8rem]">
              Situation overview
            </h1>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Current hazards, reports and response activity across the region.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div
              role="group"
              aria-label="Dashboard audience"
              className="flex h-11 items-center rounded-md border border-border bg-card p-0.5 shadow-sm"
            >
              {(["public", "operations"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={audience === mode}
                  onClick={() => selectAudience(mode)}
                  className={cn(
                    "h-10 rounded px-3 text-xs font-semibold capitalize transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                    audience === mode
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {mode === "public" ? "Public view" : "Operations"}
                </button>
              ))}
            </div>
            {user && (
              <OperationsSession
                email={user.email ?? null}
                role={spatialTriage.access.role}
              />
            )}
            <div className="hidden h-11 items-center gap-2 rounded-md border border-border bg-card px-3 text-[11px] text-muted-foreground shadow-sm sm:flex">
              <Clock3 className="size-3.5" aria-hidden />
              <span>{localDate}</span>
              <strong className="font-semibold text-foreground tabular-nums">
                {localTime} NZ time
              </strong>
            </div>
            <div
              className={cn(
                "flex h-11 items-center gap-2 rounded-md border px-3 text-[11px] font-semibold",
                dataState.className,
              )}
              title={dataState.detail}
            >
              <DataStateIcon
                className={cn("size-3.5", dataPending && "motion-safe:animate-spin")}
                aria-hidden
              />
              {dataState.label}
            </div>
          </div>
        </header>

        {operationsRequested && audience !== "operations" && (
          <OperationsAccessGate
            userLoading={userLoading || spatialTriage.accessLoading}
            signedIn={Boolean(user)}
          />
        )}

        {dataPending || dataUnavailable ? (
          <DataAvailabilityBanner unavailable={dataUnavailable} />
        ) : (
          <SituationBanner threat={displayedThreat} latestReport={latestReportAge} />
        )}

        {audience === "public" && <PublicGuidance />}

        <section
          aria-label="Current situation metrics"
          className="grid shrink-0 gap-3 [grid-template-columns:repeat(auto-fit,minmax(155px,1fr))]"
        >
          <StatTile
            label="Regional status"
            value={dataPending || dataUnavailable ? "—" : displayedThreat.label}
            accent={THREAT_ACCENT[displayedThreat.level]}
            hint={
              dataPending || dataUnavailable
                ? "awaiting current snapshot"
                : audience === "public"
                  ? cop.publicThreat.level === "unconfirmed"
                    ? "no confirmed official status in this feed"
                    : `${cop.officialActive} official report${cop.officialActive === 1 ? "" : "s"} in the last hour`
                  : `${cop.criticalCount} serious report${cop.criticalCount === 1 ? "" : "s"} in the last hour`
            }
            icon={<ShieldAlert className="size-4" aria-hidden />}
          />
          <StatTile
            label="Reports recorded"
            value={dataPending || dataUnavailable ? "—" : cop.total}
            hint={countHint}
            icon={<RadioTower className="size-4" aria-hidden />}
          >
            {!dataPending && !dataUnavailable && <SeverityMeter counts={cop.severityCounts} />}
          </StatTile>
          {audience === "operations" && (
            <StatTile
              label="New (15 min)"
              value={dataPending || dataUnavailable ? "—" : cop.new15}
              delta={dataPending || dataUnavailable ? undefined : cop.velocity}
              hint="vs previous 15 min"
              icon={<Gauge className="size-4" aria-hidden />}
            />
          )}
          <StatTile
            label="Locations reported"
            value={
              dataPending || dataUnavailable
                ? "—"
                : spatialTriage.hotspots.length || cop.suburbCount
            }
            hint={spatialTriage.hotspots.length ? "spatial hotspots" : "named places in reports"}
            icon={<MapPinned className="size-4" aria-hidden />}
          />
          {audience === "operations" && (
            <StatTile
              label="Needs review"
              value={
                dataPending || dataUnavailable
                  ? "—"
                  : spatialTriage.candidates.length
              }
              accent={
                spatialTriage.candidates.length > 0 ? "var(--urgency)" : undefined
              }
              hint="database-ranked evidence"
              icon={<ClipboardCheck className="size-4" aria-hidden />}
            />
          )}
          <StatTile
            label="Verification"
            value={dataPending || dataUnavailable ? "—" : `${cop.verifiedPct}%`}
            deltaGood
            hint={`${cop.officialActive} official in the last hour`}
            icon={<BadgeCheck className="size-4" aria-hidden />}
          />
        </section>

        {audience === "operations" && moduleStats.length > 0 && (
          <section className="grid shrink-0 gap-3 [grid-template-columns:repeat(auto-fit,minmax(170px,1fr))]">
            {moduleStats.map((s) => (
              <StatTile
                key={s.id}
                label={s.label}
                value={s.count}
                hint={`${s.name}${
                  aggregatesError && !aggregates
                    ? " · recent window"
                    : aggregatesStale
                      ? " · refreshing"
                      : ""
                }`}
              />
            ))}
          </section>
        )}

        <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,1fr)_390px]">
          <div className="flex flex-col gap-3">
            <section
              className="ops-panel overflow-hidden rounded-lg"
              aria-labelledby="regional-map-title"
            >
              <div className="ops-panel-header">
                <div className="flex items-center gap-2">
                  <MapPinned className="size-4 text-muted-foreground" aria-hidden />
                  <div>
                    <h2 id="regional-map-title" className="text-sm font-semibold">
                      Regional situation map
                    </h2>
                    <p className="text-[11px] text-muted-foreground">
                      Located reports from official, community, media and sensor sources
                    </p>
                  </div>
                </div>
                <div
                  aria-label="Signal severity legend"
                  className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-[11px] font-medium text-muted-foreground"
                >
                  <span className="flex items-center gap-1.5">
                    <span className="size-2 rounded-full bg-severity-extreme" aria-hidden />
                    Extreme
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="size-2 rounded-full bg-severity-severe" aria-hidden />
                    Severe
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="size-2 rounded-full bg-severity-moderate" aria-hidden />
                    Moderate
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="size-2 rounded-full bg-severity-minor" aria-hidden />
                    Minor
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="size-2 rounded-full bg-severity-unknown" aria-hidden />
                    Unknown
                  </span>
                </div>
              </div>
              <div
                className={cn(
                  "bg-[#0b1823]",
                  audience === "public"
                    ? "h-[45vh] min-h-[320px] sm:min-h-[400px]"
                    : "h-[56vh] min-h-[420px]",
                )}
              >
                <SignalMap className="h-full w-full" />
              </div>
            </section>

            {audience === "operations" && (
            <section className="grid shrink-0 gap-3 sm:grid-cols-2">
              <Card className="ops-panel h-56 gap-0 overflow-hidden py-0 shadow-none">
                <PanelLabel caption="last 3h · by severity">Signal volume</PanelLabel>
                <CardContent className="h-[calc(100%-2.75rem)] px-2 pb-2">
                  <SignalsChart buckets={cop.buckets} />
                </CardContent>
              </Card>

              <Card className="ops-panel h-56 gap-0 overflow-hidden py-0 shadow-none">
                <Tabs defaultValue="severity" className="flex h-full flex-col gap-0">
                  <div className="ops-panel-header">
                    <span className="ops-kicker">Breakdown</span>
                    <TabsList className="h-10">
                      <TabsTrigger value="severity" className="h-9 px-3 text-xs">
                        Severity
                      </TabsTrigger>
                      <TabsTrigger value="source" className="h-9 px-3 text-xs">
                        Source
                      </TabsTrigger>
                    </TabsList>
                  </div>
                  <CardContent className="min-h-0 flex-1 px-4 pb-4">
                    <TabsContent value="severity" className="mt-0 flex flex-col gap-2.5">
                      {(["extreme", "severe", "moderate", "minor", "unknown"] as const).map(
                        (sev) => (
                          <Row
                            key={sev}
                            color={SEVERITY_COLORS[sev]}
                            label={sev}
                            n={cop.severityCounts[sev]}
                            total={cop.total}
                          />
                        ),
                      )}
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
            )}
          </div>

          <aside
            className={cn(
              "flex flex-col gap-3 xl:sticky xl:top-11 xl:h-[calc(100dvh-3.5rem)]",
              audience === "public" && "max-xl:order-first",
            )}
          >
            {audience === "operations" && (
              <Card
                id="response-systems"
                className="ops-panel shrink-0 gap-0 py-0 shadow-none"
              >
                <PanelLabel
                  caption={
                    modulesLoading
                      ? "checking"
                      : `${modules.filter((m) => m.enabled).length} available`
                  }
                >
                  Response systems
                </PanelLabel>
                <CardContent className="px-3 pb-3">
                  <HealthStrip />
                </CardContent>
              </Card>
            )}
            <Card
              className={cn(
                "ops-panel flex min-h-0 flex-1 flex-col overflow-hidden py-0 shadow-none",
                audience === "operations" ? "max-xl:min-h-[28rem]" : "max-xl:min-h-[20rem]",
              )}
            >
              <div className="ops-panel-header shrink-0">
                <div>
                  <h2 className="text-sm font-semibold">Priority updates</h2>
                  <p className="text-[11px] text-muted-foreground">
                    {audience === "operations"
                      ? "Spatial priority · consequence · corroboration"
                      : "Newest reports first"}
                  </p>
                </div>
                <BellRing className="size-4 text-muted-foreground" aria-hidden />
              </div>
              <CopRail
                cop={cop}
                mode={audience}
                triageCandidates={spatialTriage.candidates}
                hotspots={spatialTriage.hotspots}
                triageLoading={spatialTriage.loading}
                triageError={spatialTriage.error}
                creatingSignalId={spatialTriage.creatingSignalId}
                onCreateIncident={spatialTriage.createIncident}
              />
            </Card>
          </aside>
        </div>
      </div>
    </div>
  );
}

function OperationsAccessGate({
  userLoading,
  signedIn,
}: {
  userLoading: boolean;
  signedIn: boolean;
}) {
  if (userLoading) {
    return (
      <div
        role="status"
        className="ops-panel flex items-center gap-2 rounded-lg px-4 py-3 text-xs text-muted-foreground"
      >
        <LoaderCircle className="size-4 motion-safe:animate-spin" aria-hidden />
        Checking response-team access…
      </div>
    );
  }

  if (!signedIn) {
    return (
      <section
        aria-labelledby="operations-sign-in-title"
        className="flex flex-col gap-3"
      >
        <div className="mb-2">
          <h2 id="operations-sign-in-title" className="text-sm font-semibold">
            Operations requires a response-team account
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Sign in with your approved email. Database policies protect the
            cross-module triage queue even if the interface is bypassed.
          </p>
        </div>
        <DemoRoleLogin />
        <div>
          <p className="mb-2 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
            Or use an approved email
          </p>
          <SignIn className="max-w-xl" />
        </div>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        role="alert"
        className="rounded-lg border border-amber-500/35 bg-amber-500/[0.07] px-4 py-3"
      >
        <p className="text-sm font-semibold">This account is not on the response team</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Ask an organiser to assign the operator, controller, or admin role in
          Supabase, or switch to a demo account below.
        </p>
      </div>
      <DemoRoleLogin />
    </div>
  );
}

function DataAvailabilityBanner({ unavailable }: { unavailable: boolean }) {
  const Icon = unavailable ? WifiOff : LoaderCircle;
  return (
    <div
      role="status"
      className={cn(
        "ops-panel flex min-h-16 items-center gap-3 rounded-lg border px-4 py-3.5 md:px-5",
        unavailable
          ? "border-destructive/35 bg-destructive/[0.07]"
          : "border-amber-500/35 bg-amber-500/[0.07]",
      )}
    >
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-md",
          unavailable
            ? "bg-destructive/10 text-destructive dark:text-red-300"
            : "bg-amber-500/10 text-amber-800 dark:text-amber-300",
        )}
      >
        <Icon className={cn("size-4.5", !unavailable && "motion-safe:animate-spin")} aria-hidden />
      </span>
      <div>
        <p className="text-sm font-semibold">
          {unavailable ? "Current conditions are not confirmed" : "Connecting to data sources"}
        </p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
          {unavailable
            ? "The dashboard could not load a current snapshot. Do not interpret empty values as an all-clear."
            : "The dashboard will show a regional status after the first snapshot is confirmed."}
        </p>
      </div>
    </div>
  );
}

function PublicGuidance() {
  const items = [
    {
      icon: CheckCircle2,
      title: "Check official advice",
      body: "Confirm current conditions before travelling or making plans.",
    },
    {
      icon: Navigation,
      title: "Plan before travel",
      body: "Avoid affected areas when official alerts are active.",
    },
    {
      icon: Users,
      title: "Check on others",
      body: "Contact whānau, neighbours and anyone who may need support.",
    },
    {
      icon: PhoneCall,
      title: "Call 111 in danger",
      body: "For immediate risk to life, health or property.",
    },
  ];

  return (
    <section className="ops-panel overflow-hidden rounded-lg" aria-labelledby="public-guidance">
      <div className="ops-panel-header">
        <div className="flex items-center gap-2">
          <Info className="size-4 text-blue-500" aria-hidden />
          <h2 id="public-guidance" className="text-sm font-semibold">
            What you need to do
          </h2>
        </div>
        <span className="ops-kicker">Public guidance</span>
      </div>
      <div className="grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-4">
        {items.map(({ icon: Icon, title, body }) => (
          <div key={title} className="flex gap-3 bg-card px-4 py-3.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-foreground">
              <Icon className="size-4" aria-hidden />
            </span>
            <div>
              <h3 className="text-xs font-semibold">{title}</h3>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{body}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
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
