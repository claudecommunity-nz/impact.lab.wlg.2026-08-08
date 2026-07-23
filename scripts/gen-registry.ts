/**
 * gen-registry — build-time module discovery (PLAN §3.2, CONTRACTS §9).
 *
 * Globs modules/<dir>/module.config.ts (skipping _template), validates every
 * manifest with moduleManifestSchema, and writes apps/dashboard/registry.gen.ts.
 * The output is GITIGNORED and regenerated on every dev/build/CI run — never
 * commit or hand-edit it. A bad manifest fails this script with a one-line
 * error naming the file and field, so `pnpm gen` is the first CI gate.
 *
 * @example
 *   pnpm gen                     # normal run (also runs before dev/build/typecheck)
 *   pnpm gen --exclude team-x    # emergency build-time exclusion (repeatable)
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Relative import rather than "@wcc-impact/shared": the root package deliberately has
// no workspace dependencies, and tsx resolves zod from packages/shared itself.
import { moduleContractCompatibilityError } from "../packages/shared/src/contract-version";
import { moduleManifestSchema, type ModuleManifest } from "../packages/shared/src/module";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MODULES_DIR = path.join(ROOT, "modules");
const OUT_FILE = path.join(ROOT, "apps", "dashboard", "registry.gen.ts");

/** Parse repeated `--exclude <id>` flags (CONTRACTS §9 emergency exclusion). */
function parseExcludes(argv: string[]): Set<string> {
  const excludes = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--exclude") {
      const id = argv[i + 1];
      if (!id || id.startsWith("--")) {
        console.error("gen-registry ERROR: --exclude requires a module id, e.g. --exclude team-x");
        process.exit(1);
      }
      excludes.add(id);
      i++;
    }
  }
  return excludes;
}

async function main(): Promise<void> {
  const exclude = parseExcludes(process.argv.slice(2));

  // Discover module folders. `_`-prefixed folders (i.e. _template) are the
  // scaffold source, not real modules — always skipped.
  const dirs = existsSync(MODULES_DIR)
    ? readdirSync(MODULES_DIR, { withFileTypes: true })
        .filter((d) => d.isDirectory() && !d.name.startsWith("_") && !d.name.startsWith("."))
        .map((d) => d.name)
        .sort()
    : [];

  for (const id of exclude) {
    if (!dirs.includes(id)) console.warn(`gen-registry: --exclude ${id} matches no module folder`);
  }

  const errors: string[] = [];
  const entries: { id: string; hasUi: boolean }[] = [];

  for (const dir of dirs) {
    const rel = `modules/${dir}/module.config.ts`;
    const abs = path.join(MODULES_DIR, dir, "module.config.ts");

    if (!existsSync(abs)) {
      console.warn(`gen-registry: skipping modules/${dir}/ (no module.config.ts)`);
      continue;
    }
    if (exclude.has(dir)) {
      console.warn(`gen-registry: EXCLUDED modules/${dir}/ (--exclude)`);
      continue;
    }

    // Import the manifest (tsx executes the TS directly; defineModule is identity).
    let manifest: ModuleManifest | undefined;
    try {
      const mod = await import(pathToFileURL(abs).href);
      manifest = mod.default;
    } catch (err) {
      // Keep it one line — import errors (e.g. a typo in the config) can be multi-line.
      const msg = (err instanceof Error ? err.message : String(err)).split("\n")[0];
      errors.push(`${rel}: failed to import — ${msg}`);
      continue;
    }
    if (!manifest || typeof manifest !== "object") {
      errors.push(`${rel}: field "default export" — expected \`export default defineModule({...})\``);
      continue;
    }
    if (!("contractVersion" in manifest)) {
      errors.push(
        `${rel}: field "contractVersion" — missing legacy contract version. ` +
          `Run \`pnpm migrate-module-contract ${dir}\`, then review ` +
          "docs/module-contract-versioning.md",
      );
      continue;
    }

    const parsed = moduleManifestSchema.safeParse(manifest);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const field = issue && issue.path.length ? issue.path.join(".") : "(manifest)";
      errors.push(`${rel}: field "${field}" — ${issue?.message ?? "invalid manifest"}`);
      continue;
    }
    const compatibilityError = moduleContractCompatibilityError(
      parsed.data.contractVersion,
    );
    if (compatibilityError) {
      errors.push(
        `${rel}: field "contractVersion" — ${compatibilityError.replace(
          "<module-id>",
          dir,
        )}`,
      );
      continue;
    }
    if (manifest.id !== dir) {
      errors.push(`${rel}: field "id" — must equal the folder name "${dir}" (got "${manifest.id}")`);
      continue;
    }

    entries.push({ id: dir, hasUi: typeof manifest.ui === "function" });
  }

  if (errors.length > 0) {
    for (const e of errors) console.error(`gen-registry ERROR: ${e}`);
    process.exit(1);
  }

  // Emit exactly the CONTRACTS §9 shape: static manifest imports (so each
  // module's `ui` stays a lazy import() boundary next/dynamic can code-split).
  const imports = entries
    .map((e, i) => `import m${i} from "@modules/${e.id}/module.config";`)
    .join("\n");
  const rows = entries.map((e, i) => `  { ...m${i}, hasUi: ${e.hasUi} },`).join("\n");
  const registryLines = rows
    ? ["const registry: ModuleRegistryEntry[] = [", rows, "];"]
    : ["const registry: ModuleRegistryEntry[] = [];"];
  const content = [
    "// generated — do not edit",
    'import type { ModuleRegistryEntry } from "@wcc-impact/shared";',
    ...(imports ? [imports] : []),
    "",
    ...registryLines,
    "",
    "export default registry;",
    "",
  ].join("\n");

  mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  const previous = existsSync(OUT_FILE) ? readFileSync(OUT_FILE, "utf8") : null;
  if (previous !== content) writeFileSync(OUT_FILE, content);

  const ids = entries.map((e) => e.id).join(", ") || "none";
  console.log(`gen-registry: ${entries.length} module(s) [${ids}] → apps/dashboard/registry.gen.ts`);
}

main().catch((err) => {
  console.error(`gen-registry ERROR: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
