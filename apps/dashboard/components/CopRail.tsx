"use client";

import { Inbox, ListChecks, LoaderCircle, MapPinned, Radio } from "lucide-react";
import {
  Badge,
  Button,
  ScrollArea,
  cn,
  SEVERITY_COLORS,
  severityColor,
} from "@wcc-impact/ui";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@wcc-impact/ui/components/ui/tabs";
import type { SignalRow } from "@wcc-impact/shared";
import { ago, type Cop } from "../lib/cop";
import type { SignalHotspot, TriageCandidate } from "../lib/spatial-triage";

function Empty({ icon: Icon, children }: { icon: typeof Inbox; children: string }) {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center px-6 py-10 text-center">
      <span className="mb-3 flex size-10 items-center justify-center rounded-full border border-border bg-muted/70">
        <Icon className="size-4.5 text-muted-foreground" />
      </span>
      <p className="text-xs font-medium text-foreground">No current items</p>
      <p className="mt-1 max-w-56 text-[11px] leading-relaxed text-muted-foreground">
        {children}
      </p>
    </div>
  );
}

/** Compact, scannable signal rows — severity accent bar + title + meta + time.
 *  Dense on purpose so the feed lives in the rail without crowding the map. */
function SignalRows({ rows, now }: { rows: SignalRow[]; now: number }) {
  return (
    <ul className="flex flex-col">
      {rows.map((s) => (
        <li
          key={s.id}
          className="group -mx-3 flex gap-2.5 border-b border-border/60 px-3 py-3 transition-colors last:border-0 hover:bg-muted/40"
        >
          <span
            className="mt-1 h-full w-0.5 shrink-0 rounded-full"
            style={{ background: severityColor(s.severity) }}
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="line-clamp-2 text-xs leading-snug font-semibold text-foreground">
                {s.title}
              </span>
              <span className="shrink-0 text-[10px] whitespace-nowrap text-muted-foreground tabular-nums">
                {ago(s.created_at, now)}
              </span>
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="font-semibold capitalize" style={{ color: severityColor(s.severity) }}>
                {s.severity ?? "unknown"}
              </span>
              <span aria-hidden>·</span>
              <span className="font-medium capitalize">
                {s.verification?.replace("_", " ") ?? "unverified"}
              </span>
              <span aria-hidden>·</span>
              <span className="line-clamp-1">
                {s.place_name ?? s.signal_type}
                {s.source ? ` · ${s.source}` : ` · ${s.source_type}`}
              </span>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

const REASON_LABELS: Record<string, string> = {
  high_consequence: "high consequence",
  needs_verification: "verify",
  independent_corroboration: "independent sources",
  spatial_cluster: "spatial cluster",
  missing_location: "needs location",
  low_location_precision: "coarse location",
  official_source: "official",
};

function CandidateRows({
  rows,
  now,
  creatingSignalId,
  onCreateIncident,
}: {
  rows: TriageCandidate[];
  now: number;
  creatingSignalId: string | null;
  onCreateIncident: (signalId: string) => Promise<string | null>;
}) {
  return (
    <ul className="flex flex-col">
      {rows.map((candidate) => {
        const signal = candidate.signal;
        const isCreating = creatingSignalId === signal.id;
        return (
          <li
            key={signal.id}
            className="group -mx-3 flex gap-2.5 border-b border-border/60 px-3 py-3 last:border-0"
          >
            <span
              className="mt-1 h-full w-0.5 shrink-0 rounded-full"
              style={{ background: severityColor(signal.severity) }}
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <span className="line-clamp-2 text-xs leading-snug font-semibold text-foreground">
                  {signal.title}
                </span>
                <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
                  {ago(candidate.eventAt, now)}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-1">
                <Badge
                  variant={candidate.actionPriority === "p1" ? "destructive" : "secondary"}
                  className="h-4 px-1 text-[9px] uppercase"
                >
                  Action {candidate.actionPriority}
                </Badge>
                <Badge variant="outline" className="h-4 px-1 text-[9px] uppercase">
                  Verify {candidate.verificationPriority}
                </Badge>
                {candidate.independentSourceCount > 1 && (
                  <span className="text-[10px] text-muted-foreground">
                    {candidate.independentSourceCount} sources
                  </span>
                )}
              </div>
              <p className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-muted-foreground">
                {candidate.reasonCodes
                  .map((reason) => REASON_LABELS[reason] ?? reason.replaceAll("_", " "))
                  .join(" · ") || "Routine review"}
              </p>
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="truncate text-[10px] text-muted-foreground">
                  {signal.place_name ?? signal.signal_type}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-6 px-2 text-[10px]"
                  disabled={creatingSignalId !== null}
                  onClick={() => void onCreateIncident(signal.id)}
                >
                  {isCreating ? (
                    <>
                      <LoaderCircle className="size-3 motion-safe:animate-spin" />
                      Opening…
                    </>
                  ) : (
                    "Open incident"
                  )}
                </Button>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Right-rail density stack: three scannable tables under Tabs — the operator's
 * work queue (Triage), the never-miss list (Critical), and where-it's-worst
 * (spatial Areas) — several views in one footprint.
 */
export function CopRail({
  cop,
  mode = "operations",
  triageCandidates = [],
  hotspots = [],
  triageLoading = false,
  triageError = null,
  creatingSignalId = null,
  onCreateIncident = async () => null,
}: {
  cop: Cop;
  mode?: "public" | "operations";
  triageCandidates?: TriageCandidate[];
  hotspots?: SignalHotspot[];
  triageLoading?: boolean;
  triageError?: string | null;
  creatingSignalId?: string | null;
  onCreateIncident?: (signalId: string) => Promise<string | null>;
}) {
  const maxSuburb = Math.max(1, cop.suburbs[0]?.count ?? 1);
  const latestRows =
    mode === "public"
      ? cop.latest.filter(
          (signal) =>
            signal.source_type === "official" ||
            Boolean(signal.place_name) ||
            signal.severity === "severe" ||
            signal.severity === "extreme",
        )
      : cop.latest;
  const maxHotspot = Math.max(1, hotspots[0]?.signalCount ?? 1);
  const seriousCandidates = triageCandidates.filter(
    (candidate) =>
      candidate.actionPriority === "p1" ||
      candidate.actionPriority === "p2" ||
      candidate.signal.severity === "extreme" ||
    candidate.signal.severity === "severe",
  );
  const reviewCount = triageCandidates.length || cop.needsTriage;
  return (
    <Tabs defaultValue="latest" className="flex min-h-0 flex-1 flex-col gap-0">
      <TabsList
        className={cn(
          "mx-3 mt-3 grid h-10 w-auto rounded-md bg-muted/70 p-1",
          mode === "public" ? "grid-cols-2" : "grid-cols-4",
        )}
      >
        <TabsTrigger value="latest" className="gap-1 px-1.5 text-[11px]">
          <Radio className="size-3.5" /> Updates
        </TabsTrigger>
        {mode === "operations" && (
          <TabsTrigger value="triage" className="gap-1 px-1.5 text-[11px]">
            <Inbox className="size-3.5" /> Review
            {reviewCount > 0 && (
              <Badge variant="secondary" className="ml-0.5 h-4 rounded px-1 text-[10px] tabular-nums">
                {reviewCount}
              </Badge>
            )}
          </TabsTrigger>
        )}
        {mode === "operations" && (
          <TabsTrigger value="critical" className="gap-1 px-1.5 text-[11px]">
            <ListChecks className="size-3.5" /> Serious
          </TabsTrigger>
        )}
        <TabsTrigger value="suburbs" className="gap-1 px-1.5 text-[11px]">
          <MapPinned className="size-3.5" /> Areas
        </TabsTrigger>
      </TabsList>

      <ScrollArea className="min-h-0 flex-1 px-3 pb-3">
        <TabsContent value="latest" className="mt-2">
          {latestRows.length ? (
            <SignalRows rows={latestRows} now={cop.now} />
          ) : (
            <Empty icon={Radio}>
              {mode === "public"
                ? "No official, local, or serious updates are available in the current view."
                : "No reports are available in the current view."}
            </Empty>
          )}
        </TabsContent>

        <TabsContent value="triage" className="mt-2">
          {triageLoading ? (
            <div className="flex min-h-40 items-center justify-center gap-2 text-xs text-muted-foreground">
              <LoaderCircle className="size-4 motion-safe:animate-spin" />
              Calculating spatial priority…
            </div>
          ) : triageError ? (
            <Empty icon={Inbox}>The database triage queue is temporarily unavailable.</Empty>
          ) : triageCandidates.length ? (
            <CandidateRows
              rows={triageCandidates}
              now={cop.now}
              creatingSignalId={creatingSignalId}
              onCreateIncident={onCreateIncident}
            />
          ) : cop.triage.length ? (
            <SignalRows rows={cop.triage} now={cop.now} />
          ) : (
            <Empty icon={Inbox}>Nothing to triage — all signals verified.</Empty>
          )}
        </TabsContent>

        <TabsContent value="critical" className="mt-2">
          {seriousCandidates.length ? (
            <CandidateRows
              rows={seriousCandidates}
              now={cop.now}
              creatingSignalId={creatingSignalId}
              onCreateIncident={onCreateIncident}
            />
          ) : cop.critical.length ? (
            <SignalRows rows={cop.critical} now={cop.now} />
          ) : (
            <Empty icon={ListChecks}>No severe or extreme signals active.</Empty>
          )}
        </TabsContent>

        <TabsContent value="suburbs" className="mt-2">
          {hotspots.length ? (
            <div className="flex flex-col gap-2">
              {hotspots.map((hotspot) => (
                <div key={hotspot.key} className="flex items-center gap-2.5">
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ background: SEVERITY_COLORS[hotspot.maxSeverity] }}
                    aria-hidden
                  />
                  <span className="w-28 shrink-0 truncate text-xs text-foreground">
                    {hotspot.label}
                  </span>
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <span
                      className="block h-full rounded-full bg-foreground/40"
                      style={{ width: `${(hotspot.signalCount / maxHotspot) * 100}%` }}
                    />
                  </span>
                  <span className="w-6 text-right text-[11px] text-muted-foreground tabular-nums">
                    {hotspot.signalCount}
                  </span>
                </div>
              ))}
            </div>
          ) : cop.suburbs.length ? (
            <div className="flex flex-col gap-2">
              {cop.suburbs.map((s) => (
                <div key={s.place} className="flex items-center gap-2.5">
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ background: SEVERITY_COLORS[s.maxSeverity] }}
                    aria-hidden
                  />
                  <span className="w-28 shrink-0 truncate text-xs text-foreground">{s.place}</span>
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <span
                      className={cn("block h-full rounded-full bg-foreground/40")}
                      style={{ width: `${(s.count / maxSuburb) * 100}%` }}
                    />
                  </span>
                  <span className="w-6 text-right text-[11px] text-muted-foreground tabular-nums">
                    {s.count}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <Empty icon={MapPinned}>No located signals yet.</Empty>
          )}
        </TabsContent>
      </ScrollArea>
    </Tabs>
  );
}
