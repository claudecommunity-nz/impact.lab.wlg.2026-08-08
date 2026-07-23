---
name: onboard-module-contributor
description: Orient a new contributor to the WCC Emergency Hack repository and take them from a fresh clone through credentials, local setup, module scaffolding, shared-Supabase development, validation, Git branching, and a pull request. Use when someone asks how the repo works, how to get started, how to build a team module, how to connect locally to Supabase, what access to request from an event organiser, or how to submit a module PR.
---

# Onboard a module contributor

Guide the contributor through the real repository workflow. Prefer executing safe
setup and validation steps for them when asked; otherwise give copyable commands and
checkpoints. Never invent, request in chat, print, or commit a credential.

## Start with the mental model

Explain these four facts before changing files:

1. A team owns one folder: `modules/<module-id>/`.
2. A Python loader registers the module and publishes rows to the shared `signals`
   table. The dashboard, map, feed, and health views consume those rows.
3. An optional React UI is mounted at `/modules/<module-id>` and may import only
   `react` and `@wcc-impact/plugin-sdk`.
4. The normal participant workflow uses the shared event Supabase project even while
   the dashboard and loader run locally. The Docker-backed local Supabase stack is for
   organisers, CI, RLS work, and core database changes.

Use these sources of truth when details are needed:

- `AGENTS.md` — repository rules and golden-path commands
- `docs/quickstart.md` — first signal in under 15 minutes
- `docs/CONTRACTS.md` — binding platform behavior
- `docs/generated/` — exact generated interfaces
- `.claude/skills/create-module/SKILL.md` — manifest and scaffold details
- `.claude/skills/loader-patterns/SKILL.md` — loader structure
- `.claude/skills/publish-signals/SKILL.md` — publishing and RLS troubleshooting
- `.claude/skills/plugin-sdk/SKILL.md` — module UI examples

## Establish scope safely

Before editing:

```sh
git status --short --branch
git remote -v
node --version
pnpm --version
python3 --version
uv --version
```

Preserve unrelated work. Do not stage or modify files outside the contributor's
module unless an organiser explicitly expands the scope. A normal team PR should touch
only `modules/<module-id>/`.

Choose the module id before requesting credentials. Require lowercase kebab-case,
normally `team-<name>`, and keep it stable because it becomes:

- the folder and manifest id;
- the `module_id` on signals;
- the loader credential owner;
- the media prefix; and
- the prefix for optional module-owned tables and edge functions.

## Request the right access

The public `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and their
`NEXT_PUBLIC_` dashboard mirrors are prefilled in `.env.example`. They are not
sufficient to write, but they are not team secrets either.

Ask an event organiser, out of band, for:

1. `MODULE_TOKEN` for the exact module id — required for loader registration,
   heartbeats, signal writes, module-table writes, and loader uploads.
2. `ANTHROPIC_API_KEY` only if the team will use `ask_claude()` or
   `analyze_image()`.
3. A Supabase Auth invitation and assignment to the module only if the browser UI
   must perform authenticated uploads or module-table writes.
4. The current public Supabase URL/publishable pair only if `.env.example` is missing
   or organisers announce that the event project changed.

Offer this message:

> Please provision module `<module-id>` and send its `MODULE_TOKEN` through the
> event's secure check-in channel. We also need a team Anthropic key if AI helpers
> are enabled. If our browser UI needs authenticated writes or uploads, please invite
> `<email>` in Supabase Auth and assign it to `<module-id>`.

Never ask a participant to obtain or use:

- a Supabase service-role key;
- `SUPABASE_DB_URL` or a production database password;
- a Supabase personal access token;
- a GitHub deployment token; or
- another team's module token.

Leave `EVENT_TOKEN` empty. Never create `NEXT_PUBLIC_MODULE_TOKEN`. Never paste a
credential into chat, source, a PR, an issue, a screenshot, or a command argument.

## Set up a fresh checkout

The Codespace contains the expected toolchain. For a local checkout, require Node 22+,
pnpm 10, Python 3.12, uv, and Git. Docker and the Supabase CLI are not required for the
normal participant path.

From the repository root:

```sh
pnpm install
uv sync
cp .env.example .env
```

Have the contributor place only their organiser-issued values in the gitignored root
`.env`:

```dotenv
MODULE_TOKEN=<received-out-of-band>
ANTHROPIC_API_KEY=<only-if-needed>
EVENT_TOKEN=
```

Check that `.env` remains ignored:

```sh
git check-ignore .env
git status --short
```

If `MODULE_TOKEN` is not available yet, continue with read-only dashboard/UI work but
stop before running a loader write. Ask the organiser instead of borrowing a token.

## Create a branch and scaffold the module

Start from an up-to-date `main` with a clean scope. Never discard existing changes to
get there.

```sh
git remote get-url origin
gh auth status
git switch main
git pull --ff-only
git switch -c <module-id>/initial-module
pnpm new-module <module-id>
uv sync
pnpm install
```

Confirm the contributor can push to `origin`. If not, use their fork as the writable
remote (for example, `gh repo fork --remote --remote-name fork`) or ask an organiser
for the event's preferred fork workflow. Do not discover the problem only after the
module is complete.

The scaffold creates:

```text
modules/<module-id>/
├── module.config.ts
├── package.json
├── ui/index.tsx
├── loader/
│   ├── pyproject.toml
│   └── src/main.py
└── README.md
```

Keep the scaffolded literal `contractVersion`. Ensure `module.config.ts` id equals the
folder name. Do not import dashboard internals or another team's package.

## Register and publish the first signal

After the organiser has provisioned the matching `MODULE_TOKEN`, run:

```sh
uv run --directory modules/<module-id>/loader \
  --package <module-id>-loader \
  python -m src.main
