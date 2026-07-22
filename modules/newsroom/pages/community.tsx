"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge, Card, CardContent, useModuleTable } from "@wcc-impact/plugin-sdk";
import { MODULE_ID, timeAgo, type Article, type Comment } from "../ui/shared";

/**
 * Newsroom — Community. A live wall of every public comment (m_newsroom_comments,
 * written by the newsroom-comment edge function). New comments appear in realtime
 * and flash NEW. Each links back to the article it's on.
 */
export default function NewsroomCommunity() {
  const { rows: comments } = useModuleTable<Comment>(MODULE_ID, "comments");
  const { rows: articles } = useModuleTable<Article>(MODULE_ID, "articles");

  const articleById = useMemo(() => {
    const m = new Map<string, Article>();
    for (const a of articles) m.set(a.id, a);
    return m;
  }, [articles]);

  const sorted = useMemo(
    () => [...comments].sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [comments],
  );

  // Flag comments that arrive after the page loaded.
  const [baseline, setBaseline] = useState<Set<string> | null>(null);
  useEffect(() => {
    if (baseline === null && comments.length) setBaseline(new Set(comments.map((c) => c.id)));
  }, [comments, baseline]);
  const isNew = (id: string) => baseline != null && !baseline.has(id);

  return (
    <div className="flex flex-col gap-3">
      <header className="flex flex-wrap items-center gap-2">
        <h1 className="text-lg font-semibold text-foreground">Community reports</h1>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
          <span className="relative flex size-1.5">
            <span className="absolute inline-flex size-1.5 animate-ping rounded-full bg-emerald-500 opacity-75" />
            <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
          </span>
          Live
        </span>
        <Badge variant="secondary" className="tabular-nums">
          {comments.length}
        </Badge>
      </header>
      <p className="text-sm text-muted-foreground">
        What people are adding to the news — posted from the Feed, written by the{" "}
        <code className="rounded bg-muted px-1 py-0.5 text-xs">newsroom-comment</code> edge function.
      </p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {sorted.length === 0 && (
          <p className="text-sm text-muted-foreground">No comments yet.</p>
        )}
        {sorted.map((c) => {
          const article = articleById.get(c.article_id);
          return (
            <Card
              key={c.id}
              className={`gap-0 py-0 ${isNew(c.id) ? "ring-2 ring-primary/50" : ""}`}
            >
              <CardContent className="flex flex-col gap-2 py-3">
                <div className="flex items-center gap-1.5 text-xs">
                  {isNew(c.id) && (
                    <Badge className="animate-pulse bg-primary px-1.5 text-[9px] text-primary-foreground">
                      NEW
                    </Badge>
                  )}
                  <span className="font-semibold text-foreground">{c.author_name}</span>
                  {c.author_location && (
                    <span className="text-muted-foreground">· {c.author_location}</span>
                  )}
                  <span className="ml-auto text-[10px] text-muted-foreground">{timeAgo(c.created_at)}</span>
                </div>
                <p className="text-sm text-foreground">{c.body}</p>
                {c.image_url && (
                  <img
                    src={c.image_url}
                    alt=""
                    className="max-h-44 w-full rounded border border-border object-cover"
                  />
                )}
                {article && (
                  <a
                    href={article.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 line-clamp-1 border-t border-border pt-2 text-[11px] text-muted-foreground hover:text-primary"
                  >
                    on: {article.title}
                  </a>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
