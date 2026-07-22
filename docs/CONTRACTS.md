# CONTRACTS.md — the binding interfaces

**This document is authoritative.** Every package in this monorepo is built against the
interfaces below. If an implementation and this document disagree, the implementation is
wrong. Change this file only with organiser sign-off, and never after the platform freeze
(7 Aug).

Related sources of truth:

- **`/schema/signal.schema.json`** — THE signal contract. `@wcc-impact/shared` (zod),
  `wcc_impact` (Python), and `supabase/migrations` (SQL) mirror it; CI validates loader
  output against it directly.
- **`/supabase/migrations/`** — THE database DDL/RLS. `schema/schema.sql` is a generated
  snapshot, never hand-applied.

---

## 1. Package & app names

| Path | Package name | Role |
|---|---|---|
| `apps/dashboard` | `@wcc-impact/dashboard` | Core Next.js 15 app (shell, map, feed, `/modules/[id]`, health strip) |
| `apps/scenario` | `@wcc-impact/scenario` | Scenario engine (route handlers, deployed in the same Vercel project) |
| `packages/plugin-sdk` | `@wcc-impact/plugin-sdk` | The ONLY package module UIs may import (plus React) |
| `packages/shared` | `@wcc-impact/shared` | Signal + manifest types (zod), mirrored from the JSON Schema |
| `packages/ui` | `@wcc-impact/ui` | Core-internal components + Tailwind v4 preset (SDK re-exports the public parts) |
| `packages/wcc-impact-platform-py` | `wcc-impact-platform` (import name `wcc_impact`) | Python helper library for loaders |
| `modules/<id>` | `@modules/<id>` | One team module; loader package name is `<id>-loader` |

Root scripts (defined in the root `package.json`): `pnpm dev`, `pnpm gen`
(`scripts/gen-registry.ts`), `pnpm new-module <id>` (`scripts/new-module.ts`), `pnpm lint`,
`pnpm typecheck`, `pnpm build`. `gen` runs automatically before dev/typecheck/build.

---

## 2. Environment variables

All secrets live ONLY in the gitignored root `.env` (values from the check-in card).
`.env.example` carries the public pair prefilled and empty placeholders for the rest.

### TypeScript / dashboard (browser code — `NEXT_PUBLIC_` only)

| Variable | Meaning |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (public) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key (public-by-design; writes still need the token) |
| `NEXT_PUBLIC_EVENT_TOKEN` | **Local dev only — NEVER set in Vercel.** The deployed dashboard is read-only in production; a `NEXT_PUBLIC_` token would ship in the public JS bundle. |

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
- Realtime enabled (Postgres Changes). **One** subscription lives in the core provider;
  nothing else may open a channel.

### `modules`

`id, name, icon, description, problem (1-5), enabled bool default true, last_seen, updated_at`.

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

```ts
// enums (const arrays) + types
export const SOURCE_TYPES: readonly ["official", "community", "media", "sensor"];
export const SEVERITIES: readonly ["minor", "moderate", "severe", "extreme", "unknown"];
export const VERIFICATIONS: readonly ["unverified", "corroborated", "verified", "false_report"];
export type SourceType; export type Severity; export type Verification;

export const signalSchema: z.ZodObject<...>;   // mirrors signal.schema.json
export type Signal;                             // z.infer<typeof signalSchema>
export type SignalRow;                          // Signal & { id: string; created_at: string }

export interface MapLayerConfig { signalTypes: string[]; color: string }
export interface ModuleManifest { id; name; icon; description; problem: 1|2|3|4|5;
  ui?: () => Promise<{ default: React.ComponentType }>;
  mapLayer?: MapLayerConfig;   // accepted, not yet consumed this event (SignalMap plots every located signal)
  feedCard?: "default" | React.ComponentType<{ signal: Signal }> }  // accepted, ignored this event (SignalFeed always renders SignalCard)
export const moduleManifestSchema: z.ZodObject<...>; // runtime check used by gen-registry
export interface ModuleRegistryEntry extends ModuleManifest { hasUi: boolean }
export interface ModuleRow { id; name; icon; description; problem; enabled; last_seen; updated_at }
```

---

## 6. `@wcc-impact/plugin-sdk` — the full public surface (TS)

Module UIs import **only** from `@wcc-impact/plugin-sdk` (and `react`). The SDK re-exports all
`@wcc-impact/shared` types above. All components are client components.

