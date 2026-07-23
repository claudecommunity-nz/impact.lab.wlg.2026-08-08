# Implementation Plan: WCC Emergency Management Civic Hackathon
## Technical Foundation — Plugin-Based Monorepo, Shared Platform Services & Day-of Enablement

**Version:** 4.2 · **Date:** 23 July 2026 · **Event:** Friday 8 August 2026, Waimanga Room · **Status:** For organiser review (revised after adversarial review)

---

## 1. Executive Summary

This document sets out the technical foundation for the one-day civic hackathon run alongside Wellington City Council Emergency Management on **8 August**. Teams (capped at 10) each build a module against one of five genuine operational problem statements, and every module plugs into an organiser-built core: a common operating picture dashboard (live MapLibre map + realtime feed of emergency "signals") backed by one shared Supabase project.

The architecture, following research into current (2026) plugin patterns for Next.js monorepos:

1. **One monorepo, "filesystem plugins."** Each team's module is a folder that registers with the core via a manifest (`module.config.ts`). A codegen script discovers all manifests and generates the registry; the dashboard automatically renders every module's tile, page, and health status. Modules are semi-independent but standardised: they consume shared capabilities (file upload/viewing, auth, map, signal feed, design tokens) from a small, stable **plugin SDK** and never touch core internals.
2. **"Python for data, TypeScript for pixels."** All ETL/data loaders are Python (WCC's production preference), living in each module's `loader/` folder and managed as one **uv workspace** (single lockfile, shared `wcc-impact-platform` helper package). Module UIs and the core platform are TypeScript/React/Next.js. The contract between the halves is the shared Supabase `signals` table.
3. **Build-time UI composition, runtime control.** Module UIs compile into the one dashboard app (dynamic import + per-module error boundaries — a broken module page can only break itself). A `modules` database table carries the runtime half: registration metadata, health, and an **`enabled` kill-switch** so organisers can feature-flag a misbehaving module off the dashboard without redeploying. Module Federation was evaluated and rejected: the official Next.js plugin is deprecated (EOL ~end 2026) and never supported the App Router.
4. **One shared Supabase project (Pro for the event):** signals table + modules registry + one `media` storage bucket with per-module path-prefix RLS (`media/<module_id>/...`). Every loader receives a unique, revocable `MODULE_TOKEN`; RLS resolves its hash to exactly one module and applies the same ownership check to signals, registry heartbeats, storage, and declared tables. Public reads remain open, browser writes use assigned Supabase Auth users, and no module credential enters client JavaScript.
5. **Claude Code-first enablement:** skills (including the five SME-owned dataset skills built with Alex), AGENTS.md, and a scaffold command that generates a compliant module in one shot — because the manifest + SDK pattern is exactly the kind of convention AI assistants follow reliably.
6. **Handover:** every module folder carries a pre-structured README whose sections feed the per-solution implementation docs Chris and Adam owe WCC. Whether module folders are additionally extracted into standalone per-team repos is a post-event decision, deliberately out of scope for the build.

The design optimises for one metric: **a team goes from scaffold to seeing their first signal on the shared live dashboard in under 15 minutes — and their module tile appears in the core UI the moment they register.**

---

## 2. Confirmed Event Parameters (from 22 July meeting)

| Parameter | Value | Technical implication |
|---|---|---|
| Date | Friday 8 August 2026 | ~2.5 weeks of build time; timeline in Section 14 |
| Venue | Waimanga Room (L1), cap 120; breakouts ~10, one ~20 | Dashboard on main-room screen; teams fit breakouts |
| Participants | ~50 building + 20–30 floating; **teams capped at 10** | 10 module slots; scaffold pre-tested at that scale |
| Build window | 9:30am–4:00pm (submission), lunch 12:30 | ~6 hours effective; near-instant quickstart mandatory |
| Demos | 4:00–5:00pm, awards 5:30 | Module freeze ~3:45; dashboard is the showcase backdrop |
| Data | **Publicly available datasets only** (CE condition) | Open sources live; scenario engine replays the rest |
| Deliverable | Working modules + handover docs, toward WCC production stack (**Python or C#/.NET preferred**) | Python loaders + per-module README handover sections; per-team repo extraction deferred to a post-event decision |
| Post-event | Chris + Adam document each solution for WCC | README handover template per module folder |
| SMEs | 4–5 WCC SMEs; each problem statement has a dedicated owner | SMEs validate their problem's dataset skill |
| Funding | No funds transfer between Anthropic and WCC | Vendor costs sit on the Anthropic side (Section 15) |
| Comms | "alongside WCC"; Rebecca reviews promo | Banner + README framing uses "alongside" |

---

## 3. Architecture Decision: How Modules Plug In

### 3.1 Patterns evaluated

| Pattern | Verdict |
|---|---|
| **Build-time convention registration** — manifest per module folder, codegen registry, dynamic import into the core app | **CHOSEN.** Zero runtime infrastructure, standardised look guaranteed (modules render inside the core shell with core tokens), fast refresh works across workspace packages, and Claude Code scaffolds it in one shot because it's pure convention |
| Module Federation / micro-frontends | Rejected. The official `nextjs-mf` plugin is deprecated with EOL around end-2026 and never supported the App Router; the maintainers' own guidance is not to use Next.js for federation |
| Next.js Multi-Zones (separate apps stitched via rewrites) | Rejected as primary. 10 separate Next apps = 10 deployments, 10 configs, no shared auth/theming context, deploy crunch reborn |
| Iframe composition (module registers a URL; core embeds it) | **Kept as the escape hatch only.** Right for a team that outgrows the sandbox, wrong as the default: loses shared auth context, design tokens, and the standardised feel |
| Runtime ESM loading from URLs | Rejected. Fragile, un-debuggable under time pressure, fights Next's compiler |

### 3.2 The chosen model in one paragraph

Each module is a **pnpm workspace package** in `modules/<team>/` containing a manifest, an optional UI component, and a Python loader. `pnpm gen` globs every `module.config.ts` into a generated registry file — **gitignored and regenerated automatically on every dev, build, and CI run**, so ten teams merging concurrently can never conflict on it (a committed generated file would conflict on every concurrent module PR). The dashboard reads the registry to render navigation and mounts each module's UI at `/modules/[id]` via `next/dynamic` (`ssr: false`, in a client-component wrapper — the App Router requires one) inside a **per-module error boundary** — a crashing module shows an error card on its own page while the map, feed, and every other module stay up. Because module packages are consumed as source, editing a module hot-reloads the running dashboard (Turbopack transpiles workspace packages automatically; `transpilePackages` covers the webpack fallback — we pin **Next.js 15**, where this behaviour is stable). At runtime, a `modules` table in Supabase holds registration, health, and the per-module `enabled` flag: the kill-switch that removes a misbehaving module from the UI instantly, no redeploy.

---

## 4. Module Anatomy & Manifest

### 4.1 Folder shape

```
modules/team-outage-watch/
├── module.config.ts        # THE manifest (below)
├── package.json            # name: @modules/team-outage-watch (workspace package)
├── ui/
│   └── index.tsx           # optional: default-exported React component
├── loader/                 # Python ETL — runs standalone, writes signals
│   ├── pyproject.toml      # uv workspace member; depends on wcc-impact-platform
│   └── src/main.py
└── README.md               # pre-structured handover doc (fill-in sections)
```

### 4.2 The manifest (`module.config.ts`)

```ts
import { defineModule } from '@wcc-impact/plugin-sdk';

export default defineModule({
  id: 'team-outage-watch',            // = folder name; used as module_id on signals & storage prefix
  name: 'Outage Watch',
  icon: '📡',
  description: 'Detects telecommunications outages from public status feeds',
  problem: 3,                          // which WCC problem statement (1–5)
  ui: () => import('./ui'),            // optional — omit for data-only modules
  mapLayer: {                          // optional — contribute to the SHARED map
    signalTypes: ['outage'],           // which of this module's signals to plot
    color: 'severity',                 // or a fixed token colour
  },
  feedCard: 'default',                 // or a custom renderer export for this module's signals
});
```

Manifest design borrows the proven shape of Backstage/Grafana-style plugin manifests, cut down to a one-day surface: identity, placement, an optional page, an optional map-layer contribution, an optional feed-card customisation. Nothing else. `defineModule` gives full type-checking and autocompletion, which is also what lets Claude Code generate a valid manifest first try.

### 4.3 What "registering" does

On first loader run (or `pnpm register`), the module upserts its manifest metadata into the `modules` table. From that moment:

- its **tile appears in the dashboard nav** (the registry table is realtime — no rebuild, no refresh)
- its **health strip entry** goes live (last-seen signal, count, loader heartbeat)
- its signals are attributed, filterable, and colour-coded on the shared map
- its storage prefix `media/<id>/` is valid for uploads
- organisers can toggle `enabled` off/on at any time

Modules with no UI get a generated page for free: description, health, and a live filtered map + feed of their own signals. Modules with a UI get their component mounted in the core shell — inheriting nav, theming, auth context, and tokens, which is what makes ten teams' work feel like one product at demo time.

---

## 5. The Plugin SDK (`@wcc-impact/plugin-sdk`)

The single package module UIs are allowed to import. Small on purpose — a stable, documented surface means the core can evolve all week without breaking anyone, and teams (and Claude Code) have exactly one API to learn.

| Export | What it gives a module |
|---|---|
| `defineModule(config)` | Typed manifest helper (Section 4.2) |
| `useSignals(filter?)` | The signal store. **One shared realtime subscription lives in the core provider**; module pages consume from context with client-side filtering (`{ moduleId, signalType, since }`). Ten module pages never open ten Supabase channels |
| `useUser()`, `<SignIn />` | Supabase Auth context provided by the core shell — optional, for concepts needing identity (e.g. triage verification) |
| `<SignalMap />` | The shared MapLibre map (Wellington defaults, severity colouring, popups). Modules pass signals or a filter; they never own a map instance |
| `<SignalFeed />`, `<SignalCard />` | Standardised feed rendering; custom feed cards register via the manifest |
| `<FileUpload moduleId />`, `<FileGallery moduleId />` | Standardised upload/view against the shared `media` bucket, automatically scoped to the module's path prefix |
| `uploadFile(file)` (TS) | Programmatic upload → public URL for `media_urls` |
| Design tokens | Tailwind v4 preset + core CSS variables. Module UIs style with tokens; the shell guarantees the standardised look |

Rules enforced by convention + lint: module UIs import **only** from `@wcc-impact/plugin-sdk` (and React); never from `apps/dashboard` internals; never open their own realtime channels; never touch `.env` secrets (browser code has none to touch). The SDK and `wcc_impact` attach the event write token (from the gitignored `.env`, distributed at check-in) to every write automatically — teams never handle it directly.

The Python mirror — `wcc-impact-platform` — is the loader-side equivalent: `publish_signal()`, `register_module()`, `heartbeat()`, `ask_claude()`, `analyze_image()`, `upload_file()`, `geocode()`, `run_every()`. Same names, same concepts, language-appropriate.

---

## 6. Repository Structure

```
wcc-emergency-hack/
├── AGENTS.md / CLAUDE.md          # CLAUDE.md line 1: @AGENTS.md
├── pnpm-workspace.yaml            # apps/*, modules/*, packages/*
├── pyproject.toml                 # uv WORKSPACE ROOT (virtual): members = modules/*/loader, packages/wcc-impact-platform-py
├── uv.lock                        # one lockfile for all Python loaders
├── .claude/skills/                # core + 5 dataset skills (Section 11)
├── .github/workflows/ci.yml
├── apps/
│   ├── dashboard/                 # Core Next.js 15 app: shell, map, feed, /modules/[id], health strip, admin kill-switch
│   │   └── registry.gen.ts        # CODEGEN output — gitignored, regenerated every dev/build/CI run
│   └── scenario/                  # Scenario engine (scripted storm replay feeds)
├── packages/
│   ├── plugin-sdk/                # @wcc-impact/plugin-sdk (Section 5)
│   ├── shared/                    # Signal types (zod) generated/checked against schema/signal.schema.json
│   ├── ui/                        # Core-internal components + Tailwind preset (SDK re-exports the public parts)
│   └── wcc-impact-platform-py/          # Python helper package (uv workspace member)
├── modules/
│   ├── _template/                 # The scaffold source (manifest + hello UI + hello loader)
│   └── team-*/                    # One folder per team (Section 4.1)
├── supabase/                      # Supabase CLI project: config.toml + migrations/ — the DDL/RLS
│   └── migrations/                #   source of truth; `supabase start` = local stack (organisers/CI only)
├── schema/
│   ├── signal.schema.json         # SINGLE SOURCE OF TRUTH for the signal contract
│   └── schema.sql                 # readable snapshot generated from supabase/migrations — never hand-applied
├── scripts/
│   ├── gen-registry.ts            # Globs modules/*/module.config.ts → registry.gen.ts
│   └── new-module.ts              # pnpm new-module <id> → scaffold from _template
└── docs/quickstart.md
```

- **JS side:** plain pnpm workspaces, no Turborepo/Nx — one consuming app and source-consumed packages don't need orchestration; every tool added is a tool that can confuse a beginner at 9:45am.
- **Python side:** a **uv workspace** rooted at the repo — every `modules/*/loader` and `packages/wcc-impact-platform-py` are members sharing one lockfile and one `.venv`. `uv sync` once at setup; `uv run --directory modules/team-x/loader --package team-x-loader python -m src.main` runs any loader; every loader imports `wcc_impact` as an editable workspace dependency. This is the current standard for exactly this shape (a shared library consumed by many small apps).
- pnpm and uv coexist cleanly: pnpm only treats folders with `package.json` as packages; `loader/` folders don't have one.

---

## 7. Data Layer (Supabase)

### 7.1 Tables

`signals` — unchanged from v3 (full DDL in `schema/schema.sql`): id, timestamps (created/observed/reported), source, source_type (official/community/media/sensor), signal_type, title, description, lat/lng/place_name, severity (CAP-aligned), verification, confidence, link, media_urls, module_id, raw jsonb. RLS: INSERT requires a credential assigned to the same registered, **`enabled`** `module_id` — so one team cannot impersonate another and the kill-switch stops a misbehaving loader, not just its tile — plus guardrails (length caps); anon SELECT; the owning authenticated user can update verification. Realtime enabled.

`modules` — the runtime registry:

```sql
create table public.modules (
  id           text primary key,        -- folder name / module_id
  name         text not null,
  icon         text,
  description  text,
  problem      int check (problem between 1 and 5),
  enabled      boolean not null default true,   -- ORGANISER KILL-SWITCH
  last_seen    timestamptz,                     -- loader heartbeat
  updated_at   timestamptz not null default now()
);
-- RLS: registration/heartbeat require a credential owned by this module. The enabled
-- column remains service-role-only (organisers) — flipped in Supabase
-- Studio, so there is no admin page to build or secure. anon SELECT. Realtime enabled.
```

The dashboard renders only `enabled = true` modules. Build-time registry (components) + table (metadata/health/flags) is the hybrid that gives both compile-time safety and runtime control.

### 7.2 Storage

One shared **`media` bucket**, public-read, with path-prefix write policies using Supabase's storage helper functions: INSERT requires a credential owned by `(storage.foldername(name))[1]` and that module must be registered and enabled; uploads are capped at 10 MB. (The bucket is public-read, hence the kickoff privacy rule in Section 12.2.) The SDK's `<FileUpload moduleId />` and `upload_file()` write to `media/<module_id>/...` automatically. (Folders in Supabase Storage are pure key prefixes — this is the standard scoping pattern.)

### 7.3 Realtime

Postgres Changes on `signals` and `modules`, consumed by **one** subscription in the core provider and fanned out via React context (`useSignals`). With a single primary subscriber the per-subscriber authorization cost of Postgres Changes is negligible and no triggers are needed. If the showcase dashboard will be audience-accessible on many phones, revisit Broadcast-from-Database beforehand (Section 15 threshold).

### 7.4 Local stack — organisers and CI only

The repo is a Supabase CLI project: `supabase/migrations/` is the source of truth for all DDL, RLS, storage policies, and realtime config; the same migrations are applied to the live project *and* the standby via `supabase db push`, so the recovery env-swap is guaranteed schema-identical. `supabase start` gives organisers the full local stack (Docker) for iterating on schema and credential policies without touching live data, and **CI applies the migrations to an ephemeral local stack and proves own-module writes succeed while missing, cross-module, rotated, revoked, and disabled credentials fail on every core PR.**

Deliberately **not** offered to participants, and not in the quickstart: the shared live dashboard is the product (a signal published to a local database never reaches the big screen), the local stack is a multi-gigabyte image pull that venue WiFi cannot absorb, and Docker Desktop on managed WCC Windows laptops is a support tarpit. The participant path is cloud-only; platform outage is covered by the standby project, not by local databases.

### 7.5 Keys & tier

**`.env.example` rule — no secrets, ever.** The committed `.env.example` contains exactly two real values, both public-by-design: `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`. Everything else is an **empty placeholder with a comment** (`MODULE_TOKEN=` / `ANTHROPIC_API_KEY=` — *"from your check-in card"*). The DB password, service key, and real per-team tokens exist only in organisers' secret store and teams' gitignored `.env` — never in a committed file. CI greps `.env.example` for known secret prefixes (`sb_secret_`, `sk-ant-`, `postgresql://`) as a tripwire.

The publishable key (`sb_publishable_...`) is pre-filled in `.env.example` and safe to commit because it carries no write authority by itself. Each team's `MODULE_TOKEN` is sent only by its Python loader; the database stores its SHA-256 digest, resolves it to one module, and rejects cross-module writes. Rotation or revocation affects one team immediately without an app redeploy. Browser code never reads a module token: signed-in write surfaces rely on a server-assigned `app_metadata.module_id` claim. The service key remains organiser-only. A bounded shared-token migration window exists only for staged cutover and is disabled by default. **Pro tier from 1 Aug** (no idle pause, daily backups, 500 realtime connections headroom), downgrade after. Standby project with schema pre-applied; recovery = one env-var swap followed by credential reprovisioning.

---

## 8. Python Loaders — The ETL Rule

**All data loaders/pipelines are Python.** Stated as a rule at kickoff and in AGENTS.md: *"Loaders and pipelines: Python. UI: TypeScript. The contract between them is the signals table."*

- Loaders run as plain processes — locally during the day (`uv run ... ` with `run_every()` polling loops). No serverless dependency: Supabase Edge Functions are Deno/TypeScript-only with no native Python execution, which is fine because loaders never needed to live there.
- `wcc_impact` (Python) provides the full helper surface (Section 5) including `ask_claude`/`analyze_image` via the pre-installed Anthropic SDK — Claude covers text *and* vision, so there is no second AI vendor. **One spend-capped key per team** (plus an organiser spare), handed out on the check-in card and revoked on the evening of the 8th: per-team caps mean one team's enthusiasm can't drain the room's budget, ten keys sidestep single-key rate limits when every team demos AI features at once, and a misused key is revoked without collateral damage.
- `run_every()` enforces a **minimum interval (5 s)** — one hot polling loop must not be able to flood the shared feed, map, and realtime channel for all ten teams. Belt-and-braces with the RLS rule that inserts require an `enabled` module: disabling a module actually silences it.
- **Production note for handover docs:** Supabase is the database/realtime layer; Python services run wherever WCC runs Python (Azure Functions / Container Apps being the likely fit). Each module README's production section says this explicitly.
- UI-heavy concepts (community intake, triage queue) keep the rule intact: their processing is Python; their interface is a TS module UI built on the SDK (`<FileUpload>`, `useSignals`, `useUser` cover most of what problems 2 and 4 need out of the box).

---

## 9. Git Workflow, CI & Deploy Resilience

Single monorepo, team-owned folders, continuous CI-gated merges (the per-team-repo model from v3 is superseded; the deliverable is met by post-event extraction):

| Concern | Approach |
|---|---|
| Access | GitHub org; participants invited T-3 days; repo **public** (branch protection + CODEOWNERS need public on the free tier; public suits a civic event) |
| Ownership | Teams work only in `modules/<team>/`; CODEOWNERS: `modules/team-x/ @org/team-x`, everything else `@org/organisers`. **Required reviews apply only to non-module paths** — a team PR touching only its own folder needs green CI, not peer approval (first-time git users shouldn't queue on review mechanics) |
| Merge flow | Team branches → PR → CI → squash merge, continuously during the day. Disjoint folders + a gitignored generated registry ⇒ conflicts structurally rare. **UI merge freeze 15:00** so the CI queue clears with runway before demos; floating mentors triage red PRs on sight — "my PR is red and I don't know why" is a planned support load, not an exception |
| CI (required) | `pnpm gen` (manifests valid, registry builds) → lint → typecheck → contract smoke test (loader's `sample()` output validates against `signal.schema.json`; `uv run pytest` on the loader) → **dashboard build including the module's UI** (catches a deploy-breaking UI before merge) |
| Deploy | One Vercel Pro project builds `apps/dashboard` from `main` on merge. Live signal data never depends on deploys (loaders → Supabase directly), so a red build never blocks a team's data demo. **Demos run from a dashboard served locally on the projector machine** (synced to `main` after the 15:00 freeze, same live Supabase data) — the deployed site is the public mirror, never demo-critical |
| Broken module, post-merge | Three-layer containment: error boundary (runtime), `enabled=false` kill-switch (instant UI removal), organiser revert of the merge (build). Emergency: `pnpm gen --exclude team-x` |
| Why merging still matters | A merged module's UI tile goes live in the deployed dashboard — visible payoff, steady incentive, never a blocker |
| Handover | Per-module README handover sections feed Chris + Adam's implementation docs for WCC; whether module folders are additionally extracted into standalone per-team repos is decided after the event (out of scope for the build) |
| Licence | MIT at root |

---

## 10. Scenario Engine & Data Sources

Public data only (CE condition). Live open sources: **GeoNet** (CC BY; GeoJSON + CAP), **NZTA** Traffic & Travel, **WCC open data portal** (hazard layers) / GWRC, **RNZ/Stuff/Wellington Scoop RSS**, other councils' open data where useful. Licensed/impractical sources (MetService warnings, social media) are replayed by the **scenario engine**: a scripted southerly-storm timeline across the day —

- ~10:00 watch → warning · ~11:00 social posts: waves over the road at Ōwhiro Bay · ~12:30 telco outage · ~14:00 flooding reports, access road closes · ~15:30 peak as demos approach

— served as mock weather + social feeds from one timeline JSON, with a `?t=` fast-forward for development. The engine is stateless (timeline JSON + wall clock), so it **deploys as route handlers inside the same Vercel project** — no organiser laptop in the critical path of the day's story. Live open sources get the same treatment in reverse: a day of real GeoNet/NZTA/RSS responses is **cached into the repo as replayable fixtures**, so an upstream outage on the day degrades to replay, not to zero. Every team ingests the same unfolding story; the dashboard peaks on cue for the showcase. Beats sanity-checked with Alex (Phil on leave from the 29th).

---

## 11. Skills & AI-Assistant Context

`.claude/skills/` in the repo root + `AGENTS.md` (`CLAUDE.md` = `@AGENTS.md`, line 1). The scaffold + manifest + SDK convention is precisely what lets Claude Code produce a compliant module in one shot — the skills make the conventions explicit:

**`AGENTS.md` is the system contract**, written so a participant — or their AI assistant — understands exactly how the platform works in one read, before touching anything: (1) the architecture in one paragraph — your module is a folder with a manifest; the core discovers it, renders your tile, and mounts your UI; the `signals` table is the contract between your Python loader and everything else; (2) the module lifecycle — scaffold → register → first signal → tile live → UI merged; (3) the golden-path commands from the quickstart; (4) the rules — loaders in Python, UI in TypeScript; module UIs import only `@wcc-impact/plugin-sdk`; never open your own realtime channel; your module token and team AI key live in `.env` and never in code; work only inside `modules/<your-team>/`; (5) what runs where — loaders on your machine, dashboard on Vercel, data in shared Supabase (the local Supabase stack is organiser/CI-only); (6) pointers into the skills for depth. Every rule the platform enforces by RLS, lint, or CI is stated here in plain language first — nothing should ever fail for a reason AGENTS.md didn't warn about.

**Core skills:** `platform-overview` (the AGENTS.md mental model in skill form — how registration, signals, realtime, storage, and the kill-switch actually work end-to-end, so Claude Code can answer "why isn't my tile showing?" correctly), `create-module` (runs `pnpm new-module`, walks the manifest), `signal-schema` (references `schema/signal.schema.json` + generated types — never duplicates), `publish-signals`, `plugin-sdk` (the full SDK surface with examples: useSignals, SignalMap, FileUpload, map layers, feed cards), `loader-patterns` (uv workspace, run_every polling, politeness to public APIs), `ai-claude` / `ai-vision` (classification into signal fields, dedupe, photo triage; loader-side only), `geocoding` (Wellington place lookup + fallback), `scenario-feeds` (mock feed shapes, `?t=`), `demo-prep`.

**Dataset skills — one per problem statement** (built by Chris with Alex's verified field lists, validated by each problem's SME): 1) warnings + hazard layers + GeoNet CAP + NZTA; 2) intake patterns — signal schema as the form contract, Storage for photos, auth for acknowledgement; 3) scenario social feed + RSS + corroboration → confidence; 4) reading the signals table itself, dedupe/triage with ask_claude, the verification policy; 5) Pōneke Travel Insights extract (limitations surfaced) + NZTA counts + baseline-vs-now patterns. All teams get all five — problem statements may be refined on the day and no team should be strandable.

