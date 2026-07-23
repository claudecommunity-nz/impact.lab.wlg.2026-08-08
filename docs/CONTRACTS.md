# CONTRACTS.md — the binding interfaces

This document is the authoritative narrative for platform behavior and event rules.
Executable field constraints and API signatures are generated from their implementation
sources; if a hand-written example disagrees with a generated reference, the generated
reference wins. Change a source contract only with organiser sign-off, and never after the
platform freeze (7 Aug).

Related sources of truth:

- **`/schema/signal.schema.json`** — THE signal contract. `@wcc-impact/shared` (zod),
  `wcc_impact` (Python), and `supabase/migrations` (SQL) mirror it; CI validates loader
  output against it directly.
- **`/supabase/migrations/`** — THE database DDL/RLS. `schema/schema.sql` is a generated
  snapshot, never hand-applied.
- **`/docs/generated/`** — deterministic field/signature references generated from the
  sources above, the TypeScript public barrel, and `wcc_impact.__all__`. Run
  `pnpm docs:generate`; CI runs `pnpm docs:check`.

The complete ownership map and contributor workflow are in
[`docs/contract-sources.md`](contract-sources.md).

---

## 1. Package & app names

| Path | Package name | Role |
|---|---|---|
| `apps/dashboard` | `@wcc-impact/dashboard` | Core Next.js 16 app (shell, map, feed, `/modules/[id]`, health strip) |
| `apps/scenario` | `@wcc-impact/scenario` | Scenario engine (route handlers, deployed in the same Vercel project) |
| `packages/plugin-sdk` | `@wcc-impact/plugin-sdk` | The ONLY package module UIs may import (plus React) |
| `packages/shared` | `@wcc-impact/shared` | Signal + manifest types (zod), mirrored from the JSON Schema |
| `packages/ui` | `@wcc-impact/ui` | Core-internal components + theme tokens (`tokens.css`; SDK re-exports the public parts) |
| `packages/wcc-impact-platform-py` | `wcc-impact-platform` (import name `wcc_impact`) | Python helper library for loaders |
| `modules/<id>` | `@modules/<id>` | One team module; loader package name is `<id>-loader` |

Root scripts (defined in the root `package.json`): `pnpm dev`, `pnpm gen`
(`scripts/gen-registry.ts`), `pnpm docs:generate`, `pnpm docs:check`,
`pnpm new-module <id>` (`scripts/new-module.ts`), `pnpm lint`, `pnpm typecheck`,
`pnpm build`. `gen` runs automatically before dev/typecheck/build.

---

## 2. Environment variables

Participant secrets live ONLY in the gitignored root `.env` (values from the check-in
card). Deployment-only secrets live in the Vercel environment. `.env.example` carries
public values prefilled and empty placeholders for secrets.

### TypeScript / dashboard (browser code — `NEXT_PUBLIC_` only)

| Variable | Meaning |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (public) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key (public-by-design; writes still need the token) |
| `NEXT_PUBLIC_EVENT_TOKEN` | **Local dev only — NEVER set in Vercel.** The deployed dashboard is read-only in production; a `NEXT_PUBLIC_` token would ship in the public JS bundle. |

### Dashboard server routes (never exposed to browser code)

| Variable | Meaning |
|---|---|
| `GITHUB_REPOSITORY` | Repository shown in Lab activity; defaults to `claudecommunity-nz/impact.lab.wlg.2026-08-08` |
| `GITHUB_TOKEN` | Optional fine-grained, read-only GitHub token used by `/api/activity/github` to include PR check rollups. Without it, public commits/PRs remain visible and the source reports degraded status. **Never use a `NEXT_PUBLIC_` prefix.** |

### Python / loaders & scripts