```ts
import type { ReactElement } from "react";
import type { User } from "@supabase/supabase-js";
import type { ModuleManifest, SignalRow } from "@wcc-impact/shared";

/** Typed manifest helper — identity function that gives autocomplete + checking.
 *  @example export default defineModule({ id: "team-x", name: "X", icon: "waves",
 *           description: "...", problem: 1, ui: () => import("./ui") }); */
export function defineModule(config: ModuleManifest): ModuleManifest;

/** Client-side filter over the shared signal store. `since` is an ISO timestamp. */
export interface SignalFilter { moduleId?: string; signalType?: string; since?: string }

/** THE signal store. One shared realtime subscription lives in the core provider;
 *  this hook consumes from context with client-side filtering. Modules NEVER open
 *  their own Supabase channels.
 *  @example const { signals } = useSignals({ moduleId: "team-x" }); */
export function useSignals(filter?: SignalFilter): {
  signals: SignalRow[];        // newest first
  loading: boolean;
  error: string | null;
};

/** Supabase Auth context provided by the core shell (optional — for concepts
 *  needing identity, e.g. triage verification). */
export function useUser(): { user: User | null; loading: boolean };

/** Email magic-link sign-in form, styled with core tokens. */
export function SignIn(props: { className?: string }): ReactElement;

/** The shared MapLibre map (Wellington defaults, severity colouring, popups).
 *  Pass `signals` OR `filter`; if both, `signals` wins. Modules never own a map
 *  instance. Default height 400px unless `className` sizes it. */
export function SignalMap(props: {
  signals?: SignalRow[];
  filter?: SignalFilter;
  className?: string;
}): ReactElement;

/** Standardised feed list. Same signals/filter rule as SignalMap. */
export function SignalFeed(props: {
  signals?: SignalRow[];
  filter?: SignalFilter;
  limit?: number;              // default 50
  className?: string;
}): ReactElement;

/** One standardised feed card. (The manifest's `feedCard` is accepted but ignored this
 *  event — SignalFeed always renders SignalCard, never a custom card.) */
export function SignalCard(props: { signal: SignalRow; className?: string }): ReactElement;

/** Upload UI scoped to media/<moduleId>/ automatically. */
export function FileUpload(props: {
  moduleId: string;
  onUploaded?: (publicUrl: string) => void;
  accept?: string;             // e.g. "image/*"; default "image/*"
  className?: string;
}): ReactElement;

/** Grid of everything under media/<moduleId>/. */
export function FileGallery(props: { moduleId: string; className?: string }): ReactElement;

/** Programmatic upload → public URL (for media_urls). Throws on RLS rejection
 *  (missing token / disabled module / >10MB).
 *  @example const url = await uploadFile(file, "team-x"); */
export function uploadFile(file: File, moduleId: string): Promise<string>;
```

### Design tokens

`@wcc-impact/ui` ships a Tailwind v4 preset + CSS variables; the SDK re-exports the preset.
Module UIs style with these token names only (never hard-coded colours):

- Core: `background`, `surface`, `border`, `text`, `text-muted`, `accent`
  (CSS vars `--color-background` … `--color-accent`; Tailwind utilities like
  `bg-surface`, `text-text-muted`, `border-border`, `bg-accent`).
- Severity scale: `severity-minor`, `severity-moderate`, `severity-severe`,
  `severity-extreme`, `severity-unknown` (e.g. `bg-severity-severe`). The map and
  default feed cards use the same scale, which is what `mapLayer.color: "severity"` maps to.

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