---

## 12. Day-of Operations

### 12.1 Quickstart (target: first signal in < 15 minutes)

```
1. Clone (or open the repo Codespace — devcontainer includes Node 22, pnpm, uv, Python 3.12)
2. pnpm install && uv sync
3. cp .env.example .env                 # Supabase URL + publishable key prefilled; module token + your
                                        #   team's Anthropic key typed in from the check-in card — the
                                        #   only secrets that exist, and they never touch the repo
4. pnpm new-module team-<name>          # scaffold: manifest + hello UI + hello loader
5. uv run --directory modules/team-<name>/loader --package team-<name>-loader python -m src.main
6. Your tile + first signal appear on the big-screen dashboard
7. pnpm dev → edit ui/index.tsx with fast refresh; Claude Code + skills from here
```

Codespaces from **personal** accounts (org-owned Codespaces bill the org from the first core-hour; personal free quota 120 core-hours/month). **Prebuilds enabled on the repo** so a fresh Codespace opens with `pnpm install` + `uv sync` already baked — the <15 min target does not survive a cold monorepo install over venue WiFi. Local setup is tested on Windows too (WCC-managed laptops), and the T-1 email asks everyone to run install once from home.

### 12.2 Schedule fit

8:00 check-in verifies org access + Codespace/clone per team, hands over the card (team-specific module token + team Anthropic key) · 9:00 kickoff: live scaffold→first-signal demo, SDK tour, SME dataset-skill intros, scenario concept reveal (not the beats), and the privacy rule — **no real faces, names, or addresses in test submissions; the media bucket is public-read** · 9:30 hacking, scenario clock starts · 12:00 checkpoint: every team has a signal live or a mentor comes to them (health strip makes it visible) · 12:30 lunch + lightning demos off the live dashboard · **15:00 UI merge freeze** — last dashboard merges; the CI queue needs the runway; loaders keep publishing signals · ~15:30 scenario peak; projector machine syncs `main` and serves the demo dashboard locally · 16:00 submission: README handover section complete · 16:00–17:00 demos from the dashboard — each team walks their tile → their page, **~4 minutes each** (stated in the run sheet: ten teams, one hour, no slack) against judging criteria published in advance · 17:30 awards.

