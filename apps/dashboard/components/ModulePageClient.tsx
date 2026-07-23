"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo } from "react";
import { Activity, ChevronRight } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Skeleton,
  cn,
  useModules,
  ModuleIcon,
} from "@wcc-impact/plugin-sdk";
import registry from "../registry.gen";
import { formatAgo, freshness } from "../lib/time";
import { useNow } from "../lib/use-now";
import { GeneratedModulePage } from "./GeneratedModulePage";
import { ModuleErrorBoundary } from "./ModuleErrorBoundary";

const FRESH_DOT = {
  ok: "bg-ok",
  amber: "bg-severity-minor",
  red: "bg-severity-severe",
  never: "bg-severity-unknown",
} as const;

const FRESH_LABEL = {
  ok: "Recently updated",
  amber: "Update delayed",
  red: "Update overdue",
  never: "Awaiting first update",
} as const;

/**
 * Client wrapper for /modules/[id] and /modules/[id]/[slug]: looks the module up
 * in the build-time registry + runtime modules table, renders its sub-navigation
 * (if it declares extra `pages`), then mounts the active page's UI via
 * next/dynamic (ssr:false) inside a per-module error boundary — or the free
 * generated page for data-only modules (PLAN §4.3).
 *
 * @example <ModulePageClient id="team-outage-watch" slug="map" />
 */
export function ModulePageClient({ id, slug }: { id: string; slug?: string }) {
  const { modules, loading } = useModules();
  const now = useNow(30_000);

  const entry = registry.find((e) => e.id === id);
  const row = modules.find((m) => m.id === id) ?? null;
  const pages = entry?.pages ?? [];

  // Which page's UI to mount: a named sub-page, or the index `ui`.
  const activePage = slug ? pages.find((p) => p.slug === slug) : undefined;
  const pageImport = slug ? activePage?.ui : entry?.ui;

  // next/dynamic must be memoised — recreating it each render would remount the
  // module UI (and drop its state) on every signals/modules update.
  const ModuleUi = useMemo(() => {
    if (!pageImport) return null;
    return dynamic(pageImport, {
      ssr: false,
      loading: () => (
        <div className="space-y-3">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-[min(32rem,60vh)] w-full" />
        </div>
      ),
    });
  }, [pageImport]);

  if (!entry && !row) {
    return (
      <Card className="ops-panel m-4 max-w-2xl rounded-lg md:m-6">
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-foreground">
            {loading ? "Loading…" : "Module not found"}
          </CardTitle>
          {!loading && (
            <CardDescription>
              No module <code>{id}</code> in the registry or the modules table. Check the
              id, or run the loader to register it.
            </CardDescription>
          )}
        </CardHeader>
      </Card>
    );
  }

  // Organiser kill-switch: enabled=false removes the tile AND this page's content.
  if (row && !row.enabled) {
    return (
      <Card className="ops-panel m-4 max-w-2xl gap-0 overflow-hidden rounded-lg border-urgency/40 py-0 md:m-6">
        <CardHeader className="border-b border-urgency/30 bg-urgency/10 py-4">
          <CardTitle className="text-lg font-semibold text-foreground">
            Module disabled
          </CardTitle>
        </CardHeader>
        <CardContent className="py-6">
          <p className="text-sm text-muted-foreground">
            <code>{id}</code> has been switched off by the organisers. Find a mentor if
            this is unexpected.
          </p>
        </CardContent>
      </Card>
    );
  }

  const name = row?.name ?? entry?.name ?? id;
  const icon = row?.icon ?? entry?.icon ?? null;
  const description = row?.description ?? entry?.description ?? null;
  const fresh = freshness(row?.last_seen ?? null, now);

  const tabClass = (active: boolean) =>
    cn(
      "flex min-h-10 shrink-0 items-center gap-1.5 rounded-md px-3.5 py-2 text-sm font-semibold transition-colors",
      active
        ? "bg-primary text-primary-foreground shadow-sm"
        : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
      "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
    );

  return (
    <div className="ops-surface min-h-[calc(100dvh-2rem)]">
      <header className="border-b border-border bg-background/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-[1680px] flex-wrap items-center gap-3 px-4 py-4 md:px-6">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-foreground shadow-sm">
            <ModuleIcon name={icon} className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="ops-kicker mb-0.5 flex items-center gap-1.5">
              <Activity className="size-3.5" aria-hidden />
              Response module
            </div>
            <h1 className="truncate text-xl font-semibold tracking-tight text-foreground">
              {name}
            </h1>
            {description && (
              <p className="mt-0.5 max-w-4xl text-[13px] leading-snug text-muted-foreground">
                {description}
              </p>
            )}
          </div>
          <div
            className={cn(
              "ml-auto inline-flex min-h-10 items-center gap-2 rounded-md border border-border bg-card px-3 text-xs font-medium shadow-sm",
              fresh === "red" && "border-severity-severe/40",
              fresh === "amber" && "border-severity-minor/40",
            )}
            aria-label={
              row
                ? `${FRESH_LABEL[fresh]}; loader seen ${formatAgo(row.last_seen, now)}`
                : "Module is not registered yet"
            }
          >
            <span className={cn("size-2 rounded-full", FRESH_DOT[fresh])} aria-hidden />
            <span className="text-foreground">
              {row ? FRESH_LABEL[fresh] : "Not registered"}
            </span>
            <span className="hidden text-muted-foreground sm:inline">
              {row ? formatAgo(row.last_seen, now) : "Run the loader"}
            </span>
          </div>
        </div>
      </header>

      {/* Sub-navigation — only when the module declares extra pages. */}
      {pages.length > 0 && (
        <div className="border-b border-border bg-card/80">
          <nav
            aria-label={`${name} pages`}
            className="mx-auto flex max-w-[1680px] flex-wrap items-center gap-1 px-4 py-2 md:flex-nowrap md:overflow-x-auto md:px-6"
          >
            <Link
              href={`/modules/${id}`}
              aria-current={!slug ? "page" : undefined}
              className={tabClass(!slug)}
            >
              Overview
            </Link>
            {pages.map((p) => (
              <Link
                key={p.slug}
                href={`/modules/${id}/${p.slug}`}
                aria-current={slug === p.slug ? "page" : undefined}
                className={tabClass(slug === p.slug)}
              >
                {p.name}
                {slug === p.slug && <ChevronRight className="size-3.5" aria-hidden />}
              </Link>
            ))}
          </nav>
        </div>
      )}

      <div className="mx-auto max-w-[1680px]">
        {slug && !activePage ? (
          <Card className="ops-panel m-4 rounded-lg md:m-6">
            <CardHeader>
              <CardTitle className="text-base">Page not found</CardTitle>
              <CardDescription>
                This module has no page <code>{slug}</code>.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : ModuleUi ? (
          // key resets the boundary when navigating between this module's pages.
          <ModuleErrorBoundary key={`${id}/${slug ?? ""}`} moduleId={id}>
            <div className="p-4 md:p-6">
              <ModuleUi />
            </div>
          </ModuleErrorBoundary>
        ) : (
          <GeneratedModulePage id={id} />
        )}
      </div>
    </div>
  );
}
