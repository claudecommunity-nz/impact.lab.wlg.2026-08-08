# AGENTS.md — the system contract

Read this once and you know how the platform works. Every rule the platform enforces by
RLS, lint, or CI is stated here in plain language first — nothing should fail for a reason
this file didn't warn about. The binding interfaces live in `docs/CONTRACTS.md`; the signal
contract lives in `schema/signal.schema.json`.

## 1. Architecture in one paragraph

Your module is a folder: `modules/<your-team>/` with a manifest (`module.config.ts`), an
optional TypeScript UI (`ui/index.tsx`), and a Python loader (`loader/`). The core
dashboard discovers your manifest at build time (`pnpm gen`), renders your tile, and mounts
your UI at `/modules/<your-team>` inside its own error boundary. Your Python loader runs on
your laptop and writes rows into the shared Supabase `signals` table — **the `signals`
table is the contract between your loader and everything else**: the shared map, the live
feed, the health strip, and every other team's view of the unfolding scenario. A `modules`
table in Supabase carries runtime state: registration, heartbeat, and an organiser-only
`enabled` kill-switch.

## 2. Module lifecycle

1. **Scaffold** — `pnpm new-module team-<name>` copies `modules/_template` into your folder.
2. **Register** — first loader run calls `register_module(...)`; your tile appears on the
   dashboard instantly (the registry table is realtime — no rebuild, no refresh).
3. **First signal** — `publish_signal(...)` puts a row on the shared map and feed.
4. **Tile live** — health strip shows your heartbeat, signal count, last-seen.
5. **UI merged** — PR from your branch; green CI merges it; your page goes live on the
   deployed dashboard. UI merge freeze is **15:00** (loaders keep publishing after that).

## 3. Golden-path commands

```
pnpm install && uv sync                                  # once, at setup
cp .env.example .env                                     # then type in your check-in card values
pnpm new-module team-<name>                              # scaffold manifest + hello UI + hello loader
uv run --directory modules/team-<name>/loader --package team-<name>-loader python -m src.main   # run your loader → register + first signal
pnpm install && pnpm dev                                 # install links the new workspace package, then dashboard locally with fast refresh on your ui/
pnpm gen | pnpm lint | pnpm typecheck | pnpm build       # what CI runs
```

## 4. The rules

- **Loaders and pipelines: Python. UI: TypeScript.** The signals table is the contract
  between them. No JS scrapers, no Python UIs.
- **Module UIs import only `@wcc-impact/plugin-sdk` (and `react`).** Never from `apps/dashboard`
  internals, never other packages. The SDK is the whole API.
- **Never open your own realtime channel.** One shared subscription lives in the core
  provider; consume it with `useSignals(filter)`. Ten pages must not open ten channels.
- **The event token and your team's Anthropic key live in the gitignored `.env`, never in
  code.** The SDK and `wcc_impact` attach the token to writes automatically — you never
  handle it. Browser code has no secrets to read, by design.
- **Work only inside `modules/<your-team>/`.** CODEOWNERS enforces it; a PR touching only
  your folder merges on green CI with no review queue.
- **Never send `modules.enabled` in any write.** It is the organiser kill-switch,
  service-role-only; including it makes your register/heartbeat fail with a permission
  error.
- Respect the write caps: `title` ≤ 200 chars, `description` ≤ 2000 chars, uploads ≤ 10 MB
  to `media/<your-module-id>/...` only. `run_every()` clamps polling to a 5 s minimum.
- The media bucket is **public-read**: no real faces, names, or addresses in test data.

## 4b. Per-module backends (optional — most modules only need signals)

The `signals` table is the main path. When a module genuinely needs more, it can own
four things beyond it — all with the **same room-token security** as signals:

- **Files** — a folder `media/<your-module-id>/` in the shared bucket. `upload_file(id, ...)`
  (Python) / `<FileUpload moduleId=... />` (UI) write there; public-read, 10 MB cap.
- **Postgres tables** — declare them in `modules/<you>/backend/schema.sql` as
  `public.m_<id>_<name>` and finish each with `select wcc.enable_module_table('public.m_<id>_<name>');`
  (public read + token-gated writes + realtime, one line). List their names in
  `module.config.ts` `tables`. Read with `module_table(id, name)` (Python) or
  `useModuleTable(id, name)` (UI). **DDL is not self-serve:** an organiser applies schemas
  with `bash scripts/apply-module-backends.sh` — adding a table mid-event = re-run it.
- **Realtime** — declaring a table in `tables` subscribes it on the **one** shared channel.
  You still never call `.channel()` yourself; `useModuleTable` is live automatically.
- **Edge functions** — `modules/<you>/backend/functions/<name>/index.ts` (Deno) deploys as
  `<id>-<name>` via `bash scripts/deploy-module-functions.sh` (organiser; needs
  `SUPABASE_ACCESS_TOKEN`). For server-side logic a browser/loader shouldn't do.

The prefix `m_<id>_` is a **namespace convention, not a security wall** — the event token
is room-wide, so treat other teams' tables as readable/writable. See the `demo-seed` module
(`backend/schema.sql`, `backend/functions/summary`) for a working example of all four.

## 5. What runs where

| Thing | Where |
|---|---|
| Your Python loader | Your laptop (or Codespace) — a plain process, outbound HTTPS only |
| Dashboard | Vercel (deployed, read-only) + `pnpm dev` locally for building your UI |
| Data, realtime, storage | The one shared Supabase project (URL prefilled in `.env.example`) |
| Scenario feeds | Route handlers deployed with the dashboard — same for every team |
| Local Supabase stack (`supabase start`) | **Organisers and CI only.** Not the participant path: a signal published to a local database never reaches the big screen |

## 6. Where to go deeper (`.claude/skills/`)

- `platform-overview` — the end-to-end mental model; "why isn't my tile showing?"
- `create-module` — scaffold + manifest walkthrough
- `signal-schema` — how to read the signal contract (source of truth: `schema/signal.schema.json`)
- `publish-signals` — getting rows onto the map and feed, and why inserts get rejected
- `plugin-sdk` — every SDK export with a working example
- `loader-patterns` — uv workspace, polling loops, being polite to public APIs
- `ai-claude` — `ask_claude` / `analyze_image` for classification, dedupe, photo triage
- `geocoding` — Wellington place lookup
- `scenario-feeds` — the mock storm feeds and the `?t=` fast-forward
- `demo-prep` — the 15:00 freeze, README handover, and your 4-minute demo

Plus one dataset skill per problem statement (all teams get all five).

**Quickstart:** `docs/quickstart.md` — scaffold to first signal on the big screen in
under 15 minutes.
