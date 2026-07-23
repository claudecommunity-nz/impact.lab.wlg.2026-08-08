"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  Boxes,
  CircleAlert,
  CircleCheck,
  Clock3,
  Database,
  ExternalLink,
  FileJson2,
  GitCommitHorizontal,
  GitPullRequest,
  ImageIcon,
  RefreshCw,
  Search,
  Table2,
} from "lucide-react";
import { Badge } from "@wcc-impact/ui/components/ui/badge";
import { Button } from "@wcc-impact/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@wcc-impact/ui/components/ui/card";
import { Input } from "@wcc-impact/ui/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@wcc-impact/ui/components/ui/table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@wcc-impact/ui/components/ui/tabs";
import {
  CURRENT_MODULE_CONTRACT_VERSION,
  PLUGIN_SDK_VERSION,
  SUPPORTED_MODULE_CONTRACT_VERSIONS,
  cn,
  moduleContractCompatibilityError,
  useSignalHistory,
} from "@wcc-impact/plugin-sdk";

import { unavailableGitHubActivity } from "../../lib/activity/github";
import { buildSupabaseActivity } from "../../lib/activity/supabase";
import type {
  ActivitySourceHealth,
  CheckSummary,
  GitHubActivity,
  GitHubPullRequestActivity,
  SupabaseActivity,
  SupabaseModuleActivity,
} from "../../lib/activity/types";
import { formatAgo, freshness } from "../../lib/time";
import { useNow } from "../../lib/use-now";

type StatusFilter = "all" | "healthy" | "attention";

async function getJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.json() as Promise<T>;
}

function moduleNeedsAttention(module: SupabaseModuleActivity, now: number): boolean {
  return (
    !module.enabled ||
    module.contractVersion === null ||
    moduleContractCompatibilityError(module.contractVersion) !== null ||
    freshness(module.lastSeen, now) !== "ok" ||
    module.queueDepth > 0 ||
    module.queueDeadLetters > 0
  );
}

function pullNeedsAttention(pull: GitHubPullRequestActivity): boolean {
  return pull.draft || pull.checks.state !== "success";
}

function matchesStatus(needsAttention: boolean, filter: StatusFilter): boolean {
  return filter === "all" || (filter === "attention" ? needsAttention : !needsAttention);
}

