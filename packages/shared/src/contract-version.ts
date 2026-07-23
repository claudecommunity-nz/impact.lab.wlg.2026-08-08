/** The newest module/SDK contract implemented by this platform build. */
export const CURRENT_MODULE_CONTRACT_VERSION = 1 as const;

/** Contract versions this platform can mount safely. */
export const SUPPORTED_MODULE_CONTRACT_VERSIONS = [1] as const;

export type ModuleContractVersion =
  (typeof SUPPORTED_MODULE_CONTRACT_VERSIONS)[number];

const versioningGuide = "docs/module-contract-versioning.md";

/** Null means compatible; otherwise an actionable registry-generation error. */
export function moduleContractCompatibilityError(version: number): string | null {
  const supported = SUPPORTED_MODULE_CONTRACT_VERSIONS as readonly number[];
  if (supported.includes(version)) return null;

  const supportedLabel = supported.map((item) => `v${item}`).join(", ");
  const migrationCommand = "pnpm migrate-module-contract <module-id>";
  if (version < Math.min(...supported)) {
    return (
      `contract v${version} is older than this platform supports (${supportedLabel}). ` +
      `Run \`${migrationCommand}\`, then review ${versioningGuide}`
    );
  }
  if (version > CURRENT_MODULE_CONTRACT_VERSION) {
    return (
      `contract v${version} is newer than this platform's current ` +
      `v${CURRENT_MODULE_CONTRACT_VERSION} (${supportedLabel} supported). ` +
      `Update the platform or pin this manifest to a supported version; ` +
      `see ${versioningGuide}`
    );
  }
  return (
    `contract v${version} is not supported by this platform (${supportedLabel}). ` +
    `Run \`${migrationCommand}\` or review ${versioningGuide}`
  );
}

export function assertSupportedModuleContractVersion(version: number): void {
  const error = moduleContractCompatibilityError(version);
  if (error) throw new Error(error);
}
