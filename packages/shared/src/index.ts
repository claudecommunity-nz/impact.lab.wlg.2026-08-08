/**
 * @wcc-impact/shared — shared types for the WCC emergency hack.
 *
 * Signal types mirror /schema/signal.schema.json (the source of truth).
 * Manifest/registry/table-row types back the plugin system (PLAN §4).
 *
 * @example
 * import { signalSchema, type SignalRow, type ModuleManifest } from "@wcc-impact/shared";
 */
export {
  SOURCE_TYPES,
  SEVERITIES,
  VERIFICATIONS,
  signalSchema,
  type SourceType,
  type Severity,
  type Verification,
  type Signal,
  type SignalRow,
} from "./signal";

export {
  moduleManifestSchema,
  type MapLayerConfig,
  type ModuleManifest,
  type ModuleRegistryEntry,
  type ModuleRow,
} from "./module";