export function ActivityView() {
  const [github, setGitHub] = useState<GitHubActivity | null>(null);
  const [supabase, setSupabase] = useState<SupabaseActivity | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");
  const [moduleFilter, setModuleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const now = useNow(15_000);
  const history = useSignalHistory(
    { moduleId: moduleFilter === "all" ? undefined : moduleFilter },
    50,
  );

  const load = useCallback(async (manual = false, signal?: AbortSignal) => {
    if (manual) setRefreshing(true);
    const controller = signal ? null : new AbortController();
    const requestSignal = signal ?? controller!.signal;
    const [githubResult, supabaseResult] = await Promise.allSettled([
      getJson<GitHubActivity>("/api/activity/github", requestSignal),
      getJson<SupabaseActivity>("/api/activity/supabase", requestSignal),
    ]);

    if (requestSignal.aborted) return;
    setGitHub(
      githubResult.status === "fulfilled"
        ? githubResult.value
        : unavailableGitHubActivity(
            "claudecommunity-nz/impact.lab.wlg.2026-08-08",
            githubResult.reason instanceof Error
              ? githubResult.reason.message
              : "GitHub activity request failed",
          ),
    );
    setSupabase(
      supabaseResult.status === "fulfilled"
        ? supabaseResult.value
        : buildSupabaseActivity({
            unavailable: true,
            errors: [
              supabaseResult.reason instanceof Error
                ? supabaseResult.reason.message
                : "Supabase activity request failed",
            ],
          }),
    );
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(false, controller.signal);
    const interval = window.setInterval(() => void load(false), 30_000);
    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, [load]);

  const normalizedQuery = query.trim().toLowerCase();
  const modules = useMemo(
    () =>
      (supabase?.modules ?? []).filter(
        (module) =>
          (moduleFilter === "all" || module.id === moduleFilter) &&
          matchesStatus(moduleNeedsAttention(module, now), statusFilter) &&
          (!normalizedQuery ||
            `${module.id} ${module.name} ${module.description ?? ""}`
              .toLowerCase()
              .includes(normalizedQuery)),
      ),
    [moduleFilter, normalizedQuery, now, statusFilter, supabase?.modules],
  );
  const pullRequests = useMemo(
    () =>
      (github?.pullRequests ?? []).filter(
        (pull) =>
          matchesStatus(pullNeedsAttention(pull), statusFilter) &&
          (moduleFilter === "all" ||
            `${pull.branch} ${pull.title}`.toLowerCase().includes(moduleFilter.toLowerCase())) &&
          (!normalizedQuery ||
            `${pull.title} ${pull.branch} ${pull.author}`.toLowerCase().includes(normalizedQuery)),
      ),
    [github?.pullRequests, moduleFilter, normalizedQuery, statusFilter],
  );
  const commits = useMemo(
    () =>
      (github?.commits ?? []).filter(
        (commit) =>
          (moduleFilter === "all" ||
            commit.message.toLowerCase().includes(moduleFilter.toLowerCase())) &&
          (!normalizedQuery ||
            `${commit.message} ${commit.author}`.toLowerCase().includes(normalizedQuery)),
      ),
    [github?.commits, moduleFilter, normalizedQuery],
  );
  const signals = useMemo(
    () =>
      (supabase?.recentSignals ?? []).filter(
        (signal) =>
          (moduleFilter === "all" || signal.moduleId === moduleFilter) &&
          (!normalizedQuery ||
            `${signal.title} ${signal.signalType} ${signal.moduleId}`
              .toLowerCase()
              .includes(normalizedQuery)),
      ),
    [moduleFilter, normalizedQuery, supabase?.recentSignals],
  );
  const historicalSignals = useMemo(() => {
    const paged = history.signals.map((signal) => ({
      id: signal.id,
      createdAt: signal.created_at,
      title: signal.title,
      signalType: signal.signal_type,
      moduleId: signal.module_id,
      sourceType: signal.source_type,
      severity: signal.severity,
      verification: signal.verification,
    }));
    const source = paged.length > 0 || !history.error ? paged : signals;
    return source.filter(
      (signal) =>
        !normalizedQuery ||
        `${signal.title} ${signal.signalType} ${signal.moduleId}`
          .toLowerCase()
          .includes(normalizedQuery),
    );
  }, [history.error, history.signals, normalizedQuery, signals]);
  const tables = useMemo(
    () =>
      (supabase?.tables ?? []).filter(
        (table) =>
          (moduleFilter === "all" || table.moduleId === moduleFilter) &&
          (!normalizedQuery ||
            `${table.moduleId} ${table.logicalName} ${table.physicalName}`
              .toLowerCase()
              .includes(normalizedQuery)),
      ),
    [moduleFilter, normalizedQuery, supabase?.tables],
  );
  const media = useMemo(
    () =>
      (supabase?.recentMedia ?? []).filter(
        (item) =>
          (moduleFilter === "all" || item.moduleId === moduleFilter) &&
          (!normalizedQuery ||
            `${item.moduleId} ${item.name}`.toLowerCase().includes(normalizedQuery)),
      ),
    [moduleFilter, normalizedQuery, supabase?.recentMedia],
  );

  const openPulls = github?.pullRequests.filter((pull) => pull.state === "open").length ?? 0;
  const attentionPulls =
    github?.pullRequests.filter((pull) => pull.state === "open" && pullNeedsAttention(pull))
      .length ?? 0;
  const queuedSignals =
    supabase?.modules.reduce((total, module) => total + module.queueDepth, 0) ?? 0;
  const deadLetters =
    supabase?.modules.reduce((total, module) => total + module.queueDeadLetters, 0) ?? 0;
  const latestFetch = [github?.source.fetchedAt, supabase?.source.fetchedAt]
    .filter(Boolean)
    .sort()
    .at(-1);

  return (
    <div className="min-h-dvh bg-muted/20">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-4 px-4 py-5 md:px-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="mb-1 flex items-center gap-2 text-xs font-medium tracking-wider text-muted-foreground uppercase">
                <Activity className="size-4 text-ok" />
                Impact Lab delivery room
              </div>
              <div className="mb-2 flex flex-wrap gap-1.5">
                <Badge variant="secondary">
                  Platform contract v{CURRENT_MODULE_CONTRACT_VERSION}
                </Badge>
                <Badge variant="outline">Plugin SDK v{PLUGIN_SDK_VERSION}</Badge>
                <Badge variant="outline">
                  Supports{" "}
                  {SUPPORTED_MODULE_CONTRACT_VERSIONS.map((version) => `v${version}`).join(", ")}
                </Badge>
              </div>
              <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Lab activity</h1>
              <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                Follow what teams are shipping and what the shared platform is receiving—without
                leaving the common operating picture.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right text-xs text-muted-foreground" aria-live="polite">
                <div>Auto-refreshes every 30 seconds</div>
                <div>{latestFetch ? `Updated ${formatAgo(latestFetch, now)}` : "Loading…"}</div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void load(true)}
                disabled={refreshing}
              >
                <RefreshCw className={cn("size-4", refreshing && "animate-spin")} />
                Refresh
              </Button>
            </div>
          </div>

          <div className="grid gap-2 xl:grid-cols-[minmax(220px,1fr)_220px_180px]">
            <label className="relative">
              <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search teams, PRs, signals, or tables"
                className="pl-9"
              />
            </label>
            <select
              aria-label="Filter by module"
              value={moduleFilter}
              onChange={(event) => setModuleFilter(event.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-xs"
            >
              <option value="all">All teams and modules</option>
              {(supabase?.modules ?? []).map((module) => (
                <option key={module.id} value={module.id}>
                  {module.name}
                </option>
              ))}
            </select>
            <select
              aria-label="Filter by status"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-xs"
            >
              <option value="all">All statuses</option>
              <option value="healthy">Healthy / green</option>
              <option value="attention">Needs attention</option>
            </select>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1600px] flex-col gap-4 p-4 md:p-6">
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <Metric
            icon={Boxes}
            label="Modules live"
            value={supabase?.totals.enabledModules ?? "—"}
            hint={`${supabase?.totals.registeredModules ?? 0} registered`}
          />
          <Metric
            icon={GitCommitHorizontal}
            label="Recent commits"
            value={github?.commits.length ?? "—"}
            hint="default branch"
          />
          <Metric
            icon={GitPullRequest}
            label="Open PRs"
            value={openPulls}
            hint={attentionPulls ? `${attentionPulls} need attention` : "checks clear"}
            attention={attentionPulls > 0}
          />
          <Metric
            icon={Database}
            label="Shared signals"
            value={supabase?.totals.signals ?? "—"}
            hint={`${supabase?.recentSignals.length ?? 0} newest previewed`}
          />
          <Metric
            icon={Table2}
            label="Module tables"
            value={supabase?.totals.declaredTables ?? "—"}
            hint="manifest-declared"
          />
          <Metric
            icon={Clock3}
            label="Signals queued"
            value={queuedSignals}
            hint={deadLetters ? `${deadLetters} need inspection` : "laptop outboxes"}
            attention={queuedSignals > 0 || deadLetters > 0}
          />
        </section>

        <div className="grid gap-3 lg:grid-cols-2">
          <SourceHealthCard health={github?.source} loading={loading} />
          <SourceHealthCard health={supabase?.source} loading={loading} />
        </div>

        <Tabs defaultValue="overview">
          <TabsList variant="line" className="w-full justify-start border-b border-border">
            <TabsTrigger value="overview">Team overview</TabsTrigger>
            <TabsTrigger value="github">Commits &amp; PRs</TabsTrigger>
            <TabsTrigger value="data">Supabase data</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-3 space-y-4">
            <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {modules.map((module) => (
                <ModuleCard key={module.id} module={module} now={now} />
              ))}
              {!loading && modules.length === 0 && (
                <EmptyState label="No modules match the current filters." />
              )}
            </section>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
              <PullRequestPanel pullRequests={pullRequests.slice(0, 8)} />
              <CommitPanel commits={commits.slice(0, 10)} />
            </div>
          </TabsContent>

          <TabsContent value="github" className="mt-3">
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
              <PullRequestPanel pullRequests={pullRequests} />
              <CommitPanel commits={commits} />
            </div>
          </TabsContent>

          <TabsContent value="data" className="mt-3 space-y-4">
            <RecentSignalsPanel
              signals={historicalSignals}
              loading={history.loading}
              loadingMore={history.loadingMore}
              hasMore={history.hasMore}
              stale={history.stale}
              error={history.error}
              onLoadMore={history.loadMore}
              onRefresh={history.refresh}
            />
            <TableExplorer tables={tables} />
            <MediaPanel media={media} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  hint,
  attention = false,
}: {
  icon: typeof Activity;
  label: string;
  value: string | number;
  hint: string;
  attention?: boolean;
}) {
  return (
    <Card className="gap-2 py-4">
      <CardContent className="px-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {label}
          </span>
          <Icon className={cn("size-4 text-muted-foreground", attention && "text-urgency")} />
        </div>
        <div className="mt-2 text-3xl font-semibold tabular-nums">{value}</div>
        <div className={cn("mt-1 text-xs text-muted-foreground", attention && "text-urgency")}>
          {hint}
        </div>
      </CardContent>
    </Card>
  );
}

function SourceHealthCard({
  health,
  loading,
}: {
  health: ActivitySourceHealth | undefined;
  loading: boolean;
}) {
  const status = health?.status ?? "unavailable";
  const healthy = status === "ok";
  const Icon = healthy ? CircleCheck : CircleAlert;
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-lg border bg-card px-4 py-3",
        status !== "ok" && "border-urgency/50 bg-urgency/5",
      )}
    >
      {loading && !health ? (
        <RefreshCw className="mt-0.5 size-4 animate-spin text-muted-foreground" />
      ) : (
        <Icon className={cn("mt-0.5 size-4", healthy ? "text-ok" : "text-urgency")} />
      )}
      <div className="min-w-0">
        <div className="text-sm font-medium capitalize">
          {health?.source ?? "Activity source"} · {loading && !health ? "loading" : status}
        </div>
        <div
          className="mt-0.5 line-clamp-2 text-xs text-muted-foreground"
          title={health?.message}
        >
          {health?.message ??
            (healthy
              ? "Connected and returning fresh public activity."
              : "Waiting for the source to respond.")}
        </div>
      </div>
    </div>
  );
}

