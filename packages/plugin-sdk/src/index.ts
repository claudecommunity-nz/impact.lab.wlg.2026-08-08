/**
 * @wcc-impact/plugin-sdk — the ONLY package module UIs may import (plus React).
 * Full contract: docs/CONTRACTS.md §6. Small on purpose; frozen for the event.
 *
 * Quick tour:
 *
 * @example
 * "use client";
 * import {
 *   useSignals, SignalMap, SignalFeed, FileUpload, useUser, SignIn,
 * } from "@wcc-impact/plugin-sdk";
 *
 * export default function MyModulePage() {
 *   const { signals, loading } = useSignals({ moduleId: "team-x" });
 *   return (
 *     <div className="flex flex-col gap-4">
 *       <SignalMap filter={{ moduleId: "team-x" }} />
 *       <FileUpload moduleId="team-x" onUploaded={(url) => console.log(url)} />
 *       <SignalFeed signals={signals} limit={20} />
 *     </div>
 *   );
 * }
 *
 * Rules (CONTRACTS.md §10): never import dashboard internals, never open your
 * own realtime channel (SignalProvider owns the one subscription), style with
 * the WCC-branded shadcn tokens only (bg-card, text-muted-foreground,
 * bg-primary, bg-severity-severe, ...) — the SDK re-exports the shadcn kit
 * below so `import { Button, Card, Badge } from "@wcc-impact/plugin-sdk"` just works.
 */

// Manifest helper (module.config.ts)
export { defineModule } from "./define-module";

// The signal store: ONE realtime subscription (mounted by the dashboard shell),
// consumed everywhere via context with client-side filtering.
export { SignalProvider } from "./provider";
export {
  useSignals,
  useSignalAggregates,
  useModules,
  type SignalFilter,
} from "./use-signals";
export {
  fetchSignalPage,
  useSignalHistory,
  type FetchSignalPageOptions,
  type SignalHistoryFilter,
  type SignalHistoryState,
} from "./history";
export {
  normalizeSignalAggregates,
  type AggregateState,
} from "./aggregates";

// Module-owned tables (public.m_<id>_<table>): live reads via the same ONE
// channel + a write accessor. Backed by modules/<id>/backend/schema.sql.
export { useModuleTable, moduleTable } from "./use-module-table";
export { type ModuleTableRow } from "./context";

// Call a module's edge function (deployed as <id>-<name>) — the public write
// path for actions the read-only dashboard can't do directly.
export { invokeModuleFunction } from "./functions";

// Auth (optional — for concepts needing identity, e.g. triage verification)
export { useUser, SignIn } from "./auth";

// Shared map + standardised feed rendering
export { SignalMap } from "./map";
export { SignalFeed, SignalCard } from "./feed";

// Files (shared public-read `media` bucket, scoped to media/<moduleId>/)
export { FileUpload, FileGallery, uploadFile } from "./files";

// Design tokens, JS side (CSS side: `@import "@wcc-impact/ui/tokens.css"` — already
// done once in the dashboard's globals.css; modules never import CSS).
export { SEVERITY_COLORS, severityColor, cn, ModuleIcon } from "@wcc-impact/ui";

// WCC-branded shadcn/ui component kit — the one place teams get UI primitives.
export {
  Button,
  buttonVariants,
  Badge,
  badgeVariants,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardAction,
  CardContent,
  CardFooter,
  Input,
  Label,
  Separator,
  Skeleton,
  Toaster,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
  ScrollArea,
  ScrollBar,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@wcc-impact/ui";

// Re-exported @wcc-impact/shared types — everything a module UI needs to type its code.
export {
  SOURCE_TYPES,
  SEVERITIES,
  VERIFICATIONS,
  signalSchema,
  moduleManifestSchema,
  moduleTablePrefix,
  moduleTableName,
  type SourceType,
  type Severity,
  type Verification,
  type Signal,
  type SignalRow,
  type SignalAggregates,
  type SignalCursor,
  type SignalPage,
  type ModuleManifest,
  type ModuleRegistryEntry,
  type ModuleRow,
} from "@wcc-impact/shared";