```

Confirm that:

- registration succeeds;
- the module appears in the dashboard;
- the first signal appears in the feed;
- a signal with `lat` and `lng` appears on the map; and
- no secret value appears in logs.

Use stable source identifiers as `idempotency_key` values. Keep loaders in Python and
UIs in TypeScript. Use the signal schema as the contract between them.

## Develop the UI locally

Run:

```sh
pnpm dev
```

Open `http://localhost:3000/modules/<module-id>`. The local dashboard reads the shared
event Supabase project using the public values from `.env.example`; the loader writes
with the team's module-scoped token.

Use `useSignals()` and other SDK exports. Never open a new realtime channel. Use public,
synthetic test media only—no real faces, names, or addresses.

If the module needs its own table, storage, or edge function, keep all files under
`modules/<module-id>/backend/`, declare tables in the manifest, and follow
`AGENTS.md`. Do not manually apply module DDL to the shared event database; a green
merge to `main` performs the protected deployment.

## Use the local Supabase stack only for organiser work

If the contributor merely wants to run the app locally, keep using the shared cloud
project. Do not make `supabase start` a participant prerequisite.

If the person is an organiser/core contributor testing migrations, RLS, Auth, or
deployment behavior:

1. Confirm Docker and the Supabase CLI are installed.
2. Confirm `supabase/config.toml` belongs to this repository.
3. Start the isolated local stack:

   ```sh
   supabase start
   supabase status
   ```

4. Use only the local API URL and anon/publishable key printed by
   `supabase status -o env` for local app processes.
5. Provision a local module credential with the local Postgres URL:

   ```sh
   SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
     bash scripts/module-credentials.sh provision <module-id>
   ```

6. Keep local credentials out of tracked files. Never point reset, migration, or
   credential-provisioning commands at production without explicit organiser authority.

State clearly that a signal published to the local stack will not appear on the event
big screen.

## Run the PR gate

Before staging, run the same relevant checks as CI:

```sh
pnpm gen
pnpm lint
pnpm typecheck
uv run --with jsonschema python .github/scripts/validate_sample.py <module-id>
pnpm --filter @wcc-impact/dashboard build
```

If `modules/<module-id>/loader/tests/` exists:

```sh
uv run --directory modules/<module-id>/loader \
  --package <module-id>-loader \
  --with pytest pytest tests
```

Then inspect scope:

```sh
git diff --check
git status --short
git diff -- modules/<module-id>
```

Do not stage `.env`, local outboxes, generated caches, media, or unrelated changes.
Stage the exact module directory and verify the index:

```sh
git add modules/<module-id>
git diff --cached --name-only
git diff --cached --check
```

Every staged path should begin with `modules/<module-id>/`. If a legitimate core change
is required, stop and ask an organiser; CODEOWNERS and CI intentionally treat it as a
different review path.

## Commit, push, and open the PR

Use an intentional commit:

```sh
git commit -m "feat(<module-id>): add initial module"
git push -u <writable-remote> HEAD
```

Open a draft PR first when work is still evolving:

```sh
gh pr create --draft --base main \
  --title "feat(<module-id>): add initial module" \
  --body "## What this module does
- <one-line outcome>

## Data source
- <source and polling cadence>

## Verification
- pnpm gen
- pnpm lint
- pnpm typecheck
- loader sample validation
- dashboard build

## Demo
- <how to run it and what to look for>"
```

If `gh` is unavailable, use the compare URL printed by `git push`. Mark the PR ready
only after CI is green and the module README explains setup, data source, limitations,
and the demo path. When using a fork, ensure the PR base is the event repository's
`main` branch and the head is the contributor's fork branch.

Finish by reporting:

- the module id and page URL;
- which credentials remain to be provided by an organiser;
- commands that passed or failed;
- the branch and PR URL; and
- any organiser action still required.