function ModuleCard({ module, now }: { module: SupabaseModuleActivity; now: number }) {
  const fresh = freshness(module.lastSeen, now);
  const attention = moduleNeedsAttention(module, now);
  const freshnessLabel = {
    ok: "live",
    amber: "stale",
    red: "offline",
    never: "not started",
  }[fresh];
  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="truncate text-base">{module.name}</CardTitle>
            <CardDescription className="mt-1 flex flex-wrap items-center gap-1.5 font-mono text-[11px]">
              <span>{module.id}</span>
              <span aria-hidden="true">·</span>
              <span>
                {module.contractVersion === null
                  ? "contract unknown"
                  : `contract v${module.contractVersion}`}
              </span>
            </CardDescription>
          </div>
          <Badge
            variant="outline"
            className={cn(
              attention ? "border-urgency/50 text-urgency" : "border-ok/40 text-ok",
            )}
          >
            {module.enabled ? freshnessLabel : "disabled"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="grid grid-cols-4 gap-2 px-4">
        <SmallStat label="Signals" value={module.signalCount ?? "—"} />
        <SmallStat label="Tables" value={module.declaredTables.length} />
        <SmallStat label="Queued" value={module.queueDepth} />
        <SmallStat label="Seen" value={formatAgo(module.lastSeen, now)} />
      </CardContent>
      {(module.queueDepth > 0 || module.queueDeadLetters > 0) && (
        <div className="mx-4 rounded-md border border-urgency/30 bg-urgency/5 px-3 py-2 text-xs">
          <div className="font-medium text-urgency">
            {module.queueDepth > 0
              ? `${module.queueDepth} signal${module.queueDepth === 1 ? "" : "s"} waiting`
              : "Queue drained"}
            {module.queueDeadLetters > 0
              ? ` · ${module.queueDeadLetters} need inspection`
              : ""}
          </div>
          <div
            className="mt-0.5 line-clamp-2 text-muted-foreground"
            title={module.queueLastError ?? undefined}
          >
            {module.queueOldestAt
              ? `Oldest queued ${formatAgo(module.queueOldestAt, now)}`
              : "No queued timestamp"}
            {module.queueLastError ? ` · ${module.queueLastError}` : ""}
          </div>
        </div>
      )}
    </Card>
  );
}

function SmallStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md bg-muted/60 px-2.5 py-2">
      <div className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </div>
      <div className="mt-0.5 truncate text-sm font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function CheckBadge({ checks }: { checks: CheckSummary }) {
  const label =
    checks.state === "success"
      ? `${checks.passed} checks passed`
      : checks.state === "failure"
        ? `${checks.failed} failed`
        : checks.state === "pending"
          ? `${checks.pending} pending`
          : "checks unavailable";
  return (
    <Badge
      variant="outline"
      className={cn(
        checks.state === "success" && "border-ok/40 text-ok",
        checks.state === "failure" && "border-destructive/40 text-destructive",
        checks.state === "pending" && "border-urgency/50 text-urgency",
        checks.state === "unknown" && "text-muted-foreground",
      )}
    >
      {label}
    </Badge>
  );
}

function PullRequestPanel({
  pullRequests,
}: {
  pullRequests: GitHubPullRequestActivity[];
}) {
  return (
    <Card className="gap-0 py-0">
      <CardHeader className="border-b py-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <GitPullRequest className="size-4" /> Pull requests
        </CardTitle>
        <CardDescription>Open work and recently landed changes</CardDescription>
      </CardHeader>
      <CardContent className="divide-y px-0">
        {pullRequests.map((pull) => (
          <a
            key={pull.number}
            href={pull.url}
            target="_blank"
            rel="noreferrer"
            className="flex items-start justify-between gap-4 px-4 py-3 transition-colors hover:bg-muted/50"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Badge variant="secondary">#{pull.number}</Badge>
                <span className="truncate text-sm font-medium">{pull.title}</span>
              </div>
              <div className="mt-1 truncate text-xs text-muted-foreground">
                {pull.author} · {pull.branch} · updated {formatAgo(pull.updatedAt)}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Badge variant="outline" className="capitalize">
                {pull.draft ? "draft" : pull.state}
              </Badge>
              <CheckBadge checks={pull.checks} />
              <ExternalLink className="size-3.5 text-muted-foreground" />
            </div>
          </a>
        ))}
        {pullRequests.length === 0 && <EmptyState label="No pull requests match the filters." />}
      </CardContent>
    </Card>
  );
}

