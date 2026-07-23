# demo-seed — module architecture guide & reference-data seeder

The organiser-owned reference module. Two jobs:

1. **Seeds the scenario.** Bulk-loads a ~5,000-signal **M6.5 Wellington earthquake**
   story (`data/earthquake_story.json`) — liquefaction on reclaimed land, power
   outages, road closures, aftershocks, and response — from news, sensors,
   official agencies, and community reports. The timeline is anchored so the story
   always *ends now*, so the dashboard is alive before any team has published.
2. **Documents the plugin system.** Its page (`ui/index.tsx`) is a focused visual
   guide to the manifest → loader → signals → shared dashboard architecture, plus
   the contributor golden path. The optional-backend section shows the copyable
   table and Edge Function patterns without becoming a second operational dashboard.

## Working optional backend

The reference module demonstrates the complete optional Supabase backend path:

| File | What it demonstrates |
|---|---|
| `backend/schema.sql` | Idempotent module-owned Postgres table plus `wcc.enable_module_table(...)` |
| `module.config.ts` | Declaring `tables: ["pins"]` for the shared realtime subscription |
| `backend/functions/summary/index.ts` | Public read-only Edge Function with CORS, method validation, upstream checks, and structured errors |
| `ui/index.tsx` | Copyable UI snippets for module-owned tables and `invokeModuleFunction(...)` |

The function reads only public signal fields with the injected anon key. It does not use
the service-role key and cannot mutate incident or response data. The shared Situation
Overview map is the live spatial demo: click a location or report marker to inspect
nearby evidence using PostGIS.

For a copyable table/function walkthrough, authentication rules, deployment path, and
review checklist, see [`../../docs/module-backends.md`](../../docs/module-backends.md).

## Run it

```sh
uv sync
# seed once (idempotent — clears demo-seed's old signals first):
uv run --directory modules/demo-seed/loader --package demo-seed-loader python -m src.main seed
# or run the live loop (registers, seeds, then trickles aftershocks + heartbeats):
uv run --directory modules/demo-seed/loader --package demo-seed-loader python -m src.main
```

> **Organiser-only.** Both commands reach `seed()`, and seeding/clearing needs the
> organiser `SUPABASE_SECRET_KEY` in `.env` (to clear old signals before re-seeding).
> Without it the loader refuses with a `SUPABASE_SECRET_KEY not set` error — expected
> for participants; the scenario is seeded once by an organiser.

## How the data is built

`data/earthquake_story.json` is authored by a fan-out of Haiku agents, each writing
a 100-record slice (phase × theme × area) into `data/batches/`, then merged. Each
record carries `offset_min` (minutes after the 07:42 mainshock); the loader turns
that into an absolute `created_at` at seed time.

## Production notes (for WCC handover)

- The loader pattern (`register_module` + `run_every` polling + `publish_signal`)
  is what every real module uses. In production these run wherever WCC runs Python
  (Azure Functions / Container Apps) on a schedule.
- Bulk-seeding uses the organiser client directly for speed; everyday publishing goes
  through `publish_signal()`, which validates and attaches the module credential.
- The `signals` table is the contract; event-day writes are restricted to the
  credential's own module. See CONTRACTS.md for production identity patterns.
