---
name: create-module
description: Scaffold a new team module with pnpm new-module and fill in its manifest (module.config.ts) correctly. Use when creating a module, editing a manifest, or when pnpm gen rejects one.
---

# Create a module

```sh
pnpm new-module team-<name>
```

Scaffolds `modules/team-<name>/` from `modules/_template`:

```
modules/team-<name>/
├── module.config.ts        # the manifest — the only registration artefact
├── package.json            # name: @modules/team-<name>
├── ui/index.tsx            # optional React UI (default export)
├── loader/                 # Python ETL (uv workspace member)
│   ├── pyproject.toml      # package name: team-<name>-loader
│   └── src/main.py         # main() + sample() — see loader-patterns skill
└── README.md               # handover doc — fill the sections before 16:00
```

After scaffolding: `uv sync` (adds the loader to the workspace), then
`uv run --directory modules/team-<name>/loader --package team-<name>-loader python -m src.main`
to register + publish hello (the `--directory` flag matters — loaders run with
their own folder as the working directory).

## The manifest

The exact current fields and constraints are generated from the validator in
`docs/generated/manifest-reference.md`. The example below shows the common event-day path.

```ts
import { defineModule } from '@wcc-impact/plugin-sdk';

export default defineModule({
  contractVersion: 1,                  // pin the literal; do not import "current"
  id: 'team-outage-watch',            // MUST equal the folder name; kebab-case
  name: 'Outage Watch',               // <= 60 chars
  icon: 'radio-tower',                 // a lucide icon name (kebab-case)
  description: 'Detects telco outages from public status feeds',  // <= 300 chars
  ui: () => import('./ui'),            // optional — omit for data-only modules
  homeStat: {                          // optional — your number on the shared home view
    label: 'Outages tracked',
    signalType: 'outage',              // omit to count all your signals
  },
});
```

Workflow rules enforced around `pnpm gen` (`moduleManifestSchema` remains authoritative):

- `contractVersion` must be a supported numeric literal. The scaffold supplies the current
  value. If an older module is rejected, run
  `pnpm migrate-module-contract team-<name>` and review the diff. Compatibility and release
  policy: `docs/module-contract-versioning.md`.
- `id` matches `^[a-z0-9]+(-[a-z0-9]+)*$` and **equals the folder name**. It becomes the
  `module_id` on every signal and your storage prefix `media/<id>/` — pick once, keep it.
- `ui` must be exactly `() => import('./ui')` with `ui/index.tsx` default-exporting a
  React component. Omit the key entirely if you have no UI — data-only modules get a free
  generated page (description + health + filtered map + feed of their own signals).
- `homeStat` optional: `{ label: 'Outages', signalType: 'outage' }` — puts your team's
  number on the big screen: one stat tile on the shared home dashboard with a live count
  of your module's signals (optionally filtered to one `signal_type`).

## After scaffolding

1. Run the loader once → your tile is live on the dashboard (registration is a DB upsert,
   not a deploy).
2. `pnpm install && pnpm dev` → your UI at `http://localhost:3000/modules/team-<name>`
   with fast refresh. The install is required once after every `pnpm new-module` — the
   scaffold added a new workspace package, and without linking it `pnpm gen` fails with
   "Cannot find package '@wcc-impact/plugin-sdk'".
3. Verify CI locally before pushing: `pnpm gen && pnpm lint && pnpm typecheck`.

Work only inside `modules/team-<name>/` — CODEOWNERS blocks everything else, and a PR
touching only your folder merges on green CI without waiting for review.