### 12.3 Failure modes & mitigations

| Failure | Mitigation |
|---|---|
| Venue WiFi | Loaders need only outbound HTTPS; Codespaces moves compute off laptops; prebuilds + install-from-home (T-1 email) cut day-of bandwidth |
| DB spam / internet abuse | Per-module credentials prevent cross-team writes; kill-switch/revocation blocks the owning module immediately, with a `run_every` 5 s floor and Pro backups |
| Rogue/offensive content on the big screen | Writes are credential-attributed by `module_id`; kill-switch removes the tile **and** silences inserts; organisers spot-check feed + media bucket |
| AI budget drained | Per-team spend-capped keys — one team can't drain the room; in-helper rate limit; organiser spare key held back |
| Module UI crashes | Error boundary (page-level) → `enabled=false` kill-switch (instant) → revert (build) |
| Broken merge breaks deploy | CI dashboard-build check pre-merge; live data unaffected regardless |
| Secrets | Nothing sensitive is committed: the publishable key is public-by-design; per-module credentials + per-team Anthropic keys exist only on printed check-in cards and gitignored `.env` files; UI code has no module secrets; all keys are revoked after the event |
| Supabase/Vercel outage | Standby project (env-swap); dashboard runnable locally on the projector machine |
| Team stuck at zero | Health strip + midday checkpoint + floating mentors; dataset skills mean the first prompt knows the data |
| Next 16/Turbopack workspace quirks | Pinned to Next 15; webpack fallback verified in the dry run |