function CommitPanel({ commits }: { commits: GitHubActivity["commits"] }) {
  return (
    <Card className="gap-0 py-0">
      <CardHeader className="border-b py-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <GitCommitHorizontal className="size-4" /> Recent commits
        </CardTitle>
        <CardDescription>Newest changes on the default branch</CardDescription>
      </CardHeader>
      <CardContent className="divide-y px-0">
        {commits.map((commit) => (
          <a
            key={commit.sha}
            href={commit.url}
            target="_blank"
            rel="noreferrer"
            className="flex gap-3 px-4 py-3 transition-colors hover:bg-muted/50"
          >
            <span className="mt-1 size-2 shrink-0 rounded-full bg-ok" />
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{commit.message}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {commit.author} · {commit.sha.slice(0, 7)} · {formatAgo(commit.committedAt)}
              </div>
            </div>
          </a>
        ))}
        {commits.length === 0 && <EmptyState label="No commits match the filters." />}
      </CardContent>
    </Card>
  );
}

function RecentSignalsPanel({
  signals,
  loading,
  loadingMore,
  hasMore,
  stale,
  error,
  onLoadMore,
  onRefresh,
}: {
  signals: SupabaseActivity["recentSignals"];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  stale: boolean;
  error: string | null;
  onLoadMore: () => Promise<void>;
  onRefresh: () => Promise<void>;
}) {
  return (
    <Card className="gap-0 py-0">
      <CardHeader className="border-b py-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <Database className="size-4" /> Shared signal history
        </CardTitle>
        <CardDescription>
          Stable newest-first pages from the database
          {stale ? " · showing last-known rows" : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        {error && (
          <div className="mx-4 mt-4 flex items-center justify-between gap-3 rounded-md border border-urgency/40 bg-urgency/5 px-3 py-2 text-xs">
            <span className="line-clamp-2 text-urgency">{error}</span>
            <Button variant="outline" size="sm" onClick={() => void onRefresh()}>
              Retry
            </Button>
          </div>
        )}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">Signal</TableHead>
              <TableHead>Module</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="pr-4 text-right">Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {signals.map((signal) => (
              <TableRow key={signal.id}>
                <TableCell className="max-w-[420px] truncate pl-4 font-medium">
                  {signal.title}
                </TableCell>
                <TableCell className="font-mono text-xs">{signal.moduleId}</TableCell>
                <TableCell>{signal.signalType}</TableCell>
                <TableCell>
                  <Badge variant="outline">{signal.verification}</Badge>
                </TableCell>
                <TableCell className="pr-4 text-right text-muted-foreground">
                  {formatAgo(signal.createdAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {signals.length === 0 && !loading && (
          <EmptyState label="No signals match the filters." />
        )}
        {loading && signals.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            Loading signal history…
          </div>
        )}
        {signals.length > 0 && (
          <div className="flex items-center justify-between border-t px-4 py-3">
            <span className="text-xs text-muted-foreground">
              {signals.length} row{signals.length === 1 ? "" : "s"} loaded
            </span>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => void onRefresh()}>
                Refresh newest
              </Button>
              {hasMore && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={loadingMore}
                  onClick={() => void onLoadMore()}
                >
                  {loadingMore ? "Loading…" : "Load older"}
                </Button>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TableExplorer({ tables }: { tables: SupabaseActivity["tables"] }) {
  return (
    <Card className="gap-0 py-0">
      <CardHeader className="border-b py-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <FileJson2 className="size-4" /> Module data explorer
        </CardTitle>
        <CardDescription>
          Read-only counts and bounded previews from manifest-declared public tables
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 p-4 lg:grid-cols-2">
        {tables.map((table) => (
          <details key={table.physicalName} className="rounded-lg border bg-background">
            <summary className="cursor-pointer list-none px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-medium">{table.logicalName}</div>
                  <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                    {table.physicalName}
                  </div>
                </div>
                <Badge variant={table.error ? "destructive" : "secondary"}>
                  {table.error ? "unavailable" : `${table.count ?? "—"} rows`}
                </Badge>
              </div>
            </summary>
            <div className="border-t px-3 py-3">
              {table.error && <p className="mb-2 text-xs text-destructive">{table.error}</p>}
              <div className="space-y-2">
                {table.rows.map((row, index) => (
                  <pre
                    key={String(row.id ?? index)}
                    className="max-h-64 overflow-auto rounded-md bg-muted p-3 text-[11px] leading-relaxed"
                  >
                    {JSON.stringify(row, null, 2)}
                  </pre>
                ))}
                {!table.error && table.rows.length === 0 && (
                  <p className="text-xs text-muted-foreground">Table is currently empty.</p>
                )}
              </div>
            </div>
          </details>
        ))}
        {tables.length === 0 && <EmptyState label="No declared tables match the filters." />}
      </CardContent>
    </Card>
  );
}

function MediaPanel({ media }: { media: SupabaseActivity["recentMedia"] }) {
  return (
    <Card className="gap-0 py-0">
      <CardHeader className="border-b py-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <ImageIcon className="size-4" /> Public media activity
        </CardTitle>
        <CardDescription>Recent objects listed from each registered module prefix</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2 p-4 sm:grid-cols-2 xl:grid-cols-3">
        {media.map((item) => (
          <a
            key={`${item.moduleId}/${item.name}`}
            href={item.publicUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors hover:bg-muted/50"
          >
            <ImageIcon className="size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{item.name}</div>
              <div className="text-xs text-muted-foreground">
                {item.moduleId} · {item.createdAt ? formatAgo(item.createdAt) : "time unknown"}
              </div>
            </div>
            <ExternalLink className="ml-auto size-3.5 shrink-0 text-muted-foreground" />
          </a>
        ))}
        {media.length === 0 && <EmptyState label="No public media matches the filters." />}
      </CardContent>
    </Card>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="col-span-full flex items-center gap-2 px-4 py-8 text-sm text-muted-foreground">
      <Clock3 className="size-4" />
      {label}
    </div>
  );
}
