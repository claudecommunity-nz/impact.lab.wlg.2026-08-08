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
  type ModuleSignalTypeCount,
  type SignalAggregates,
  type SignalCursor,
  type SignalPage,
} from "./aggregate";

export {
  CURRENT_MODULE_CONTRACT_VERSION,
  SUPPORTED_MODULE_CONTRACT_VERSIONS,
  assertSupportedModuleContractVersion,
  moduleContractCompatibilityError,
  type ModuleContractVersion,
} from "./contract-version";

export {
  moduleManifestSchema,
  moduleTablePrefix,
  moduleTableName,
  type HomeStatConfig,
  type ModuleManifest,
  type ModulePage,
  type ModuleWidget,
  type ModuleRegistryEntry,
  type ModuleRow,
  type WidgetDisplayMode,
  type WidgetImport,
  type WidgetProps,
  type WidgetSize,
} from "./module";