---

## 13. What Organisers Pre-Build

1. Supabase (Pro from 1 Aug): schema as CLI migrations (signals + modules + storage policies **including per-module write isolation**) pushed to live **and standby** from the same source; own/cross/rotated/revoked/disabled RLS cases verified against the local stack in CI; realtime on, seed data.
2. Core dashboard: shell, map, feed, `/modules/[id]` (dynamic + error boundaries), health strip, disclaimer banner (*"Hackathon prototype built alongside Wellington City Council — not real emergency information. In an emergency call 111."*), nearby same-type signal clustering. Kill-switch is operated by flipping `enabled` in **Supabase Studio** (service role) — no admin page to build, deploy, or secure; a dashboard admin page is an explicit nice-to-have behind the cut-line.
3. `@wcc-impact/plugin-sdk` + `wcc-impact-platform` (Python) — full surfaces per Section 5, each helper with a working example.
4. Registry codegen, `pnpm new-module` scaffold, `_template` proven end-to-end (scaffold → signal on hosted dashboard → tile live).
5. Scenario engine: timeline authored (checked with Alex), replay live, `?t=` working, deployed inside the Vercel project; live-source (GeoNet/NZTA/RSS) responses cached as replayable fixtures.
6. Skills (core incl. `platform-overview` + 5 dataset), AGENTS.md written as the system contract (Section 11) and **tested by prompt**: a fresh Claude Code session in the repo must correctly answer "how do I get my data onto the dashboard?" from AGENTS.md + skills alone; quickstart; CI with all five gates; deliberate bad-schema PR and broken-UI PR both confirmed to fail.
7. Vercel Pro deploy verified (realtime + storage in production); devcontainer/Codespace **with prebuilds** tested from a fresh personal account; local install tested on Windows.
8. Per-team module credentials and Anthropic keys created and capped (plus organiser spare); check-in cards printed (module token + team key + quickstart QR); revocation reminder for the 8th evening.
9. Judging criteria and code of conduct published with the run sheet (Rebecca will ask; councils expect both).
10. **Naive-user dry run (6 Aug): scaffold → first signal < 15 min, module UI live < 1 hour.**

