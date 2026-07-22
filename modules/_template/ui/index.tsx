"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  SignalFeed,
  Skeleton,
  useSignals,
} from "@wcc-impact/plugin-sdk";

/** This module's id — must match module.config.ts and the folder name. */
const MODULE_ID = "__MODULE_ID__";

/**
 * __MODULE_NAME__ — this module's page, mounted at /modules/__MODULE_ID__ inside
 * the core shell (nav, theming, auth context, and error boundary come for free).
 *
 * The SDK idiom on show here (the rules in CONTRACTS §6):
 * - useSignals({ moduleId }) reads this module's signals from the ONE shared
 *   realtime store — modules never open their own Supabase channels.
 * - <SignalFeed> renders them with the standard cards (newest first).
 * - Build from the WCC-branded shadcn kit re-exported by the SDK — <Card>,
 *   <Button>, <Badge>, <Skeleton> — and its tokens (bg-card, text-foreground,
 *   text-muted-foreground, bg-primary...) so ten teams' pages feel like one
 *   product at demo time. See the plugin-sdk skill for the full surface.
 * - Import only from "@wcc-impact/plugin-sdk" and "react" — never dashboard
 *   internals (a scaffolded module declares only those two deps).
 *
 * @example the dashboard mounts this via the manifest's `ui: () => import("./ui")`
 */
export default function ModulePage() {
  const { signals, loading, error } = useSignals({ moduleId: MODULE_ID });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">👋 __MODULE_NAME__</CardTitle>
        <CardDescription>
          {loading
            ? "Loading signals…"
            : error
              ? `Signal store error: ${error}`
              : `${signals.length} signal${signals.length === 1 ? "" : "s"} from this module — start the loader to publish more.`}
        </CardDescription>
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : (
          // Same shared store, standard rendering. Swap/extend this with
          // SignalMap, FileUpload, etc. — see the plugin-sdk skill for the
          // full surface.
          <SignalFeed filter={{ moduleId: MODULE_ID }} limit={20} />
        )}
      </CardContent>
    </Card>
  );
}