```python
from datetime import datetime
from pathlib import Path
from typing import Callable, NoReturn

def register_module(
    *,
    id: str,                       # = your folder name under modules/
    name: str,
    icon: str | None = None,       # a lucide icon name (kebab-case), e.g. "radio-tower"
    description: str | None = None,
    problem: int | None = None,    # 1-5
) -> dict:
    """Upsert this module into the modules registry; the dashboard tile appears
    the moment this succeeds. NEVER sends the `enabled` column (service-role-only).
    Returns the module row.

    Example:
        register_module(id="team-outage-watch", name="Outage Watch",
                        icon="radio-tower", description="Telco outage detection", problem=3)
    """

def publish_signal(
    *,
    module_id: str,
    title: str,                        # <= 200 chars (RLS-enforced)
    signal_type: str,                  # kebab-case, e.g. "outage"
    source_type: str,                  # "official" | "community" | "media" | "sensor"
    source: str | None = None,
    description: str | None = None,    # <= 2000 chars (RLS-enforced)
    lat: float | None = None,
    lng: float | None = None,
    place_name: str | None = None,
    severity: str = "unknown",         # minor|moderate|severe|extreme|unknown
    verification: str = "unverified",  # unverified|corroborated|verified|false_report
    confidence: float | None = None,   # 0-1
    link: str | None = None,
    media_urls: list[str] | None = None,
    observed_at: str | datetime | None = None,   # ISO string or datetime
    reported_at: str | datetime | None = None,
    raw: dict | None = None,
) -> dict:
    """Validate against signal.schema.json, insert into `signals`, return the row.

    Example:
        publish_signal(module_id="team-coast-watch",
                       title="Waves over the road at Ōwhiro Bay",
                       signal_type="coastal-hazard", source_type="community",
                       lat=-41.3455, lng=174.7597, severity="severe")
    """

def heartbeat(module_id: str) -> None:
    """Update modules.last_seen = now() for the health strip. run_every() calls
    this automatically each tick; call it yourself only in custom loops.

    Example: heartbeat("team-outage-watch")
    """

def ask_claude(
    prompt: str,
    *,
    system: str | None = None,
    model: str = "claude-haiku-4-5-20251001",
    max_tokens: int = 1024,
) -> str:
    """One-shot text call to Claude (team's spend-capped ANTHROPIC_API_KEY).
    Returns the response text. Loader-side only — never call from UI code.

    Example:
        label = ask_claude(f"Classify into flooding/outage/road-closure/other, "
                           f"reply with the label only: {headline}")
    """

def analyze_image(
    image: str | bytes | Path,          # https URL, local path, or raw bytes
    prompt: str,
    *,
    model: str = "claude-haiku-4-5-20251001",
    max_tokens: int = 1024,
) -> str:
    """Vision call to Claude (Claude covers text AND vision — no second AI vendor).

    Example:
        desc = analyze_image(photo_url, "Describe any storm damage visible. "
                                        "Reply 'none' if there is none.")
    """

def upload_file(
    path: str | Path,
    module_id: str,
    *,
    content_type: str | None = None,   # guessed from the extension when omitted
) -> str:
    """Upload to media/<module_id>/<filename> in the shared bucket and return the
    public URL (put it in publish_signal(media_urls=[...])). Max 10 MB.

    Example:
        url = upload_file("shot.jpg", "team-intake")
    """

def geocode(place_name: str) -> tuple[float, float] | None:
    """Wellington-region place lookup → (lat, lng), or None if not found.
    Built-in gazetteer of Wellington suburbs/landmarks first, then a rate-limited
    Nominatim fallback biased to the Wellington region. Cache your results.

    Example:
        latlng = geocode("Ōwhiro Bay")   # (-41.3455, 174.7597)
    """

def run_every(
    seconds: float,
    fn: Callable[[], object],
    *,
    run_immediately: bool = True,
) -> NoReturn:
    """Polling loop: call fn(), heartbeat(), sleep, repeat, forever. ENFORCES A
    5-SECOND MINIMUM INTERVAL — values below 5 are clamped to 5 with a printed
    warning (one hot loop must not flood the shared feed/map/realtime channel).
    Exceptions from fn() are caught, logged, and the loop continues.
    Ctrl-C exits cleanly.

    Example:
        run_every(60, poll_feed)   # poll once a minute
    """
```

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

Default export of `defineModule({...})`, shape per `ModuleManifest` (§5). Constraints
enforced by `moduleManifestSchema` at `pnpm gen` time:

- `id`: kebab-case (`^[a-z0-9][a-z0-9-]*$`) and **must equal the folder name** — it is the
  `module_id` on signals and the storage prefix.
- `name` ≤ 60 chars, `icon` = a lucide icon name (kebab-case), `description` ≤ 300 chars, `problem` ∈ 1–5.
- `ui` optional: `() => import("./ui")` where `ui/index.tsx` default-exports a React
  component. Omit for data-only modules (they get a generated page: description, health,
  filtered map + feed).
- `mapLayer` optional: `{ signalTypes: string[]; color: "severity" | <token name> }`.
  Accepted but **not yet consumed** this event — SignalMap plots every located signal.
- `feedCard` optional: `"default"` or a component receiving `{ signal }`. Accepted but
  **ignored** this event — SignalFeed always renders the standard SignalCard.

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