**Cut-line (agreed now, not at 11pm on 5 Aug).** The build week has zero slack, so the drop order is pre-agreed — drop-if-behind, in order: custom feed-card renderers → `<FileGallery>` → map clustering → dashboard admin page (already out) → scenario `?t=` polish. Never on the block: scaffold → first signal path, registry codegen, map, feed, RLS/token policies, kill-switch procedure, per-team keys, dry run.

---

## 14. Timeline (from 22 July)

| Date | Milestone |
|---|---|
| 23–24 Jul | Promo → Julia → Rebecca. **`signal.schema.json` v1 draft** (freezing before seeing the real datasets is how schemas get unfrozen). Repo skeleton: workspaces (pnpm + uv), schema draft, SDK stubs |
| 25 Jul | Promo out; WCC participant names; run sheet shared (incl. judging criteria + code of conduct); **Alex's dataset list received** (critical path for dataset skills *and* the schema freeze) |
| 26–27 Jul | **Schema v1 frozen against the actual dataset list**; zod + pydantic + SQL locked and CI-checked |
| 28 Jul–1 Aug | Core build: dashboard, SDK, wcc-impact-platform, scaffold, scenario engine. Phil on leave — Alex is sole WCC contact (bus-factor risk: if Alex slips, invoke the cut-line, not the calendar) |
| 1 Aug | Supabase → Pro. Dataset skills v1 SME-validated (via Alex) |
| 4–5 Aug | Deploy to Vercel Pro; end-to-end test; kill-switch + error-boundary drills (break a module on purpose) |
| 6 Aug | **Naive-user dry run**; fix everything they hit; scenario beats finalised |
| 7 Aug | Freeze platform; T-1 email (GitHub access, "open the Codespace once"); print quickstart/QR cards; standby verified |
| 8 Aug | Event. Morning: Supabase healthy, dashboard up, per-team module/AI keys live, scenario clock started, seed visible. Evening: revoke all module + AI keys, snapshot DB, wipe person-identifying test data |
| Week after | Downgrade tiers; per-solution implementation docs with Adam for WCC; decide then whether per-team repo extraction adds anything to the handover |

