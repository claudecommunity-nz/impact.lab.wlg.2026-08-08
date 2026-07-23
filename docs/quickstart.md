# Quickstart — first signal on the big screen in under 15 minutes

The seven steps. Everything else waits until step 7.

```
1. Clone (or open the repo Codespace — devcontainer includes Node 22, pnpm, uv, Python 3.12)
2. pnpm install && uv sync
3. cp .env.example .env                 # Supabase URL + publishable key prefilled; module token + your
                                        #   team's Anthropic key typed in from the check-in card — the
                                        #   only secrets that exist, and they never touch the repo
4. pnpm new-module team-<name>          # scaffold: manifest + hello UI + hello loader
5. uv run --directory modules/team-<name>/loader --package team-<name>-loader python -m src.main
6. Your tile + first signal appear on the big-screen dashboard
7. pnpm install && pnpm dev             # the scaffold added a new workspace package — one quick
                                        #   install links it, then edit ui/index.tsx with fast
                                        #   refresh; Claude Code + skills from here
```

Notes on the steps:

- **Step 3:** open `.env` and fill in `MODULE_TOKEN=` and `ANTHROPIC_API_KEY=` from your
  check-in card. `.env` is gitignored — these values never get committed.
- **Step 4:** the module id must be kebab-case and becomes your folder name, your
  `module_id` on every signal, and your storage prefix. Pick it once, keep it.
  The scaffold also pins the current `contractVersion`; leave that literal in place.
- **Step 5:** this runs your loader: it registers your module (tile appears on the
  dashboard immediately) and publishes a hello signal. Leave it running — it heartbeats
  for the health strip. If the venue WiFi drops, validated signals wait in the
  gitignored local outbox and `run_every()` resumes them automatically.
- **Step 7:** the `pnpm install` is not optional — step 4 created a new workspace package,
  and without one install from the repo root, `pnpm dev` fails at `pnpm gen` with
  "Cannot find package '@wcc-impact/plugin-sdk'". Then run Claude Code in the repo root. `CLAUDE.md`/`AGENTS.md` and
  `.claude/skills/` teach it the platform; ask it "how do I get my data onto the
  dashboard?" and it will know.

## Next: only if signals are not enough

Most teams should stop here and build on the shared `signals` table. If the module
genuinely needs its own rows or small server-side logic, follow
[`module-backends.md`](module-backends.md). The `demo-seed` module includes a secured
table definition, a deployed Edge Function, and copyable UI snippets for both paths.
For the live PostGIS demo, click any location or report marker on the shared Situation
Overview map.

## Troubleshooting

**My tile isn't showing on the dashboard.**

1. **Is your loader running?** The tile appears when `register_module(...)` succeeds —
   step 5 must have run without errors. Re-run it and read the output; `wcc_impact`
   raises readable errors.
2. **Did registration actually happen?** Check the health strip (or the `modules` table)
   for your module id. If it's missing, registration failed — usually a missing
   `MODULE_TOKEN` in `.env` (see the RLS error below).
3. **Is your module enabled?** Organisers can flip `enabled = false` (the kill-switch);
   disabled modules disappear from the dashboard *and* their inserts are rejected. If you
   suspect this, talk to an organiser — nothing on your side can change it.
4. For your module *page* (not the tile): the page only exists after your UI merges and
   the dashboard rebuilds — locally, `pnpm dev` shows it immediately.

**RLS error / "new row violates row-level security policy" / 401 or 403 on insert.**

- Your module token is missing, wrong, rotated, or belongs to another team. Check the
  repo-root `.env` has `MODULE_TOKEN=<your team's check-in-card value>` with no quotes
  or trailing spaces, then restart your loader.
- If the token is set and inserts still fail: does it own this exact `module_id`, and is
  the module registered and enabled?
  Signal inserts require a matching **enabled** row in `modules` — run your loader's
  registration first.
- Also enforced at the database: `title` ≤ 200 chars, `description` ≤ 2000 chars. Oversize
  rows are rejected.

**Signals insert fine but nothing appears on the map.**

- Signals without `lat`/`lng` show in the feed but not on the map. Use
  `wcc_impact.geocode("<place>")` or set coordinates directly. The shared map plots
  every located signal regardless of `signal_type` — there is no per-layer filtering to
  misconfigure.

**The Lab activity page says my module has queued signals.**

- Leave the loader running. It retries the oldest signal with bounded backoff and
  publishes the queue depth/oldest item/last error to the activity page.
- Check the error there, then confirm your WiFi, `MODULE_TOKEN`, and module kill-switch.
  Restarting the loader is safe: the queue is on disk and each replay has a database
  idempotency key, so a lost HTTP response cannot create a duplicate.
- `signal_queue_health(MODULE_ID)` inspects the local queue;
  `flush_signal_queue(MODULE_ID)` requests a bounded drain in a custom loop.

**`pnpm gen` says: `failed to import — Cannot find package '@wcc-impact/plugin-sdk'`.**

- Run `pnpm install` from the repo root — needed once after every `pnpm new-module`
  (the scaffold added a new workspace package; the install links it into the workspace).
  `pnpm gen` runs automatically before dev/typecheck/build, so this one error blocks all
  three until you install.

**`pnpm gen` rejects `contractVersion`.**

- Do not replace the literal with an imported "current" constant. If the declaration is
  missing or older than the platform supports, run
  `pnpm migrate-module-contract team-<name>`, review the diff, and run `pnpm gen` again.
- A future version means the module was written for a newer platform build; update the
  platform or pin the manifest to a version it genuinely supports. See
  `docs/module-contract-versioning.md`.

**`uv run --package team-<name>-loader` says the package isn't found.**

- Run `uv sync` again from the repo root — the scaffold added your loader to the uv
  workspace and it needs one sync to be installed.

**`python -m src.main` says `No module named 'src'`.**

- Loaders run with their own folder as the working directory — include
  `--directory modules/team-<name>/loader` in the `uv run` command (the scaffold
  prints the full command when it finishes).

Still stuck? A floating mentor's whole job is this. Wave.
