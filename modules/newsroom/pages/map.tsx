"use client";

import { useMemo } from "react";
import { Badge, Card, CardContent, SignalMap, useModuleTable } from "@wcc-impact/plugin-sdk";
import { MODULE_ID, timeAgo, type Article } from "../ui/shared";

/**
 * Newsroom — Map. News articles the loader could geolocate to a Wellington place
 * are published as `news-article` signals with lat/lng, so they plot on the ONE
 * shared map. This page filters that map to this module and lists the located
 * stories beside it.
 */
export default function NewsroomMap() {
  const { rows: articles } = useModuleTable<Article>(MODULE_ID, "articles");
  const located = useMemo(
    () =>
      articles
        .filter((a) => a.lat != null && a.lng != null)
        .sort((a, b) => (b.published_at ?? b.created_at).localeCompare(a.published_at ?? a.created_at)),
    [articles],
  );

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Articles mentioning a Wellington-region place are geolocated and dropped on the shared map as{" "}
        <code className="rounded bg-muted px-1 py-0.5 text-xs">news-article</code> signals.
      </p>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="h-[60vh] overflow-hidden rounded-lg border border-border">
          <SignalMap filter={{ moduleId: MODULE_ID }} className="h-full w-full" />
        </div>
        <Card className="max-h-[60vh] overflow-y-auto py-0">
          <CardContent className="flex flex-col gap-2 py-3">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-foreground">Located stories</h2>
              <Badge variant="secondary" className="tabular-nums">
                {located.length}
              </Badge>
            </div>
            {located.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No geolocated stories yet — most national news has no Wellington place to pin.
              </p>
            )}
            {located.map((a) => (
              <a
                key={a.id}
                href={a.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-col gap-0.5 rounded-md border border-border p-2 transition-colors hover:bg-accent"
              >
                <div className="flex items-center gap-1.5">
                  <Badge className="bg-primary/15 text-[10px] text-foreground">{a.place_name}</Badge>
                  <span className="text-[10px] text-muted-foreground">{a.source_name}</span>
                  <span className="ml-auto text-[10px] text-muted-foreground">
                    {timeAgo(a.published_at ?? a.created_at)}
                  </span>
                </div>
                <p className="line-clamp-2 text-xs font-medium text-foreground">{a.title}</p>
              </a>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
