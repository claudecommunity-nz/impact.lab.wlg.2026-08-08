"use client";

import {
  useModules,
  useSignalAggregates,
  useSignals,
  Skeleton,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  cn,
  ModuleIcon,
} from "@wcc-impact/plugin-sdk";
import { formatAgo, freshness, type Freshness } from "../lib/time";
import { useNow } from "../lib/use-now";

// Dot colour per heartbeat freshness (PLAN §13.2): green healthy, amber >2min,
// red >10min, grey never. These are dedicated status-chrome tokens — NOT the
// fixed severity data scale.
const DOT: Record<Freshness, string> = {
  ok: "bg-ok",
  amber: "bg-urgency",
  red: "bg-destructive",
  never: "bg-muted-foreground",
};

const DOT_LABEL: Record<Freshness, string> = {
  ok: "heartbeat healthy",
  amber: "heartbeat stale (>2 min)",
  red: "heartbeat stale (>10 min)",
  never: "no heartbeat yet",
};

/**
 * Per-module health: loader heartbeat (modules.last_seen) + live signal count.
 * This is how mentors spot a team stuck at zero from across the room.
 *
 * @example <HealthStrip />  // home page, above the map
 */
export function HealthStrip() {
  const { modules, loading } = useModules();
  const { signals } = useSignals();
  const {
    aggregates,
    stale: countsStale,
    error: countsError,
  } = useSignalAggregates();
  const now = useNow(30_000);

  const tiles = modules.filter((m) => m.enabled);

  if (loading) return null;
  if (tiles.length === 0) {
    return (
      <p className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
        No modules registered yet — scaffold one with <code>pnpm new-module team-&lt;name&gt;</code>{" "}
        and run its loader to appear here.
      </p>
    );
  }

  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {tiles.map((m) => {
        const fresh = freshness(m.last_seen, now);
        // Modules with no rows are absent from the grouped JSON object, but their
        // authoritative count is zero once the summary has loaded.
        const exactCount = aggregates?.byModule[m.id] ?? 0;
        const recentCount = signals.filter((signal) => signal.module_id === m.id).length;
        const count = aggregates ? exactCount : countsError ? recentCount : undefined;
        const countScope = aggregates ? (countsStale ? "refreshing" : "exact") : "recent window";
        return (
          <Tooltip key={m.id}>
            <TooltipTrigger asChild>
              <div className="flex shrink-0 items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-2 shadow-sm">
                <span
                  className={cn("h-2.5 w-2.5 shrink-0 rounded-full", DOT[fresh])}
                  role="img"
                  aria-label={DOT_LABEL[fresh]}
                />
                <ModuleIcon name={m.icon} className="size-4 shrink-0 text-muted-foreground" />
                <div className="leading-tight">
                  <div className="text-xs font-medium text-foreground">{m.name}</div>
                  {count === undefined ? (
                    <Skeleton className="mt-1 h-3 w-24" />
                  ) : (
                    <div className="text-[11px] text-muted-foreground">
                      {count} signal{count === 1 ? "" : "s"}
                      {countScope === "exact" ? "" : ` · ${countScope}`} · seen{" "}
                      {formatAgo(m.last_seen, now)}
                    </div>
                  )}
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              {DOT_LABEL[fresh]} · last seen {formatAgo(m.last_seen, now)}
              {count !== undefined && ` · ${count} signal${count === 1 ? "" : "s"}`}
              {countScope !== "exact" && ` · ${countScope}`}
              {countsError && ` · ${countsError}`}
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