---

## 15. Budget & Thresholds (Anthropic side — no WCC funds transfer)

| Item | Cost |
|---|---|
| Supabase Pro (1 month) | ~US$25 |
| Vercel Pro (1 month, 1 seat) | ~US$20 |
| Anthropic API credit (10 per-team capped keys + organiser spare) | ~US$100 total cap (~US$50–75 expected spend) |
| GitHub / Codespaces (public org; personal quotas; prebuild storage negligible) | Free |
| **Total** | **~US$145 cap (~US$95–120 expected)** |

**Thresholds that change the plan:** audience-on-phones showcase at hundreds of concurrent viewers → Broadcast-from-Database for dashboard realtime · repo must be private → GitHub Team required for branch protection · repeated module-credential abuse or client-held credentials become unacceptable → inserts behind an identity-aware Edge Function.

---

## 16. Caveats

- Vendor limits/pricing shift; reconfirm the week before. Next 16 + Turbopack has open issues around workspace-package transpilation — hence the Next 15 pin and webpack fallback.
- MetService may permit limited event use if approached; plan assumes mocked warnings.
- Module-scoped tokens suit one controlled event, not long-lived production workloads. Handover docs point to workload identity or an identity-aware Edge Function for production.
- Community-report demos must not collect real personal details (kickoff privacy rule; bucket is public-read); submitted test data wiped after the event — noting that public URLs can be cached beyond our control, which is why the rule is *don't submit it*, not *we'll delete it*.
- The SDK surface is deliberately frozen small; anything a team asks for mid-event that the SDK lacks goes through the iframe escape hatch (`url` in the registry), not a hot SDK change.

