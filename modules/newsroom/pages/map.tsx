"use client";

import { useMemo } from "react";
import {
  Badge,
  Card,
  CardContent,
  SignalMap,
  useModuleTable,
  useSignalHistory,
} from "@wcc-impact/plugin-sdk";
import { MODULE_ID, timeAgo, type Article } from "../ui/shared";

/**
 * Newsroom — Map. News articles the loader could geolocate to a Wellington place
 * are published as `news-article` signals with lat/lng, so they plot on the ONE
 * shared map. This page filters that map to this module and lists the located
 * stories beside it.
 */
export default function NewsroomMap() {
  const {
    rows: articles,
    loading: articlesLoading,
    stale: articlesStale,
    error: articlesError,
  } = useModuleTable<Article>(MODULE_ID, "articles");
  const history = useSignalHistory(
    { moduleId: MODULE_ID, signalType: "news-article" },
    100,
  );
  const locatedSignals = useMemo(
    () =>
      history.signals.filter(
        (signal) => signal.lat != null && signal.lng != null,
      ),
    [history.signals],
  );
  const located = useMemo(
    () => {
      const articleBySignal = new Map(
        articles
          .filter((article) => article.signal_id)
          .map((article) => [article.signal_id, article]),
      );
      return locatedSignals.map((signal) => {
        const article = articleBySignal.get(signal.id);
        return {
          id: signal.id,
          title: article?.title ?? signal.title,
          url: article?.url ?? signal.link ?? null,
          placeName: article?.place_name ?? signal.place_name,
          sourceName: article?.source_name ?? signal.source ?? "News source",
          publishedAt:
            article?.published_at ??
            signal.observed_at ??
            signal.reported_at ??
            signal.created_at,
        };
      });
    },
    [articles, locatedSignals],
  );
  const loading = history.loading && history.signals.length === 0;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Articles mentioning a Wellington-region place are geolocated and dropped on the shared map as{" "}
        <code className="rounded bg-muted px-1 py-0.5 text-xs">news-article</code> signals.
      </p>
      {(history.error || articlesError || history.stale || articlesStale) && (
        <p
          className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
          role="status"
        >
          {history.error && locatedSignals.length === 0
            ? "Mapped stories are temporarily unavailable."
            : "Showing the last confirmed mapped stories while sources refresh."}
          {articlesError && " Some article details could not be refreshed."}
        </p>
      )}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        {loading ? (
          <div
            className="flex h-[60vh] items-center justify-center rounded-lg border border-border bg-muted/20 text-sm text-muted-foreground"
            aria-busy="true"
          >
            Loading mapped stories…
          </div>
        ) : locatedSignals.length > 0 ? (
          <div className="h-[60vh] overflow-hidden rounded-lg border border-border">
            <SignalMap signals={locatedSignals} className="h-full w-full" />
          </div>
        ) : (
          <div className="flex h-[60vh] items-center justify-center rounded-lg border border-border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
            {history.error
              ? "Mapped stories are temporarily unavailable."
              : "No Wellington-region stories have been geolocated yet."}
          </div>
        )}
        <Card className="max-h-[60vh] overflow-y-auto py-0">
          <CardContent className="flex flex-col gap-2 py-3">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-foreground">Located stories</h2>
              <Badge variant="secondary" className="tabular-nums">
                {located.length}
              </Badge>
            </div>
            {loading && (
              <p className="text-xs text-muted-foreground" aria-busy="true">
                Loading mapped stories…
              </p>
            )}
            {!loading && located.length === 0 && (
              <p className="text-xs text-muted-foreground">
                {history.error
                  ? "Mapped stories are temporarily unavailable."
                  : "No geolocated stories yet — most national news has no Wellington place to pin."}
              </p>
            )}
            {located.map((a) => (
              <a
                key={a.id}
                href={a.url ?? undefined}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-col gap-0.5 rounded-md border border-border p-2 transition-colors hover:bg-accent"
              >
                <div className="flex items-center gap-1.5">
                  <Badge className="bg-primary/15 text-[10px] text-foreground">{a.placeName}</Badge>
                  <span className="text-[10px] text-muted-foreground">{a.sourceName}</span>
                  <span className="ml-auto text-[10px] text-muted-foreground">
                    {timeAgo(a.publishedAt)}
                  </span>
                </div>
                <p className="line-clamp-2 text-xs font-medium text-foreground">{a.title}</p>
              </a>
            ))}
            {!loading && history.hasMore && (
              <p className="pt-1 text-[11px] text-muted-foreground">
                Showing the latest mapped stories.
              </p>
            )}
            {articlesLoading && articles.length === 0 && located.length > 0 && (
              <p className="text-[11px] text-muted-foreground">
                Loading full article details…
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
