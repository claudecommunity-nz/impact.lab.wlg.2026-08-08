/**
 * new-module — scaffold a compliant team module from modules/_template
 * (PLAN §12.1 step 4: this is how a team goes from zero to first signal).
 *
 * Copies _template to modules/<id>/ and rewrites the placeholders:
 *   __MODULE_ID__        → <id>            (manifest, UI, loader, README)
 *   __MODULE_NAME__      → "Nice Name"     (derived from the id)
 *   @modules/template    → @modules/<id>   (package.json)
 *   template-loader      → <id>-loader     (loader/pyproject.toml)
 *
 * @example
 *   pnpm new-module team-outage-watch
 */
import { cpSync, existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TEMPLATE_DIR = path.join(ROOT, "modules", "_template");

/** "team-outage-watch" → "Outage Watch" (a starting point — teams rename freely). */
function displayName(id: string): string {
  return id
    .replace(/^team-/, "")
    .split("-")
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join(" ");
}

/** Recursively list every file under dir (absolute paths). */
function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const abs = path.join(dir, entry.name);
    return entry.isDirectory() ? listFiles(abs) : [abs];
  });
}

function die(message: string): never {
  console.error(`new-module ERROR: ${message}`);
  console.error("Usage: pnpm new-module team-<name>   (kebab-case, e.g. team-outage-watch)");
  process.exit(1);
}

const id = process.argv[2];
if (!id) die("missing module id");
// Same rule as moduleManifestSchema: the id is the folder name, the module_id
// on every signal, and the storage prefix — kebab-case only.
if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) die(`"${id}" is not kebab-case (lowercase letters and digits in hyphen-separated groups, e.g. team-outage-watch; no leading, trailing, or doubled hyphens)`);
if (id.length > 50) die(`"${id}" is too long (max 50 chars)`);
if (!existsSync(TEMPLATE_DIR)) die("modules/_template is missing — is the repo intact?");

const targetDir = path.join(ROOT, "modules", id);
if (existsSync(targetDir)) die(`modules/${id}/ already exists`);
if (!id.startsWith("team-")) {
  console.warn(`new-module: heads-up — event convention is team-<name> (you passed "${id}"); continuing anyway.`);
}

// 1. Copy the template (skip junk that should never be scaffolded).
cpSync(TEMPLATE_DIR, targetDir, {
  recursive: true,
  filter: (src) => !/(node_modules|__pycache__|\.venv|\.DS_Store)$/.test(src),
});

// 2. Rewrite placeholders in every copied text file.
const name = displayName(id);
const replacements: [string | RegExp, string][] = [
  [/__MODULE_ID__/g, id],
  [/__MODULE_NAME__/g, name],
  [/@modules\/template/g, `@modules/${id}`],
  [/template-loader/g, `${id}-loader`],
];
for (const file of listFiles(targetDir)) {
  const before = readFileSync(file, "utf8");
  let after = before;
  for (const [from, to] of replacements) after = after.replaceAll(from, to);
  if (after !== before) writeFileSync(file, after);
}

// 3. Print the golden path (quickstart §12.1 steps 5-7).
console.log(`
Created modules/${id}/  ("${name}")

Next steps:
  1. uv sync
  2. uv run --directory modules/${id}/loader --package ${id}-loader python -m src.main
       → registers "${id}" and publishes your first signal (watch the big screen!)
  3. pnpm install && pnpm dev
       → your tile + page at http://localhost:3000/modules/${id}

Then make it yours:
  - modules/${id}/module.config.ts   name, icon, description, problem (1-5), mapLayer
  - modules/${id}/loader/src/main.py replace tick() with real data → publish_signal()
  - modules/${id}/ui/index.tsx       your page, built on @wcc-impact/plugin-sdk
  - modules/${id}/README.md          the handover doc — fill it in before 16:00 submission
`);