| Variable | Meaning |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_PUBLISHABLE_KEY` | Publishable key |
| `EVENT_TOKEN` | Room-only write token (check-in card) |
| `ANTHROPIC_API_KEY` | Team's spend-capped Anthropic key (check-in card) |

`wcc_impact` loads the repo-root `.env` automatically (python-dotenv, searching upward
from the CWD), so loaders never handle credentials directly. Organiser-only variables
(`SUPABASE_DB_PASS`, `SUPABASE_DB_URL`) exist in organisers' `.env` and appear in **no**
committed file and no participant-facing docs beyond this table.

---

## 2a. Event-day Lab activity

`/activity` is the shared, read-only delivery room for participants:

- `/api/activity/github` returns recent default-branch commits plus open/recent pull
  requests. With `GITHUB_TOKEN`, it includes the latest commit's check rollup. The route
  response is CDN-cacheable for 30 seconds and never returns the token.
- `/api/activity/supabase` uses only the public URL and publishable key. It returns
  registered modules, exact signal counts, the 50 newest safe signal fields,
  manifest-declared module-table counts and bounded row previews, and recent public media.
- Module-table previews defensively redact secret-shaped field names, bound nested values,
  and never introspect private or undeclared schemas.
- Each source reports `ok`, `degraded`, or `unavailable`. One source failing does not blank
  the other or break the dashboard.
- The page polls these cached HTTP snapshots. It opens **no Supabase realtime channel**;
  the core provider remains the platform's one realtime subscription.
- This is observability, not administration: there are no write, moderation, kill-switch,
  merge, or deployment controls.

Organiser setup and failure checks live in [`docs/organiser-activity.md`](organiser-activity.md).

---

## 2b. Supabase deployment

Database-shaped changes are validated on CI's ephemeral Supabase stack. After **CI succeeds
on `main`**, `.github/workflows/deploy-supabase.yml`:

1. dry-runs and applies pending `supabase/migrations/`;
2. transactionally applies every `modules/*/backend/schema.sql`;
3. verifies module tables have RLS, public-read grants, and realtime membership; and
4. deploys manifest-adjacent module edge functions.

The job uses only secrets from the GitHub `Production` environment and is never run in a
pull-request context. A failed main CI run cannot deploy. Full setup, retry, and
roll-forward guidance: [`docs/supabase-deployment.md`](supabase-deployment.md).

---

## 3. The `x-event-token` write-gating convention

- Every write (signals insert, modules upsert/heartbeat, storage upload) must carry the
  header **`x-event-token: <EVENT_TOKEN>`**. RLS policies verify it via
  `public.event_token_ok()` and reject writes without it. Reads need no token.
- **How clients attach it:** create the Supabase client with a global header —
  - supabase-js: `createClient(url, key, { global: { headers: { "x-event-token": token } } })`
  - supabase-py: `create_client(url, key, options=ClientOptions(headers={"x-event-token": token}))`
  The SDK and `wcc_impact` do this automatically when the env var is present; **teams
  never handle the token in code.** Omit the header entirely when no token is configured
  (read-only mode — this is the deployed dashboard's state).
- **Server-side value:** the expected token lives in `private.event_config` — a
  single-row table in a schema PostgREST never exposes, read only by the
  `SECURITY DEFINER` function `public.event_token_ok()`. Set out of band (never
  in a migration — public repo):

  ```sh
  psql "$SUPABASE_DB_URL" -c \
    "insert into private.event_config (id, token) values (true, '<TOKEN>')
     on conflict (id) do update set token = excluded.token;"
  ```

  Takes effect immediately (no PostgREST reload). Until a token is set, all
  writes are blocked. Rotation mid-event = re-run with a new value + announce
  it + one `.env` edit per team.

---

## 4. Database contract (summary — DDL in `supabase/migrations/`)

### `signals`

Columns exactly mirror `/schema/signal.schema.json`. Key RLS facts:

- **SELECT**: public (anon).
- **INSERT**: requires `event_token_ok()` **and** `module_id` references an **enabled**
  `modules` row (the kill-switch silences inserts, not just the tile) **and**
  `length(title) <= 200`, `length(description) <= 2000`.
- **UPDATE**: `authenticated` role only, and only the columns `verification` and
  `confidence` (column-level grants). Everything else is immutable post-insert.
- **DELETE**: service role only.
- `idempotency_key` is optional, at most 200 characters, and unique within a
  `module_id`. The Python durable outbox always supplies one; loaders should use
  a stable source-item key when available.
- Realtime enabled (Postgres Changes). **One** subscription lives in the core provider;
  nothing else may open a channel.
- The provider's realtime snapshot is intentionally capped at the newest **500** rows.
  Exact counts come from `signal_aggregates()` and older rows come from
  `signal_history_page(...)`; do not calculate all-time statistics from `useSignals()`.

### Signal read functions

- `signal_aggregates() -> jsonb` returns exact enabled-module totals, time-window counts,
  severity/source/verification breakdowns, distinct places, per-module totals, and
  per-module signal-type totals in one public, RLS-respecting call.
- `signal_history_page(limit, before_created_at, before_id, module_id, signal_type)`
  returns enabled-module signals newest first. Pagination uses the stable
  `(created_at, id)` tuple; callers request `page size + 1` to determine whether another
  page exists.
- Supporting indexes cover global chronological reads and
  `(module_id, signal_type, created_at, id)` history. Query-plan and scale-test details
  are in [`scalable-signal-queries.md`](scalable-signal-queries.md).

### `modules`

`id, name, icon, description, enabled bool default true, last_seen, updated_at`, plus
public queue-health fields (`queue_depth`, `queue_oldest_at`, `queue_last_success_at`,
`queue_last_error`, `queue_dead_letters`, `queue_updated_at`).

- **SELECT**: public. **INSERT/UPDATE**: require `event_token_ok()`.
- **`enabled` is service-role-only** (excluded from column grants). It is flipped in
  Supabase Studio — there is no admin page. **Client payloads (register/heartbeat/upsert)
  must never include `enabled`** or the write fails with a permission error. Note:
  PostgREST upserts put every payload column into `ON CONFLICT DO UPDATE SET`, which is why
  the rule is "omit the column", not "send `enabled: true`".
- `updated_at` is maintained by a trigger — don't send it.
- The dashboard renders only `enabled = true` modules.

### Storage — bucket `media`

- Public read; 10 MiB per-file limit.
- Object keys are **`media/<module_id>/<filename>`** — the first path segment must be a
  registered, enabled `module_id` (RLS-enforced), and INSERT requires the event token.
- No client update/delete. Public-read bucket ⇒ the kickoff privacy rule applies: no real
  faces, names, or addresses in test uploads.

---

## 5. `@wcc-impact/shared` exports

The package exports the signal types, aggregate/history types, manifest types and validator,
runtime module-row type, and module-table naming helpers consumed by the SDK and dashboard.
Do not maintain a second field list here:

- [generated signal-field reference](generated/signal-fields.md)
- [generated manifest reference](generated/manifest-reference.md)
- [generated SDK/shared export inventory](generated/plugin-sdk-reference.md)

---

## 6. `@wcc-impact/plugin-sdk` — the full public surface (TS)

Module UIs import **only** from `@wcc-impact/plugin-sdk` (and `react`). The SDK re-exports all
`@wcc-impact/shared` types above. All components are client components.

The exhaustive export inventory and current TypeScript signatures are generated directly
from the public package barrel and compiler:

**[Generated `@wcc-impact/plugin-sdk` reference](generated/plugin-sdk-reference.md)**

The reference includes core functions/hooks/components, shared contract re-exports, and the
WCC-branded shadcn/ui kit. Change the implementation or barrel first, then run
`pnpm docs:generate`; CI rejects a stale reference.

### Design tokens

`@wcc-impact/ui` ships the theme as CSS variables + Tailwind v4 `@theme` utilities in
`tokens.css`. The dashboard's `globals.css` imports it once; **module UIs never import
CSS** — just use the utility classes. The token names are the standard shadcn/ui set
(never hard-coded colours):

- Core: `bg-background`, `bg-card`, `text-foreground`, `text-card-foreground`,
  `text-muted-foreground`, `bg-primary`, `bg-accent`, `border-border`
  (CSS vars `--color-background` … `--color-accent`).
- Severity scale: `severity-minor`, `severity-moderate`, `severity-severe`,
  `severity-extreme`, `severity-unknown` (e.g. `bg-severity-severe`) — the same scale the
  shared map and feed cards colour by.

Rules (enforced by convention + lint): no imports from `apps/dashboard` internals; no own
realtime channels; no `.env` secrets in browser code (there are none to read).

---

## 7. `wcc_impact` — the Python helper surface

Import name `wcc_impact`; distributed as the uv workspace member
`packages/wcc-impact-platform-py`. Every loader depends on it
(`wcc-impact-platform = { workspace = true }`). Reads env from the repo-root `.env`; attaches
`x-event-token` automatically. All functions raise `wcc_impact.HackPlatformError`
(subclass of `RuntimeError`) with a readable message on failure — e.g. an insert rejected
because the module is disabled or the token is missing.

The exhaustive public names and live Python signatures are generated from
`wcc_impact.__all__` and `inspect.signature()`:

**[Generated `wcc_impact` reference](generated/python-api-reference.md)**

Examples and workflow guidance remain in the focused skills and package README. Change the
Python implementation first, then run `pnpm docs:generate`; CI rejects a stale signature
reference.

### Loader conventions (CI contract)

Every `modules/<id>/loader/src/main.py` must expose:

- `main()` — the entrypoint
  (`uv run --directory modules/<id>/loader --package <id>-loader python -m src.main` —
  loaders are virtual uv members run with their own folder as cwd, because ten
  identically-named top-level `src` packages cannot share one venv); typically
  `register_module(...)` then `run_every(...)`.
- `sample() -> dict` — returns one representative signal payload **without** inserting it.
  CI validates `sample()` output against `/schema/signal.schema.json` (the contract smoke
  test), and `uv run pytest` runs any loader tests.

---

## 8. `module.config.ts` — the manifest

Default export of `defineModule({...})`, validated by `moduleManifestSchema` during
`pnpm gen`. The deterministic [generated manifest reference](generated/manifest-reference.md)
lists every field, nested field, required flag, and current constraint.

---

## 9. `registry.gen.ts` — the generated registry

`scripts/gen-registry.ts` globs `modules/*/module.config.ts`, validates each manifest with
`moduleManifestSchema`, and writes `apps/dashboard/registry.gen.ts`. Rules:

- **Gitignored, regenerated on every dev/build/CI run.** Never commit or hand-edit it.
- **Skips `modules/_template`** (the scaffold source is not a real module).
- Supports `pnpm gen --exclude <id>` as the emergency build-time exclusion.
- Manifests are imported statically (so per-module `ui` stays a lazy `import()` boundary
  that `next/dynamic` can code-split).

Exact shape:

```ts
// generated — do not edit
import type { ModuleRegistryEntry } from "@wcc-impact/shared";
import m0 from "@modules/team-outage-watch/module.config";
import m1 from "@modules/team-coast-watch/module.config";

const registry: ModuleRegistryEntry[] = [
  { ...m0, hasUi: true },
  { ...m1, hasUi: false },
];

export default registry;
```

The dashboard mounts each entry's `ui` at `/modules/[id]` via `next/dynamic`
(`ssr: false`, inside a client-component wrapper) wrapped in a per-module error boundary,
and renders a tile only when the matching `modules` DB row has `enabled = true`.

---

## 10. Non-negotiables (recap)

1. Loaders and pipelines: **Python**. UI: **TypeScript**. The `signals` table is the
   contract between them.
2. Module UIs import only `@wcc-impact/plugin-sdk` (+ React). Never dashboard internals. Never
   their own realtime channels.
3. The event token and Anthropic keys live only in the gitignored `.env` and on check-in
   cards. The deployed dashboard never gets the token (read-only in production).
4. Client writes never touch `modules.enabled` — it is the organiser kill-switch.
5. `signal.schema.json` freezes 26–27 Jul; after that, schema changes require organiser
   sign-off and a coordinated zod + Python + SQL update.
