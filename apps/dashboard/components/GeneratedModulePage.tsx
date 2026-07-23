"use client";

import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
  SignalFeed,
  SignalMap,
  useSignals,
} from "@wcc-impact/plugin-sdk";

/**
 * The free page every data-only module gets (PLAN §4.3): a live map + feed
 * filtered to the module's own signals. Description and health render in the
 * shared module-page header (ModulePageClient), so this is just the data view.
 *
 * @example <GeneratedModulePage id="team-outage-watch" />
 */
export function GeneratedModulePage({ id }: { id: string }) {
  const { signals, loading } = useSignals({ moduleId: id });

  return (
    <div className="space-y-4 p-4 md:p-6">
      {loading ? (
        <Skeleton className="h-6 w-48" />
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="ops-kicker">Module operating picture</div>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Location and report detail from this module only.
            </p>
          </div>
          <Badge variant="secondary" className="text-xs font-medium tabular-nums">
            {signals.length} report{signals.length === 1 ? "" : "s"} recorded
          </Badge>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(340px,0.85fr)]">
        <Card className="ops-panel h-[58vh] min-h-[380px] gap-0 overflow-hidden rounded-lg py-0">
          <CardHeader className="ops-panel-header">
            <CardTitle className="text-sm font-semibold">Module map</CardTitle>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 p-0">
            <SignalMap filter={{ moduleId: id }} className="h-full w-full" />
          </CardContent>
        </Card>

        <Card className="ops-panel h-[58vh] min-h-[380px] gap-0 overflow-hidden rounded-lg py-0">
          <CardHeader className="ops-panel-header">
            <CardTitle className="text-sm font-semibold">Latest reports</CardTitle>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 p-0">
            <SignalFeed filter={{ moduleId: id }} className="h-full overflow-y-auto" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
