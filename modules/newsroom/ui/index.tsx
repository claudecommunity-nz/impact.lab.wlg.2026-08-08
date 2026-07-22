"use client";

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  Badge,
  Button,
  Input,
  invokeModuleFunction,
  Label,
  useModuleTable,
} from "@wcc-impact/plugin-sdk";
import {
  fileToBase64,
  formatWhen,
  MODULE_ID,
  sourceHue,
  timeAgo,
  type Article,
  type Comment,
} from "./shared";

/**
 * Newsroom — Feed (list view). Live NZ news from this module's own
 * m_newsroom_articles table (refreshed every 5 min by the loader, updated in
 * realtime via the shared channel). Filter by source; open any story to read it
 * and join the live discussion.
 */
export default function NewsroomFeed() {
  const { rows: articles, loading } = useModuleTable<Article>(MODULE_ID, "articles");
  const [source, setSource] = useState<string>("all");
  const [openId, setOpenId] = useState<string | null>(null);

  // Realtime "what's new": snapshot ids present on first load; later arrivals flash NEW.
  const [baseline, setBaseline] = useState<Set<string> | null>(null);
  useEffect(() => {
    if (baseline === null && articles.length) setBaseline(new Set(articles.map((a) => a.id)));
  }, [articles, baseline]);
  const newIds = useMemo(
    () =>
      baseline ? new Set(articles.filter((a) => !baseline.has(a.id)).map((a) => a.id)) : new Set<string>(),
    [articles, baseline],
  );
  const clearNew = () => setBaseline(new Set(articles.map((a) => a.id)));

  const byPublished = useMemo(
    () =>
      [...articles].sort((a, b) =>
        (b.published_at ?? b.created_at).localeCompare(a.published_at ?? a.created_at),
      ),
    [articles],
  );
  const sourceCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of articles) m.set(a.source_name, (m.get(a.source_name) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [articles]);

  const shown = useMemo(
    () => byPublished.filter((a) => source === "all" || a.source_name === source),
    [byPublished, source],
  );
  const open = articles.find((a) => a.id === openId) ?? null;

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">NZ news, live</h1>
        <LiveDot />
        <Badge variant="secondary" className="tabular-nums">
          {articles.length}
        </Badge>
        <span className="text-xs text-muted-foreground">
          ingested every 5 minutes · click a story to read &amp; discuss
        </span>
        {newIds.size > 0 && (
          <button
            type="button"
            onClick={clearNew}
            className="ml-auto flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-primary/20"
          >
            <Ping />
            {newIds.size} new — tap to clear
          </button>
        )}
      </header>

      {/* Per-source filter with counts */}
      <div className="flex flex-wrap gap-1.5">
        <FilterChip active={source === "all"} onClick={() => setSource("all")} count={articles.length}>
          All sources
        </FilterChip>
        {sourceCounts.map(([name, n]) => (
          <FilterChip
            key={name}
            active={source === name}
            onClick={() => setSource(name)}
            count={n}
            hue={sourceHue(name)}
          >
            {name}
          </FilterChip>
        ))}
      </div>

      {loading && articles.length === 0 && (
        <p className="text-sm text-muted-foreground">Loading the feed…</p>
      )}
      {!loading && shown.length === 0 && (
        <p className="text-sm text-muted-foreground">No articles yet — run the loader to ingest the feeds.</p>
      )}

      {/* List */}
      <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
        {shown.map((a) => (
          <ArticleRow key={a.id} article={a} isNew={newIds.has(a.id)} onOpen={() => setOpenId(a.id)} />
        ))}
      </ul>

      {open && <ArticleModal article={open} onClose={() => setOpenId(null)} />}
    </div>
  );
}

/* ── list row ───────────────────────────────────────────────────────────── */

