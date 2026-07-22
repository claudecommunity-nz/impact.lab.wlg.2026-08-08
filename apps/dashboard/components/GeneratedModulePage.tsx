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
    <div className="space-y-6 p-6 pt-0">
      {loading ? (
        <Skeleton className="h-6 w-48" />
      ) : (
        <Badge variant="secondary" className="text-xs font-medium">
          {signals.length} signal{signals.length === 1 ? "" : "s"} from this module
        </Badge>
      )}

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <Card className="h-[60vh] min-h-[400px] gap-0 overflow-hidden py-0">
          <CardHeader className="border-b py-4">
            <CardTitle className="text-base font-semibold">Map</CardTitle>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 p-0">
            <SignalMap filter={{ moduleId: id }} className="h-full w-full" />
          </CardContent>
        </Card>

        <Card className="h-[60vh] min-h-[400px] gap-0 overflow-hidden py-0">
          <CardHeader className="border-b py-4">
            <CardTitle className="text-base font-semibold">Feed</CardTitle>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 p-0">
            <SignalFeed filter={{ moduleId: id }} className="h-full overflow-y-auto" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
