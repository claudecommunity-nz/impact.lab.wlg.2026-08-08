"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  Badge,
  Button,
  Input,
  invokeModuleFunction,
  Label,
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
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

const PAGE_SIZE = 30;

/**
 * Newsroom — Feed (list view). Live NZ news from this module's own
 * m_newsroom_articles table (refreshed every 5 min by the loader, updated in
 * realtime via the shared channel). Filter by source; open any story to read it
 * and join the live discussion.
 */
export default function NewsroomFeed() {
  const {
    rows: articles,
    loading,
    stale,
    error,
  } = useModuleTable<Article>(MODULE_ID, "articles");
  const [source, setSource] = useState<string>("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const lastTriggerRef = useRef<HTMLElement | null>(null);

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
  const visibleArticles = useMemo(
    () => shown.slice(0, visibleCount),
    [shown, visibleCount],
  );
  const open = articles.find((a) => a.id === openId) ?? null;

  function selectSource(nextSource: string) {
    setSource(nextSource);
    setVisibleCount(PAGE_SIZE);
  }

  function openArticle(articleId: string) {
    lastTriggerRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setOpenId(articleId);
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center gap-2">
        <h2 className="text-xl font-semibold tracking-tight text-foreground">NZ news, live</h2>
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

      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-border bg-card/60 p-2.5">
        <div className="flex min-w-0 flex-1 flex-col gap-1 sm:max-w-sm">
          <Label htmlFor="newsroom-source" className="text-[11px] font-semibold text-muted-foreground">
            News source
          </Label>
          <select
            id="newsroom-source"
            value={source}
            onChange={(event) => selectSource(event.target.value)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <option value="all">All sources — {articles.length.toLocaleString()}</option>
            {sourceCounts.map(([name, count]) => (
              <option key={name} value={name}>
                {name} — {count.toLocaleString()}
              </option>
            ))}
          </select>
        </div>
        <p className="pb-2 text-xs text-muted-foreground" aria-live="polite">
          {shown.length.toLocaleString()} matching {shown.length === 1 ? "story" : "stories"}
        </p>
      </div>

      {loading && articles.length === 0 && (
        <p className="text-sm text-muted-foreground" aria-busy="true">
          Loading the feed…
        </p>
      )}
      {error && articles.length === 0 && (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-foreground"
        >
          News stories are temporarily unavailable. Please try again shortly.
        </p>
      )}
      {(stale || (error && articles.length > 0)) && (
        <p
          role="status"
          className="rounded-md border border-severity-minor/30 bg-severity-minor/10 p-3 text-xs text-muted-foreground"
        >
          Showing the last confirmed stories while the feed reconnects.
        </p>
      )}
      {!loading && !error && shown.length === 0 && (
        <p className="text-sm text-muted-foreground">No articles yet — run the loader to ingest the feeds.</p>
      )}

      {/* List */}
      {shown.length > 0 && (
        <>
          <p className="text-xs text-muted-foreground" aria-live="polite">
            Showing {visibleArticles.length.toLocaleString()} of {shown.length.toLocaleString()} stories
            {source === "all" ? "" : ` from ${source}`}
          </p>
          <ul
            className="flex flex-col divide-y divide-border overflow-hidden rounded-lg border border-border bg-card"
            aria-label="News stories"
          >
            {visibleArticles.map((a) => (
              <ArticleRow
                key={a.id}
                article={a}
                isNew={newIds.has(a.id)}
                onOpen={() => openArticle(a.id)}
              />
            ))}
          </ul>
          {visibleArticles.length < shown.length && (
            <Button
              type="button"
              variant="outline"
              className="min-h-11 w-full"
              onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
            >
              Show {Math.min(PAGE_SIZE, shown.length - visibleArticles.length)} more stories
            </Button>
          )}
        </>
      )}

      <ArticleDialog
        article={open}
        onOpenChange={(isOpen) => {
          if (!isOpen) setOpenId(null);
        }}
        restoreFocusTo={lastTriggerRef}
      />
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
      <img
        src={article.image_url}
        alt={`Image for ${article.title}`}
        className={`object-cover ${className ?? ""}`}
        loading="lazy"
      />
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

/* ── accessible story reader ────────────────────────────────────────────── */

function ArticleDialog({
  article,
  onOpenChange,
  restoreFocusTo,
}: {
  article: Article | null;
  onOpenChange: (open: boolean) => void;
  restoreFocusTo: { current: HTMLElement | null };
}) {
  return (
    <Sheet open={article !== null} onOpenChange={onOpenChange}>
      {article && (
        <SheetContent
          className="gap-0 overflow-y-auto p-0"
          style={{ width: "42rem", maxWidth: "calc(100% - 0.5rem)" }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            restoreFocusTo.current?.focus();
          }}
          aria-describedby="newsroom-story-description"
          showCloseButton={false}
        >
          <div className="relative shrink-0">
            <Thumb article={article} className="max-h-64 min-h-36 w-full" />
            <div className="absolute top-3 left-3">
              <SourceChip name={article.source_name} />
            </div>
            <SheetClose asChild>
              <button
                type="button"
                className="absolute top-3 right-3 flex size-10 items-center justify-center rounded-full bg-black/65 text-xl text-white shadow-sm transition-colors hover:bg-black/80 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
                aria-label="Close story"
              >
                ×
              </button>
            </SheetClose>
          </div>
          <div className="flex flex-col gap-4 p-5">
            <SheetHeader className="gap-3 p-0 pr-8 text-left">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>{formatWhen(article.published_at) || timeAgo(article.created_at)}</span>
                {article.place_name && (
                  <Badge className="bg-primary/15 text-[10px] text-foreground">
                    📍 {article.place_name}
                  </Badge>
                )}
                {article.signal_id && (
                  <Badge variant="secondary" className="text-[10px]">
                    on the shared feed
                  </Badge>
                )}
              </div>
              <SheetTitle className="text-xl leading-snug">{article.title}</SheetTitle>
              <SheetDescription
                id="newsroom-story-description"
                className="text-sm leading-relaxed"
              >
                {article.summary || `A story from ${article.source_name}.`}
              </SheetDescription>
            </SheetHeader>
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
        </SheetContent>
      )}
    </Sheet>
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
        Article discussion{comments.length ? ` · ${comments.length}` : ""}
      </h3>
      {comments.length === 0 && (
        <p className="text-xs text-muted-foreground">No discussion yet — be the first to add context.</p>
      )}
      {comments.map((c) => (
        <div key={c.id} className="flex flex-col gap-1 rounded-md bg-muted/40 p-2.5">
          <div className="flex items-center gap-1.5 text-xs">
            <span className="font-semibold text-foreground">{c.author_name}</span>
            {c.author_location && <span className="text-muted-foreground">· {c.author_location}</span>}
            <span className="ml-auto text-[10px] text-muted-foreground">{timeAgo(c.created_at)}</span>
          </div>
          <p className="text-sm text-foreground">{c.body}</p>
          {c.image_url && (
            <img
              src={c.image_url}
              alt={`Photo attached to discussion comment by ${c.author_name}`}
              className="mt-1 max-h-48 w-fit rounded border border-border object-cover"
            />
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
      <div className="rounded-md border border-severity-minor/40 bg-severity-minor/10 p-2.5">
        <p className="text-xs font-semibold text-foreground">Add local context to this article</p>
        <p id="nr-privacy" className="mt-1 text-xs leading-relaxed text-muted-foreground">
          This is a public discussion and is not monitored by emergency services. Do not use it
          to report an emergency. Use an alias and do not share real names, faces, phone numbers,
          or exact addresses.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="nr-name" className="text-[11px]">
            Display name
          </Label>
          <Input
            id="nr-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Alias or first name"
            maxLength={80}
            className="h-10"
            aria-required="true"
            aria-describedby={`nr-privacy${error ? " nr-form-error" : ""}`}
            aria-invalid={Boolean(error && !name.trim())}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="nr-loc" className="text-[11px]">
            General location <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <Input
            id="nr-loc"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Suburb or town only"
            maxLength={120}
            className="h-10"
            aria-describedby="nr-privacy"
          />
        </div>
      </div>
      <Label htmlFor="nr-comment" className="text-[11px]">
        Comment
      </Label>
      <textarea
        id="nr-comment"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Add context about this article…"
        maxLength={2000}
        rows={3}
        className="rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        aria-required="true"
        aria-describedby={`nr-privacy${error ? " nr-form-error" : ""}`}
        aria-invalid={Boolean(error && !body.trim())}
      />
      <div className="flex flex-col gap-1">
        <Label htmlFor="nr-photo" className="text-[11px]">
          Photo <span className="font-normal text-muted-foreground">(optional, max 2 MB)</span>
        </Label>
        <input
          id="nr-photo"
          type="file"
          accept="image/*"
          onChange={(e) => setImage(e.target.files?.[0] ?? null)}
          className="text-xs text-muted-foreground file:mr-2 file:rounded file:border-0 file:bg-secondary file:px-2 file:py-1 file:text-xs"
          aria-describedby={`nr-privacy${error ? " nr-form-error" : ""}`}
          aria-invalid={Boolean(error && image && image.size > 2 * 1024 * 1024)}
        />
      </div>
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={busy} className="ml-auto min-h-10">
          {busy ? "Posting…" : "Post comment"}
        </Button>
      </div>
      {error && (
        <p id="nr-form-error" role="alert" aria-live="assertive" className="text-xs font-medium text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}

/* ── bits ───────────────────────────────────────────────────────────────── */

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
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2 py-1 text-[11px] font-medium text-muted-foreground">
      <span className="size-1.5 rounded-full bg-primary" aria-hidden />
      Realtime view
    </span>
  );
}