function ArticleRow({ article, isNew, onOpen }: { article: Article; isNew: boolean; onOpen: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className={`group flex w-full items-start gap-3 p-3 text-left transition-colors hover:bg-accent/50 ${
          isNew ? "bg-primary/5" : ""
        }`}
      >
        <Thumb article={article} className="size-16 shrink-0 rounded-md sm:size-20" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {isNew && (
              <Badge className="animate-pulse bg-primary px-1.5 text-[9px] text-primary-foreground">NEW</Badge>
            )}
            <SourceChip name={article.source_name} />
            {article.place_name && (
              <span className="text-[10px] font-medium text-primary">📍 {article.place_name}</span>
            )}
            <span className="ml-auto text-[11px] text-muted-foreground" title={formatWhen(article.published_at)}>
              {timeAgo(article.published_at ?? article.created_at)}
            </span>
          </div>
          <h3 className="line-clamp-2 text-sm leading-snug font-semibold text-foreground group-hover:text-primary">
            {article.title}
          </h3>
          {article.summary && (
            <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">{article.summary}</p>
          )}
        </div>
      </button>
    </li>
  );
}

/* ── image / fallback ───────────────────────────────────────────────────── */

function Thumb({ article, className }: { article: Article; className?: string }) {
  const hue = sourceHue(article.source_name);
  if (article.image_url) {
    return (
      <img src={article.image_url} alt="" className={`object-cover ${className ?? ""}`} loading="lazy" />
    );
  }
  return (
    <div
      className={`flex items-center justify-center ${className ?? ""}`}
      style={{ background: `linear-gradient(135deg, hsl(${hue} 55% 32%), hsl(${(hue + 40) % 360} 55% 22%))` }}
    >
      <span className="px-1 text-center text-[10px] leading-tight font-semibold text-white/90">
        {article.source_name}
      </span>
    </div>
  );
}

function SourceChip({ name }: { name: string }) {
  const hue = sourceHue(name);
  return (
    <span
      className="rounded-full px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm"
      style={{ backgroundColor: `hsl(${hue} 55% 38%)` }}
    >
      {name}
    </span>
  );
}

/* ── modal reader ───────────────────────────────────────────────────────── */

