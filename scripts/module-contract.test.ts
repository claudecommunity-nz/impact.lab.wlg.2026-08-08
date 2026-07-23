import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  CURRENT_MODULE_CONTRACT_VERSION,
  moduleContractCompatibilityError,
} from "../packages/shared/src/contract-version";
import { moduleManifestSchema } from "../packages/shared/src/module";
import {
  detectModuleContractVersion,
  migrateModuleContractSource,
  parseModuleContractMigrationArgs,
} from "./module-contract-migrations";

test("current manifest contract is accepted", () => {
  const parsed = moduleManifestSchema.safeParse({
    contractVersion: CURRENT_MODULE_CONTRACT_VERSION,
    id: "team-example",
    name: "Example",
    icon: "box",
    description: "Compatibility fixture",
  });
  assert.equal(parsed.success, true);
  assert.equal(
    moduleContractCompatibilityError(CURRENT_MODULE_CONTRACT_VERSION),
    null,
  );
});

test("future and legacy versions produce actionable messages", () => {
  assert.match(moduleContractCompatibilityError(0) ?? "", /migrate-module-contract/);
  assert.match(moduleContractCompatibilityError(2) ?? "", /newer than this platform/);
  assert.match(moduleContractCompatibilityError(2) ?? "", /module-contract-versioning/);
});

test("legacy unversioned source migrates explicitly to v1", () => {
  const legacy =
    'import { defineModule } from "@wcc-impact/plugin-sdk";\n' +
    "export default defineModule({\n  id: \"team-example\",\n});\n";
  const migrated = migrateModuleContractSource(legacy);
  assert.equal(migrated.from, 0);
  assert.equal(migrated.to, 1);
  assert.equal(migrated.changed, true);
  assert.equal(detectModuleContractVersion(migrated.source), 1);
  assert.match(migrated.source, /contractVersion: 1/);
  assert.equal(migrateModuleContractSource(migrated.source).changed, false);
});

test("migration CLI keeps module ids with and without an explicit target", () => {
  assert.deepEqual(parseModuleContractMigrationArgs(["demo-seed"]), {
    moduleIds: ["demo-seed"],
    target: CURRENT_MODULE_CONTRACT_VERSION,
  });
  assert.deepEqual(
    parseModuleContractMigrationArgs(["demo-seed", "newsroom", "--to", "1"]),
    {
      moduleIds: ["demo-seed", "newsroom"],
      target: 1,
    },
  );
  assert.throws(() => parseModuleContractMigrationArgs(["--to", "1"]));
});

test("template and every checked-in module pin the current literal version", () => {
  const root = path.resolve(import.meta.dirname, "..");
  const modulesDir = path.join(root, "modules");
  const directories = readdirSync(modulesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => name === "_template" || !name.startsWith("_"))
    .sort();
  assert.ok(directories.includes("_template"));
  for (const directory of directories) {
    const source = readFileSync(
      path.join(modulesDir, directory, "module.config.ts"),
      "utf8",
    );
    assert.equal(
      detectModuleContractVersion(source),
      CURRENT_MODULE_CONTRACT_VERSION,
      `${directory} must pin contractVersion: ${CURRENT_MODULE_CONTRACT_VERSION}`,
    );
  }
});

test("module credentials have no browser-exposed environment path", () => {
  const root = path.resolve(import.meta.dirname, "..");
  const browserSources = [
    "apps/dashboard/next.config.ts",
    "packages/plugin-sdk/src/client.ts",
    ".env.example",
  ].map((file) => readFileSync(path.join(root, file), "utf8"));

  for (const source of browserSources) {
    assert.doesNotMatch(source, /NEXT_PUBLIC_(?:MODULE|EVENT)_TOKEN/);
  }
  assert.match(browserSources[2] ?? "", /^MODULE_TOKEN=$/m);
  assert.match(browserSources[1] ?? "", /app_metadata\.module_id/);
});
