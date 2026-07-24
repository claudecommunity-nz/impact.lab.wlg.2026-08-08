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
`pnpm new-module <id>` (`scripts/new-module.ts`),
`pnpm migrate-module-contract <id>`, `pnpm lint`, `pnpm typecheck`, `pnpm build`.
`gen` runs automatically before dev/typecheck/build.

---

## 2. Environment variables

Participant secrets live ONLY in the gitignored root `.env` (values from the check-in
card). Deployment-only secrets live in the Vercel environment. `.env.example` carries
public values prefilled and empty placeholders for secrets.

### TypeScript / dashboard (browser code — `NEXT_PUBLIC_` only)

| Variable | Meaning |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (public) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key (public-by-design; anonymous sessions remain read-only) |
| `NEXT_PUBLIC_DEMO_AUTH_ENABLED` | Hackathon-only build flag. Defaults on; set `false` and redeploy to remove the public demo-login panel. |

There is deliberately no `NEXT_PUBLIC_*TOKEN`. Browser writes use a signed-in user's
organiser-controlled `app_metadata.module_id` claim.

The three role-demo emails and their shared password are intentionally public UI content,
not secrets or production identities. They are provisioned server-side with the Auth Admin
API and authorized through `private.response_members`; no service key enters the browser.

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
| `MODULE_TOKEN` | This team's loader-only write token (check-in card) |
| `EVENT_TOKEN` | Migration-only old room token; participants normally leave it empty |
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
- The page identifies the running Plugin SDK and platform contract versions and shows
  each registered module's manifest declaration. Unsupported declarations are marked for
  attention (and are rejected earlier by `pnpm gen`).
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
3. verifies module tables have explicit owner mappings, owner-scoped RLS, public-read
   grants, and realtime membership; and
4. deploys manifest-adjacent module edge functions.

The job uses only secrets from the GitHub `Production` environment and is never run in a
pull-request context. A failed main CI run cannot deploy. Full setup, retry, and
roll-forward guidance: [`docs/supabase-deployment.md`](supabase-deployment.md).

---

## 3. Per-module write credentials

- Loader writes carry **`x-module-token: <MODULE_TOKEN>`**. Only SHA-256 lives in
  `private.module_credentials`; `public.module_credential_ok(target)` resolves the token's
  owner and compares it with the row, storage prefix, or table being written.
- `public.module_write_ok(target)` adds the existing `modules.enabled` kill-switch.
  Signals, registration/heartbeat, `media/<id>/`, and `m_<id>_*` tables all use it.
- `wcc_impact` attaches the token automatically from the root `.env`; module code never
  reads it. No static secret enters browser JavaScript. Authenticated browser writes use
  the server-controlled JWT `app_metadata.module_id` claim and the same RLS predicates.
- Reads remain public. Service role retains organiser moderation/recovery and bypasses RLS.
- Rotation/revocation is immediate and needs no deploy:

  ```sh
  bash scripts/module-credentials.sh rotate team-coast-watch
  bash scripts/module-credentials.sh revoke team-coast-watch
  ```

- The old `EVENT_TOKEN` is accepted only when an organiser opens a bounded
  `legacy_module_writes_until` window and the updated loader declares its exact
  `x-module-id`. The secure/default state is `NULL` (closed).

Provisioning, authenticated-user assignment, migration, and recovery:
[module-write-isolation.md](module-write-isolation.md).

---

## 4. Database contract (summary — DDL in `supabase/migrations/`)

### `signals`

Columns exactly mirror `/schema/signal.schema.json`. Key RLS facts:

- **SELECT**: public (anon).
- **INSERT**: requires the credential owner to equal `module_id` **and** that module is
  **enabled**
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
- Located rows are projected by trigger into `signal_geo` as indexed PostGIS
  `geography(Point, 4326)`. `signals` remains the immutable evidence contract; spatial
  indexes and derived incident state do not enlarge every realtime payload.

### Spatial triage and incidents

- Public, RLS-respecting RPCs provide bounded radius (`signals_nearby`), map viewport
  (`signals_in_view`), response polygon (`signals_in_response_area`), and DBSCAN hotspot
  (`signal_hotspots`) queries. The response-member-only `signal_serious_pockets`
  function provides the full-screen map's bounded cross-type severe/extreme-report cells
  and returns explicit candidate/output cap and precision metadata.
- `response_areas` stores versioned authoritative polygons. Until organisers load a
  boundary dataset, the dashboard uses coordinate-derived hotspots rather than grouping
  exact `place_name` strings.
- Cross-module operations access is independent of module ownership. Only authenticated
  users listed in `private.response_members` can call `signal_triage_queue`,
  `create_incident_from_signal`, or `assess_incident`.
- `signals` are evidence, not incidents. Promoting one signal creates an `incidents` row
  and links same-type evidence within the configured distance/time window through
  `incident_evidence`. Source rows are never merged or rewritten.
