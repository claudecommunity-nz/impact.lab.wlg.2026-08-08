"use client";

import { Inbox, ListChecks, MapPinned, Radio } from "lucide-react";
import { Badge, ScrollArea, cn, SEVERITY_COLORS, severityColor } from "@wcc-impact/ui";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@wcc-impact/ui/components/ui/tabs";
import type { SignalRow } from "@wcc-impact/shared";
import { ago, type Cop } from "../lib/cop";

function Empty({ icon: Icon, children }: { icon: typeof Inbox; children: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
      <Icon className="size-5 text-muted-foreground/50" />
      <p className="text-xs text-muted-foreground">{children}</p>
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
          className="flex gap-2.5 border-b border-border/50 py-2 last:border-0"
        >
          <span
            className="mt-1 h-full w-0.5 shrink-0 rounded-full"
            style={{ background: severityColor(s.severity) }}
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="line-clamp-1 text-xs font-medium text-foreground">{s.title}</span>
              <span className="shrink-0 text-[10px] whitespace-nowrap text-muted-foreground tabular-nums">
                {ago(s.created_at, now)}
              </span>
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span
                className="size-1.5 shrink-0 rounded-full"
                style={{ background: severityColor(s.severity) }}
                aria-hidden
              />
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

/**
 * Right-rail density stack: three scannable tables under Tabs — the operator's
 * work queue (Triage), the never-miss list (Critical), and where-it's-worst
 * (Suburbs) — three views in one footprint.
 */
export function CopRail({ cop }: { cop: Cop }) {
  const maxSuburb = Math.max(1, cop.suburbs[0]?.count ?? 1);
  return (
    <Tabs defaultValue="latest" className="flex min-h-0 flex-1 flex-col gap-0">
      <TabsList className="mx-3 mt-3 grid w-auto grid-cols-4">
        <TabsTrigger value="latest" className="gap-1 px-1.5 text-[11px]">
          <Radio className="size-3.5" /> Feed
        </TabsTrigger>
        <TabsTrigger value="triage" className="gap-1 px-1.5 text-[11px]">
          <Inbox className="size-3.5" /> Triage
          {cop.needsTriage > 0 && (
            <Badge variant="secondary" className="ml-0.5 h-4 rounded px-1 text-[10px] tabular-nums">
              {cop.needsTriage}
            </Badge>
          )}
        </TabsTrigger>
        <TabsTrigger value="critical" className="gap-1 px-1.5 text-[11px]">
          <ListChecks className="size-3.5" /> Critical
        </TabsTrigger>
        <TabsTrigger value="suburbs" className="gap-1 px-1.5 text-[11px]">
          <MapPinned className="size-3.5" /> Areas
        </TabsTrigger>
      </TabsList>

      <ScrollArea className="min-h-0 flex-1 px-3 pb-3">
        <TabsContent value="latest" className="mt-2">
          {cop.latest.length ? (
            <SignalRows rows={cop.latest} now={cop.now} />
          ) : (
            <Empty icon={Radio}>No signals yet — waiting for the first loader.</Empty>
          )}
        </TabsContent>

        <TabsContent value="triage" className="mt-2">
          {cop.triage.length ? (
            <SignalRows rows={cop.triage} now={cop.now} />
          ) : (
            <Empty icon={Inbox}>Nothing to triage — all signals verified.</Empty>
          )}
        </TabsContent>

        <TabsContent value="critical" className="mt-2">
          {cop.critical.length ? (
            <SignalRows rows={cop.critical} now={cop.now} />
          ) : (
            <Empty icon={ListChecks}>No severe or extreme signals active.</Empty>
          )}
        </TabsContent>

        <TabsContent value="suburbs" className="mt-2">
          {cop.suburbs.length ? (
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
