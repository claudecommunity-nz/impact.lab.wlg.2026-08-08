# demo-seed — reference module & scenario seeder

The organiser-owned reference module. Two jobs:

1. **Seeds the scenario.** Bulk-loads a ~5,000-signal **M6.5 Wellington earthquake**
   story (`data/earthquake_story.json`) — liquefaction on reclaimed land, power
   outages, road closures, aftershocks, and response — from news, sensors,
   official agencies, and community reports. The timeline is anchored so the story
   always *ends now*, so the dashboard is alive before any team has published.
2. **Documents the plugin system.** Its page (`ui/index.tsx`) is a live,
   self-documenting tour: the register → publish → schedule → render loop with real
   code, the `wcc_impact` toolkit, and proof-by-live-data.

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
