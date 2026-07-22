"use client";

import { useContext, useEffect, useMemo, useState, type ReactElement } from "react";
import { ExternalLink, MapPin } from "lucide-react";
import type { SignalRow } from "@wcc-impact/shared";
import {
  Badge,
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
  SeverityBadge,
  Skeleton,
  cn,
  severityColor,
  timeAgo,
} from "@wcc-impact/ui";
import { SignalContext, requireStore } from "./context";
import { applyFilter, type SignalFilter } from "./use-signals";

/**
 * One standardised feed card: severity accent, title, meta line (module ·
 * type · source), relative timestamp, optional description/place/media/link.
 * NOTE: `manifest.feedCard` is accepted-but-ignored for now — SignalFeed always
 * renders this SignalCard; per-module card swapping is not wired up this event.
 *
 * @example <SignalCard signal={signal} />
 */
export function SignalCard({
  signal,
  className,
}: {
  signal: SignalRow;
  className?: string;
}): ReactElement {
  const s = signal;
  // Only render http(s) links — a javascript: URL here is a stored-XSS click sink.
  const safeLink = s.link && /^https?:\/\//i.test(s.link) ? s.link : undefined;
  return (
    <Card
      className={cn("gap-3 py-4", className)}
      // Severity is a FIXED data scale — the left accent border is data-driven.
      style={{ borderLeft: `4px solid ${severityColor(s.severity)}` }}
    >
      <CardHeader className="px-4">
        <CardTitle className="text-sm font-semibold">{s.title}</CardTitle>
        <CardAction>
          <span className="text-xs whitespace-nowrap text-muted-foreground">
            {timeAgo(s.created_at)}
          </span>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 px-4">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <SeverityBadge severity={s.severity} />
          <span>
            {s.module_id} · {s.signal_type}
            {s.source ? ` · ${s.source}` : ""}
          </span>
          {s.verification && s.verification !== "unverified" && (
            <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
              {s.verification}
            </Badge>
          )}
        </div>
        {s.description && <p className="text-sm text-foreground">{s.description}</p>}
        {s.place_name && (
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="size-3 shrink-0" aria-hidden />
            {s.place_name}
          </p>
        )}
        {s.media_urls && s.media_urls.length > 0 && (
          <div className="flex gap-2">
            {s.media_urls.slice(0, 3).map((url) => (
              <img
                key={url}
                src={url}
                alt=""
                loading="lazy"
                className="h-16 w-16 rounded-md object-cover"
              />
            ))}
          </div>
        )}
        {safeLink && (
          <a
            href={safeLink}
            target="_blank"
            rel="noreferrer"
            className="inline-flex w-fit items-center gap-1 text-xs font-medium text-foreground underline underline-offset-2 hover:decoration-2"
          >
            Source <ExternalLink className="size-3" aria-hidden />
          </a>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Standardised feed list, newest first. Pass `signals` OR `filter`; if both,
 * `signals` wins (same rule as SignalMap). Relative timestamps re-render
 * every 30 s.
 *
 * @example
 * <SignalFeed filter={{ moduleId: "team-x" }} limit={20} />
 */
export function SignalFeed({
  signals,
  filter,
  limit = 50,
  className,
}: {
  signals?: SignalRow[];
  filter?: SignalFilter;
  limit?: number;
  className?: string;
}): ReactElement {
  const store = useContext(SignalContext);
  const fromStore = useMemo(
    () => (signals ? [] : applyFilter(requireStore(store, "<SignalFeed filter>").signals, filter)),
    [signals, store?.signals, filter?.moduleId, filter?.signalType, filter?.since],
  );
  const data = (signals ?? fromStore).slice(0, limit);

  // Tick so "4m ago" stays honest while the feed sits on the big screen.
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  const loading = !signals && (store?.loading ?? false);

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {loading && data.length === 0 && (
        <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading signals">
          {[0, 1, 2].map((i) => (
            <Card key={i} className="gap-3 py-4">
              <CardHeader className="px-4">
                <Skeleton className="h-4 w-3/4" />
              </CardHeader>
              <CardContent className="flex flex-col gap-2 px-4">
                <Skeleton className="h-3 w-1/2" />
                <Skeleton className="h-3 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      {!loading && data.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No signals yet — publish one from your loader.
        </p>
      )}
      {data.map((s) => (
        <SignalCard key={s.id} signal={s} />
      ))}
    </div>
  );
}
