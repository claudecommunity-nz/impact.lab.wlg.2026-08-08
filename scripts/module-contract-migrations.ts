import { CURRENT_MODULE_CONTRACT_VERSION } from "../packages/shared/src/contract-version";

export interface ModuleContractMigrationResult {
  source: string;
  from: number;
  to: number;
  changed: boolean;
}

export interface ModuleContractMigrationArgs {
  moduleIds: string[];
  target: number;
}

/** Parse the CLI shape without dropping the first id when `--to` is absent. */
export function parseModuleContractMigrationArgs(
  args: string[],
): ModuleContractMigrationArgs {
  const toIndexes = args
    .map((value, index) => (value === "--to" ? index : -1))
    .filter((index) => index >= 0);
  if (toIndexes.length > 1) throw new Error("provide --to at most once");

  const toIndex = toIndexes[0] ?? -1;
  const target =
    toIndex === -1
      ? CURRENT_MODULE_CONTRACT_VERSION
      : Number(args[toIndex + 1]);
  const moduleIds = args.filter(
    (value, index) =>
      value !== "--to" && (toIndex === -1 || index !== toIndex + 1),
  );
  if (
    moduleIds.length === 0 ||
    (toIndex !== -1 && (!args[toIndex + 1] || !Number.isInteger(target)))
  ) {
    throw new Error("at least one module id and a valid integer --to value are required");
  }
  return { moduleIds, target };
}

/** A missing property is the pre-versioning legacy contract (v0). */
export function detectModuleContractVersion(source: string): number {
  const match = source.match(/\bcontractVersion\s*:\s*(\d+)\b/);
  return match ? Number(match[1]) : 0;
}

const migrations = new Map<number, (source: string) => string>([
  [
    0,
    (source) => {
      const marker = /defineModule\(\{\s*\n/;
      if (!marker.test(source)) {
        throw new Error(
          "could not find `defineModule({` in module.config.ts; add `contractVersion: 1` manually",
        );
      }
      return source.replace(
        marker,
        (value) =>
          `${value}  contractVersion: 1, // migrated from the legacy unversioned contract\n`,
      );
    },
  ],
]);

/**
 * Apply registered one-version-at-a-time source migrations.
 * Future breaking contracts add one transform keyed by their previous version.
 */
export function migrateModuleContractSource(
  source: string,
  target = CURRENT_MODULE_CONTRACT_VERSION,
): ModuleContractMigrationResult {
  const from = detectModuleContractVersion(source);
  if (!Number.isInteger(target) || target < 1) {
    throw new Error(`target contract version must be a positive integer (got ${target})`);
  }
  if (from > target) {
    throw new Error(
      `module contract v${from} is newer than requested target v${target}; downgrades are not automatic`,
    );
  }

  let version = from;
  let next = source;
  while (version < target) {
    const migrate = migrations.get(version);
    if (!migrate) {
      throw new Error(
        `no automatic module contract migration exists from v${version} to v${version + 1}; ` +
          "see docs/module-contract-versioning.md",
      );
    }
    next = migrate(next);
    version += 1;
  }
  return { source: next, from, to: version, changed: next !== source };
}
