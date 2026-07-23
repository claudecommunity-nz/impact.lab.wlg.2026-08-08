import type { ModuleManifest } from "@wcc-impact/shared";

/**
 * Typed manifest helper — an identity function that gives autocomplete and
 * type-checking on module.config.ts (CONTRACTS.md §8). Runtime validation
 * happens at `pnpm gen` time via moduleManifestSchema.
 *
 * @example
 * import { defineModule } from "@wcc-impact/plugin-sdk";
 * export default defineModule({
 *   id: "team-outage-watch",        // must equal the folder name under modules/
 *   name: "Outage Watch",
 *   icon: "radio-tower",
 *   description: "Detects telco outages from public status feeds",
 *   ui: () => import("./ui"),       // optional — omit for data-only modules
 *   homeStat: { label: "Outages tracked", signalType: "outage" },
 * });
 */
export function defineModule(config: ModuleManifest): ModuleManifest {
  return config;
}
