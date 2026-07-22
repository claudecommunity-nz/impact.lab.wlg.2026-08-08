"use client";

import { useMemo } from "react";
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  useModuleTable,
} from "@wcc-impact/plugin-sdk";
import { MODULE_ID, timeAgo, type Refresh, type Source } from "../ui/shared";

/**
 * Newsroom — Feeds & refreshes. The module's OWN operational tables:
 * m_newsroom_sources (per-feed health, updated every cycle) and
 * m_newsroom_refreshes (one row per 5-minute cycle). Both live via realtime.
 */
export default function NewsroomFeeds() {
  const { rows: sources } = useModuleTable<Source>(MODULE_ID, "sources");
  const { rows: refreshes } = useModuleTable<Refresh>(MODULE_ID, "refreshes");

  const sortedSources = useMemo(
    () => [...sources].sort((a, b) => a.name.localeCompare(b.name)),
    [sources],
  );
  const sortedRefreshes = useMemo(
    () => [...refreshes].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 30),
    [refreshes],
  );
  const okCount = sources.filter((s) => s.last_status === "ok").length;

  return (
    <div className="flex flex-col gap-5">
      <Card className="gap-0 py-0">
        <CardHeader className="gap-1 border-b border-border bg-muted/30 py-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            Managed feeds
            <Badge variant="secondary" className="tabular-nums">
              {okCount}/{sources.length} ok
            </Badge>
            <Badge variant="outline" className="ml-auto font-mono text-[10px]">
              m_newsroom_sources
            </Badge>
          </CardTitle>
          <CardDescription className="text-[11px]">
            Per-feed health, refreshed every cycle by the loader.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Source</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Items</TableHead>
                <TableHead className="text-right">Latency</TableHead>
                <TableHead className="text-right">Last fetched</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedSources.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium text-foreground">
                    {s.name}
                    {s.category && (
                      <Badge variant="outline" className="ml-2 text-[9px]">
                        {s.category}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {s.last_status === "ok" ? (
                      <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                        <span className="size-1.5 rounded-full bg-emerald-500" /> ok
                      </span>
                    ) : (
                      <span
                        className="inline-flex items-center gap-1.5 text-xs text-destructive"
                        title={s.last_error ?? undefined}
                      >
                        <span className="size-1.5 rounded-full bg-destructive" /> error
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{s.last_item_count ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {s.last_duration_ms != null ? `${s.last_duration_ms}ms` : "—"}
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">
                    {timeAgo(s.last_fetched_at)}
                  </TableCell>
                </TableRow>
              ))}
              {sources.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                    No feeds yet — run the loader.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="gap-0 py-0">
        <CardHeader className="gap-1 border-b border-border bg-muted/30 py-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            Refresh log
            <Badge variant="outline" className="ml-auto font-mono text-[10px]">
              m_newsroom_refreshes
            </Badge>
          </CardTitle>
          <CardDescription className="text-[11px]">One row per 5-minute cycle.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead className="text-right">Feeds ok</TableHead>
                <TableHead className="text-right">New articles</TableHead>
                <TableHead className="text-right">New signals</TableHead>
                <TableHead className="text-right">Duration</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedRefreshes.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs text-muted-foreground">{timeAgo(r.created_at)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.sources_ok}
                    {r.sources_failed > 0 && (
                      <span className="text-destructive"> / {r.sources_failed} failed</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-medium text-foreground">
                    {r.new_articles}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{r.new_signals}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {r.duration_ms != null ? `${r.duration_ms}ms` : "—"}
                  </TableCell>
                </TableRow>
              ))}
              {refreshes.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                    No refreshes logged yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
