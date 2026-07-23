"use client";

import { useMemo } from "react";
import {
  WidgetContent,
  WidgetEmpty,
  WidgetSkeleton,
  useModuleTable,
  type WidgetProps,
} from "@wcc-impact/plugin-sdk";

interface ArticleRow {
  [key: string]: unknown;
  id: string;
  created_at: string;
  published_at: string | null;
  title: string;
  source_name: string;
}

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "unknown";
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (!Number.isFinite(seconds) || seconds < 0) return "now";
  if (seconds < 60) return "now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/** Reference list widget showing how content adapts to the allocated height. */
export default function LatestArticlesWidget({ displayMode }: WidgetProps) {
  const { rows, loading } = useModuleTable<ArticleRow>("newsroom", "articles");
  const articles = useMemo(
    () =>
      [...rows]
        .sort((a, b) =>
          (b.published_at ?? b.created_at).localeCompare(
            a.published_at ?? a.created_at,
          ),
        )
        .slice(0, displayMode === "expanded" ? 10 : displayMode === "compact" ? 3 : 6),
    [rows, displayMode],
  );

  if (loading && rows.length === 0) return <WidgetSkeleton rows={4} />;
  if (articles.length === 0) {
    return (
      <WidgetEmpty
        title="No articles yet"
        description="Run the Newsroom loader to ingest the first stories."
      />
    );
  }

  return (
    <WidgetContent className="p-0">
      <ul className="min-h-0 flex-1 divide-y divide-border overflow-y-auto">
        {articles.map((article) => (
          <li key={article.id} className="space-y-0.5 px-3 py-2.5">
            <p className="line-clamp-2 text-sm leading-snug font-medium text-foreground">
              {article.title}
            </p>
            <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="truncate">{article.source_name}</span>
              <span aria-hidden="true">·</span>
              <time
                dateTime={article.published_at ?? article.created_at}
                className="shrink-0"
              >
                {timeAgo(article.published_at ?? article.created_at)}
              </time>
            </p>
          </li>
        ))}
      </ul>
    </WidgetContent>
  );
}
