"use client";

import { useMemo } from "react";
import {
  Card,
  CardContent,
  SignalFeed,
  SignalMap,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  useSignals,
} from "@wcc-impact/plugin-sdk";

const MODULE_ID = "demo-seed";

/**
 * demo-seed sub-page (/modules/demo-seed/scenario) — the live earthquake data
 * this module seeded, on the shared map + feed. Demonstrates a module having a
 * sub-navigation, not just one page.
 */
export default function ScenarioPage() {
  const { signals } = useSignals({ moduleId: MODULE_ID });

  const byType = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of signals) m.set(s.signal_type, (m.get(s.signal_type) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [signals]);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Everything below is real data this module wrote to the shared{" "}
        <code className="rounded bg-muted px-1 py-0.5 text-xs">signals</code> table — the M6.5
        Wellington earthquake scenario, filtered to this module.
      </p>
      <Tabs defaultValue="map" className="flex flex-col gap-3">
        <TabsList>
          <TabsTrigger value="map">Map</TabsTrigger>
          <TabsTrigger value="feed">Feed</TabsTrigger>
          <TabsTrigger value="types">By type</TabsTrigger>
        </TabsList>
        <TabsContent value="map">
          <div className="h-[480px] overflow-hidden rounded-lg border border-border">
            <SignalMap filter={{ moduleId: MODULE_ID }} className="h-full w-full" />
          </div>
        </TabsContent>
        <TabsContent value="feed">
          <Card className="max-h-[480px] overflow-y-auto py-0">
            <CardContent className="p-3">
              <SignalFeed filter={{ moduleId: MODULE_ID }} limit={60} />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="types">
          <Card>
            <CardContent className="flex flex-col gap-2 py-4">
              {byType.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No signals yet — run the loader to seed the scenario.
                </p>
              )}
              {byType.map(([type, n]) => (
                <div key={type} className="flex items-center gap-3">
                  <span className="w-44 shrink-0 text-sm text-foreground">{type}</span>
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <span
                      className="block h-full rounded-full bg-primary"
                      style={{ width: `${(n / (byType[0]?.[1] ?? 1)) * 100}%` }}
                    />
                  </span>
                  <span className="w-10 text-right text-xs text-muted-foreground tabular-nums">
                    {n}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
