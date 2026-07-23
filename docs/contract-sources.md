# Contract sources and generated references

Each platform concept has one implementation source. Generated Markdown makes those
interfaces readable without creating another hand-maintained contract.

| Concept | Authoritative source | Generated reference |
|---|---|---|
| Signal fields, required flags, types, enums, and limits | `schema/signal.schema.json` | `docs/generated/signal-fields.md` |
| Module manifest fields and constraints | `moduleManifestSchema` in `packages/shared/src/module.ts` | `docs/generated/manifest-reference.md` |
| Module-UI public exports and TypeScript signatures | `packages/plugin-sdk/src/index.ts` plus the TypeScript declarations it exports | `docs/generated/plugin-sdk-reference.md` |
| Loader-helper public names and Python signatures | `wcc_impact.__all__` plus the referenced runtime functions/classes/constants | `docs/generated/python-api-reference.md` |
| Database tables, functions, grants, RLS, storage, and realtime | `supabase/migrations/` | Narrative summary in `docs/CONTRACTS.md`; deployment verifies the live schema |
| Event workflow, security rules, and operational guidance | `AGENTS.md` and `docs/CONTRACTS.md` | Hand-written by design |

Generated output begins with a do-not-edit marker and contains no timestamp, machine path,
or environment-dependent ordering. Normal pull-request diffs therefore show only contract
changes.

## Contributor workflow

After changing a source contract:

```sh
pnpm docs:generate
pnpm docs:check
```

Commit the source and generated Markdown together. Both module and platform CI jobs run
`pnpm docs:check`; the platform path filter also includes `docs/generated/**`, so editing
only a generated artifact cannot bypass the check.

The generator executes the TypeScript compiler against the real SDK package and imports
the real Python workspace with `uv`. Missing exports, changed parameters/defaults, and new
schema constraints therefore change the generated output. A stale or missing file makes
the check fail with the exact paths and regeneration command.
