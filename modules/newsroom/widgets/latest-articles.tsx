"use client";

import { useMemo } from "react";
import {
  Badge,
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
  summary: string | null;
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

function configString(
  config: Readonly<Record<string, unknown>>,
  key: string,
  fallback: string,
): string {
  return typeof config[key] === "string" ? config[key] : fallback;
}

/** Repeatable source/keyword watch showing per-instance widget configuration. */
export default function LatestArticlesWidget({
  config,
  displayMode,
}: WidgetProps) {
  const { rows, loading } = useModuleTable<ArticleRow>("newsroom", "articles");
  const source = configString(config, "source", "all");
  const keywordMode = configString(config, "keywordMode", "any");
  const keywords = useMemo(
    () =>
      configString(config, "keywords", "")
        .split(",")
        .map((keyword) => keyword.trim().toLowerCase())
        .filter(Boolean),
    [config],
  );
  const configuredLimit =
    typeof config.resultLimit === "number" ? config.resultLimit : 6;
  const sizeLimit =
    displayMode === "expanded" ? 12 : displayMode === "compact" ? 3 : 6;
  const limit = Math.max(1, Math.min(configuredLimit, sizeLimit));

  const articles = useMemo(() => {
    const matchesKeywords = (article: ArticleRow) => {
      if (keywords.length === 0) return true;
      const searchable = `${article.title} ${article.summary ?? ""}`.toLowerCase();
      return keywordMode === "all"
        ? keywords.every((keyword) => searchable.includes(keyword))
        : keywords.some((keyword) => searchable.includes(keyword));
    };
    return [...rows]
      .filter(
        (article) =>
          (source === "all" || article.source_name === source) &&
          matchesKeywords(article),
      )
        .sort((a, b) =>
          (b.published_at ?? b.created_at).localeCompare(
            a.published_at ?? a.created_at,
          ),
        )
      .slice(0, limit);
  }, [keywordMode, keywords, limit, rows, source]);

  if (loading && rows.length === 0) return <WidgetSkeleton rows={4} />;
  if (articles.length === 0) {
    return (
      <WidgetEmpty
        title="No matching articles"
        description="Edit this widget to try another source or trigger keyword."
      />
    );
  }

  return (
    <WidgetContent className="p-0">
      <div className="flex min-h-10 items-center gap-2 border-b border-border px-3 py-2">
        <Badge variant="outline" className="max-w-36 truncate">
          {source === "all" ? "All sources" : source}
        </Badge>
        <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
          {keywords.length > 0
            ? `${keywordMode === "all" ? "All" : "Any"}: ${keywords.join(", ")}`
            : "No keyword trigger"}
        </span>
        <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
          {articles.length}/{limit}
        </span>
      </div>
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
