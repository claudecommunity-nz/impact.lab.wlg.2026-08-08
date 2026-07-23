/** CLI for explicit, reviewable module.config.ts contract migrations. */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { CURRENT_MODULE_CONTRACT_VERSION } from "../packages/shared/src/contract-version";
import {
  migrateModuleContractSource,
  parseModuleContractMigrationArgs,
} from "./module-contract-migrations";

function usage(): never {
  console.error(
    "Usage: pnpm migrate-module-contract <module-id> [<module-id> ...] " +
      `[--to ${CURRENT_MODULE_CONTRACT_VERSION}]`,
  );
  process.exit(1);
}

const args = process.argv.slice(2);
let parsed: ReturnType<typeof parseModuleContractMigrationArgs>;
try {
  parsed = parseModuleContractMigrationArgs(args);
} catch {
  usage();
}
const { moduleIds, target } = parsed;

const root = path.resolve(import.meta.dirname, "..");
for (const moduleId of moduleIds) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(moduleId)) {
    throw new Error(`invalid module id "${moduleId}"`);
  }
  const manifestPath = path.join(root, "modules", moduleId, "module.config.ts");
  if (!existsSync(manifestPath)) {
    throw new Error(`module manifest not found: modules/${moduleId}/module.config.ts`);
  }
  const source = readFileSync(manifestPath, "utf8");
  const result = migrateModuleContractSource(source, target);
  if (!result.changed) {
    console.log(`modules/${moduleId}: already at contract v${result.to}`);
    continue;
  }
  writeFileSync(manifestPath, result.source);
  console.log(
    `modules/${moduleId}: migrated contract v${result.from} → v${result.to}; ` +
      "review the diff and run pnpm gen",
  );
}