---

## Appendix A — Pre-Event Checklist (condensed)

- [ ] `signal.schema.json` v1 draft 24 Jul; **frozen 26–27 Jul against Alex's dataset list**; zod + pydantic + SQL CI-checked against it
- [ ] Supabase: CLI migrations (schema + storage ownership + per-module credentials + RLS) pushed to live + standby from one source; own/cross/rotate/revoke/disable tests green against `supabase start` in CI; seed loaded; Pro from 1 Aug; env-swap + credential reprovisioning tested
- [ ] Dashboard: shell, map, feed, `/modules/[id]` + error boundaries, health strip, banner, clustering; kill-switch drill via Supabase Studio (tile disappears **and** inserts stop)
- [ ] `@wcc-impact/plugin-sdk` complete & documented (defineModule, useSignals single-subscription store, useUser, SignalMap/Feed/Card, FileUpload/Gallery, tokens)
- [ ] `wcc-impact-platform` (Python) complete (publish, register, heartbeat, ask_claude, analyze_image, upload_file, geocode, run_every with 5 s floor)
- [ ] uv workspace: root pyproject, members glob, one lockfile; `uv sync` clean in Codespace
- [ ] Codegen + `pnpm new-module` scaffold; `_template` proven end-to-end
- [ ] Scenario engine live **on Vercel**; beats checked with Alex; `?t=` works; live-source fixtures cached for replay fallback
- [ ] Skills: core set (incl. `platform-overview`) + 5 SME-validated dataset skills; AGENTS.md system contract written + fresh-session prompt test passed; CLAUDE.md = @AGENTS.md
- [ ] CI: registry gen, lint, typecheck, schema smoke test, dashboard build — bad-schema PR and broken-UI PR both fail; team-folder PRs merge on green CI without required review
- [ ] Vercel Pro deploy verified (realtime + storage); kill-switch and error-boundary drills done; projector machine runs the dashboard locally (demo path)
- [ ] Per-team module credentials + Anthropic keys created/capped; check-in cards printed (module token + team key + QR); revocation reminder set
- [ ] `.env.example` contains only `SUPABASE_URL` + publishable key + empty commented placeholders — no DB password, secret key, token, or connection string; CI secret-prefix tripwire green
- [ ] Cut-line list agreed among organisers (Section 13)
- [ ] Judging criteria + code of conduct published with run sheet
- [ ] Codespace **with prebuilds** tested from fresh personal account; local install tested on Windows
- [ ] **Naive-user dry run passed (6 Aug): scaffold → first signal < 15 min**
- [ ] T-3 email sent ("run install once from home"); invites accepted tracked; check-in desk process ready (incl. card handout)
- [ ] Morning-of: Supabase healthy, dashboard up, module + AI keys working, scenario started, seed visible; evening-of: all module + AI keys revoked