function ArticleModal({ article, onClose }: { article: Article; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="my-8 w-full max-w-2xl overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative">
          <Thumb article={article} className="max-h-64 w-full" />
          <button
            type="button"
            onClick={onClose}
            className="absolute top-3 right-3 flex size-8 items-center justify-center rounded-full bg-black/50 text-lg text-white transition-colors hover:bg-black/70"
            aria-label="Close"
          >
            ×
          </button>
          <div className="absolute top-3 left-3">
            <SourceChip name={article.source_name} />
          </div>
        </div>
        <div className="flex flex-col gap-3 p-5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{formatWhen(article.published_at) || timeAgo(article.created_at)}</span>
            {article.place_name && (
              <Badge className="bg-primary/15 text-[10px] text-foreground">📍 {article.place_name}</Badge>
            )}
            {article.signal_id && (
              <Badge variant="secondary" className="ml-auto text-[10px]">
                on the shared feed
              </Badge>
            )}
          </div>
          <h2 className="text-xl leading-snug font-semibold text-foreground">{article.title}</h2>
          {article.summary && (
            <p className="text-sm leading-relaxed text-muted-foreground">{article.summary}</p>
          )}
          <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-primary hover:underline"
          >
            Read the full article on {article.source_name} →
          </a>
          <div className="mt-1 border-t border-border pt-4">
            <CommentThread articleId={article.id} />
            <CommentForm articleId={article.id} />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── comments ───────────────────────────────────────────────────────────── */

function CommentThread({ articleId }: { articleId: string }) {
  const { rows } = useModuleTable<Comment>(MODULE_ID, "comments");
  const comments = useMemo(
    () => rows.filter((c) => c.article_id === articleId).sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [rows, articleId],
  );
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-foreground">
        Discussion{comments.length ? ` · ${comments.length}` : ""}
      </h3>
      {comments.length === 0 && <p className="text-xs text-muted-foreground">No comments yet — be the first.</p>}
      {comments.map((c) => (
        <div key={c.id} className="flex flex-col gap-1 rounded-md bg-muted/40 p-2.5">
          <div className="flex items-center gap-1.5 text-xs">
            <span className="font-semibold text-foreground">{c.author_name}</span>
            {c.author_location && <span className="text-muted-foreground">· {c.author_location}</span>}
            <span className="ml-auto text-[10px] text-muted-foreground">{timeAgo(c.created_at)}</span>
          </div>
          <p className="text-sm text-foreground">{c.body}</p>
          {c.image_url && (
            <img src={c.image_url} alt="" className="mt-1 max-h-48 w-fit rounded border border-border object-cover" />
          )}
        </div>
      ))}
    </div>
  );
}

function CommentForm({ articleId }: { articleId: string }) {
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [body, setBody] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim() || !body.trim()) {
      setError("Name and comment are required.");
      return;
    }
    if (image && image.size > 2 * 1024 * 1024) {
      setError("Image must be under 2 MB.");
      return;
    }
    setBusy(true);
    try {
      const payload: Record<string, unknown> = {
        article_id: articleId,
        author_name: name.trim(),
        author_location: location.trim(),
        body: body.trim(),
      };
      if (image) {
        payload.image_base64 = await fileToBase64(image);
        payload.image_type = image.type;
      }
      await invokeModuleFunction(MODULE_ID, "comment", payload);
      setBody("");
      setImage(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not post your comment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 flex flex-col gap-2 rounded-md border border-border p-3">
      <p className="text-xs font-medium text-foreground">Add your report</p>
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="nr-name" className="text-[11px]">
            Name
          </Label>
          <Input id="nr-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" maxLength={80} className="h-8" />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="nr-loc" className="text-[11px]">
            Location
          </Label>
          <Input id="nr-loc" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Suburb / town" maxLength={120} className="h-8" />
        </div>
      </div>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="What are you seeing? Add local context…"
        maxLength={2000}
        rows={3}
        className="rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
      />
      <div className="flex items-center gap-2">
        <input
          type="file"
          accept="image/*"
          onChange={(e) => setImage(e.target.files?.[0] ?? null)}
          className="text-xs text-muted-foreground file:mr-2 file:rounded file:border-0 file:bg-secondary file:px-2 file:py-1 file:text-xs"
        />
        <Button type="submit" size="sm" disabled={busy} className="ml-auto">
          {busy ? "Posting…" : "Post"}
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <p className="text-[10px] text-muted-foreground">
        Public — no real names, faces, or addresses. Posts go through the newsroom-comment edge function.
      </p>
    </form>
  );
}

/* ── bits ───────────────────────────────────────────────────────────────── */

function FilterChip({
  active,
  onClick,
  count,
  hue,
  children,
}: {
  active: boolean;
  onClick: () => void;
  count?: number;
  hue?: number;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={active ? "default" : "outline"}
      className="h-7 gap-1.5 rounded-full px-3 text-xs"
      onClick={onClick}
    >
      {hue != null && !active && (
        <span className="size-2 rounded-full" style={{ backgroundColor: `hsl(${hue} 55% 45%)` }} />
      )}
      {children}
      {count != null && <span className="tabular-nums opacity-70">{count}</span>}
    </Button>
  );
}

function Ping() {
  return (
    <span className="relative flex size-2">
      <span className="absolute inline-flex size-2 animate-ping rounded-full bg-primary opacity-75" />
      <span className="relative inline-flex size-2 rounded-full bg-primary" />
    </span>
  );
}

function LiveDot() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
      <span className="relative flex size-1.5">
        <span className="absolute inline-flex size-1.5 animate-ping rounded-full bg-emerald-500 opacity-75" />
        <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
      </span>
      Live
    </span>
  );
}
