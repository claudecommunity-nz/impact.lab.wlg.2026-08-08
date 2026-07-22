"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo } from "react";
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
        <div className="space-y-3 p-6">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-64 w-full" />
        </div>
      ),
    });
  }, [pageImport]);

  if (!entry && !row) {
    return (
      <Card className="m-6">
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
      <Card className="m-6 gap-0 overflow-hidden border-urgency/40 py-0">
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
      "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
      active
        ? "bg-accent text-foreground"
        : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
    );

  return (
    <div>
      <header className="flex flex-wrap items-center gap-3 p-6 pb-4">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-foreground">
          <ModuleIcon name={icon} className="size-5" />
        </span>
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-foreground">{name}</h1>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          <span className={cn("h-2.5 w-2.5 rounded-full", FRESH_DOT[fresh])} aria-hidden />
          {row
            ? `loader seen ${formatAgo(row.last_seen, now)}`
            : "not registered yet — run the loader"}
        </div>
      </header>

      {/* Sub-navigation — only when the module declares extra pages. */}
      {pages.length > 0 && (
        <nav className="flex flex-wrap items-center gap-1 border-b border-border px-6 pb-3">
          <Link href={`/modules/${id}`} className={tabClass(!slug)}>
            Overview
          </Link>
          {pages.map((p) => (
            <Link
              key={p.slug}
              href={`/modules/${id}/${p.slug}`}
              className={tabClass(slug === p.slug)}
            >
              {p.name}
            </Link>
          ))}
        </nav>
      )}

      {slug && !activePage ? (
        <Card className="m-6">
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
          <div className="p-6 pt-4">
            <ModuleUi />
          </div>
        </ModuleErrorBoundary>
      ) : (
        <GeneratedModulePage id={id} />
      )}
    </div>
  );
}
