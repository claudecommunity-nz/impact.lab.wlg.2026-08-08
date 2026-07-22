// React is a type-only dependency here (no runtime import).
import type { ComponentType } from "react";
import { z } from "zod";
import type { Signal } from "./signal";

/** Contribution to the SHARED map (modules never own a map instance). */
export interface MapLayerConfig {
  /** Which of this module's signal_type values to plot. */
  signalTypes: string[];
  /** "severity" (colour by the signal's severity) or a fixed design-token colour name. */
  color: string;
}

/** A lazy import of a default-exported React page component. */
export type PageImport = () => Promise<{ default: ComponentType }>;

/**
 * An extra page in a module's sub-navigation (beyond the index `ui`). Mounted at
 * /modules/<id>/<slug> and shown as a sub-item under the module's tile.
 */
export interface ModulePage {
  /** URL segment under the module, kebab-case, e.g. "triage". */
  slug: string;
  /** Nav label. */
  name: string;
  /** Optional lucide icon name for the sub-nav item. */
  icon?: string;
  /** Lazy import of the page component. */
  ui: PageImport;
}

/**
 * The module manifest — the default export of every modules/<id>/module.config.ts.
 * Created via defineModule() from @wcc-impact/plugin-sdk (PLAN §4.2).
 *
 * @example
 * import { defineModule } from "@wcc-impact/plugin-sdk";
 * export default defineModule({
 *   id: "team-outage-watch",          // = folder name; used as module_id + storage prefix
 *   name: "Outage Watch",
 *   icon: "radio-tower",              // a lucide icon name (see MODULE_ICON_NAMES)
 *   description: "Detects telco outages from public status feeds",
 *   ui: () => import("./ui"),          // optional index page — omit for data-only modules
 *   pages: [                            // optional extra pages -> sub-navigation
 *     { slug: "map", name: "Map", ui: () => import("./pages/map") },
 *   ],
 *   mapLayer: { signalTypes: ["outage"], color: "severity" },
 *   feedCard: "default",
 * });
 */
export interface ModuleManifest {
  /** Folder name under modules/; used as module_id on signals and as the storage prefix. */
  id: string;
  name: string;
  /** A lucide icon name (kebab-case, e.g. "radio-tower") shown on the dashboard
   *  tile. See MODULE_ICON_NAMES for the curated set; unknown names fall back
   *  to a neutral box. */
  icon: string;
  description: string;
  /** Lazy import of the module's index page (mounted at /modules/<id>). Omit for data-only modules. */
  ui?: PageImport;
  /** Extra pages -> a sub-navigation under the module's tile (mounted at /modules/<id>/<slug>). */
  pages?: ModulePage[];
  mapLayer?: MapLayerConfig;
  /** "default" for the standard feed card, or a custom renderer for this module's signals. */
  feedCard?: "default" | ComponentType<{ signal: Signal }>;
}

/**
 * Runtime validator for manifests — used by scripts/gen-registry.ts so a bad
 * manifest fails `pnpm gen` with a readable error instead of breaking the build.
 * The ModuleManifest interface above stays the canonical TS type.
 */
export const moduleManifestSchema = z.object({
  id: z
    .string()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "id must be kebab-case and match the folder name"),
  name: z.string().min(1).max(60),
  icon: z.string().min(1).max(40), // a lucide icon name (kebab-case)
  description: z.string().min(1).max(300),
  ui: z.custom<ModuleManifest["ui"]>((v) => v === undefined || typeof v === "function").optional(),
  pages: z
    .array(
      z.object({
        slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "page slug must be kebab-case"),
        name: z.string().min(1).max(40),
        icon: z.string().min(1).max(40).optional(),
        ui: z.custom<PageImport>((v) => typeof v === "function"),
      }),
    )
    .optional(),
  mapLayer: z
    .object({ signalTypes: z.array(z.string().min(1)).min(1), color: z.string().min(1) })
    .optional(),
  feedCard: z
    .custom<NonNullable<ModuleManifest["feedCard"]>>(
      (v) => v === undefined || v === "default" || typeof v === "function",
    )
    .optional(),
});

/** One entry in the generated registry (apps/dashboard/registry.gen.ts). */
export interface ModuleRegistryEntry extends ModuleManifest {
  /** True when the manifest declared a ui() import. */
  hasUi: boolean;
}

/**
 * One row in the `modules` table — the runtime registry (PLAN §7.1).
 * `enabled` is the ORGANISER KILL-SWITCH: only the service role can change it
 * (flipped in Supabase Studio). Client upserts must never include it.
 */
export interface ModuleRow {
  id: string;
  name: string;
  icon: string | null;
  description: string | null;
  enabled: boolean;
  /** ISO 8601 — last loader heartbeat. */
  last_seen: string | null;
  /** ISO 8601 — maintained by a DB trigger. */
  updated_at: string;
}