- Map concentration pins are automated analytical group centroids. They are never named
  or styled as confirmed incidents, and their verification, official-source, reported
  origin, and coarse-location counts remain separate.
- Action priority and verification priority are separate fields. Database rules generate
  deterministic defaults and reason codes; a human operator owns incident creation and
  assessment.
- Incident tables are browser-read-only. Mutations use audited RPCs, and every assessment
  appends an `incident_assessments` history row.

Operational setup and query details:
[`docs/spatial-incident-triage.md`](spatial-incident-triage.md).

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

- **SELECT**: public. **INSERT**: credential must own the new `id`. **UPDATE**:
  credential must own the existing/new `id` and the module must remain enabled.
- **`enabled` is service-role-only** (excluded from column grants). It is flipped in
  Supabase Studio — there is no admin page. **Client payloads (register/heartbeat/upsert)
  must never include `enabled`** or the write fails with a permission error. Note:
  PostgREST upserts put every payload column into `ON CONFLICT DO UPDATE SET`, which is why
  the rule is "omit the column", not "send `enabled: true`".
- `updated_at` is maintained by a trigger — don't send it.
- The dashboard renders only `enabled = true` modules.

### `dashboard_layouts`

Versioned JSON documents for the optional `/dashboard` widget workspace.

- Personal rows belong to `auth.uid()` and are readable/writable only by that user.
- Shared organiser presets are public-read and service-role-written.
- Documents contain stable module/widget/instance ids, JSON configuration, and
  responsive grid positions only—never import paths, HTML, or executable content.
- Database constraints cap a document at 100 instances and 64 KiB.
- The signed-out/offline path uses the same versioned document in localStorage.
- Layout synchronization uses ordinary requests and is deliberately not realtime;
  the core signal/module provider remains the app's one Supabase channel.

### Storage — bucket `media`

- Public read; 10 MiB per-file limit.
- Object keys are **`media/<module_id>/<filename>`** — the first path segment must be a
  registered, enabled `module_id`, and INSERT requires the same module's credential/JWT
  claim (RLS-enforced).
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

### Widget bodies

Modules may declare reusable `widgets` in their manifest. Widget code is build-time
trusted exactly like a module page: `pnpm gen` validates the definition and the dashboard
lazy-loads its `ui` import. Loader registration never supplies JavaScript or an import URL.

The dashboard owns the outer shadcn Card, header, actions, drag/resize controls,
loading/unavailable/error states, and persistence. Module widgets render body content
only, starting with `WidgetContent`, `WidgetMetric`, `WidgetEmpty`, or
`WidgetSkeleton`. Availability requires both a build-time widget definition and a live
runtime `modules` row with `enabled = true`; disabled widget code is unmounted while its
saved position is retained.

---

## 7. `wcc_impact` — the Python helper surface

Import name `wcc_impact`; distributed as the uv workspace member
`packages/wcc-impact-platform-py`. Every loader depends on it
(`wcc-impact-platform = { workspace = true }`). Reads env from the repo-root `.env`; attaches
the team-specific `x-module-token` automatically (or migration-only legacy headers). All
functions raise `wcc_impact.HackPlatformError`
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

Every manifest must pin `contractVersion` as a numeric literal. The current compatibility
matrix, migration command, transition policy, and Plugin SDK release conventions live in
[module-contract-versioning.md](module-contract-versioning.md). Missing, unsupported
legacy, and future declarations fail registry generation with an actionable message.

---

## 9. `registry.gen.ts` — the generated registry

`scripts/gen-registry.ts` globs `modules/*/module.config.ts`, validates each manifest with
`moduleManifestSchema`, and writes `apps/dashboard/registry.gen.ts`. Rules:

- **Gitignored, regenerated on every dev/build/CI run.** Never commit or hand-edit it.
- **Skips `modules/_template`** (the scaffold source is not a real module).
- Supports `pnpm gen --exclude <id>` as the emergency build-time exclusion.
- Manifests are imported statically (so per-module `ui` stays a lazy `import()` boundary
  that `next/dynamic` can code-split). Each `widgets[].ui` import remains an independent
  lazy boundary in the same manifest registry; there is no second widget registry.

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
The `/dashboard` route derives its widget gallery from the same registry. Modules cannot
auto-place widgets; users add instances explicitly and the core dashboard owns layout.

---

## 10. Non-negotiables (recap)

1. Loaders and pipelines: **Python**. UI: **TypeScript**. The `signals` table is the
   contract between them.
2. Module UIs import only `@wcc-impact/plugin-sdk` (+ React). Never dashboard internals. Never
   their own realtime channels.
3. Each team's module token and Anthropic key live only in the gitignored `.env` and on
   its check-in card. Browser code never gets a module token; authenticated UI writes use
   organiser-assigned JWT claims.
4. Client writes never touch `modules.enabled` — it is the organiser kill-switch.
5. `signal.schema.json` freezes 26–27 Jul; after that, schema changes require organiser
   sign-off and a coordinated zod + Python + SQL update.
