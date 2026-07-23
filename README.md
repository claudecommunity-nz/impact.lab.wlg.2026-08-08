# WCC Emergency Hack

Shared platform for the one-day civic hackathon run **alongside Wellington City Council
Emergency Management** — Friday 8 August 2026, Waimanga Room.

Teams each build a **module** (a folder with a manifest, an optional React UI, and a Python
data loader) against a real WCC operational problem statement. Every module plugs into one
shared common operating picture: a live MapLibre map + realtime feed of emergency "signals"
backed by a single shared Supabase project.

> **Hackathon prototype built alongside Wellington City Council — not real emergency
> information. In an emergency call 111.**

## Quickstart

See [`docs/quickstart.md`](docs/quickstart.md). Target: scaffold → your first signal on the
big-screen dashboard in under 15 minutes.

```
pnpm install && uv sync
cp .env.example .env        # then type in your module token + team Anthropic key
                            # from your check-in card — never commit them
pnpm new-module team-<name>
uv run --directory modules/team-<name>/loader --package team-<name>-loader python -m src.main
pnpm dev
```

## How it fits together

- `apps/dashboard` — the core Next.js 16 dashboard (fixed common operating picture,
  personal drag/resize widget workspace, module pages, health strip, and the read-only
  Lab activity view of commits, PRs, modules, signals, tables, and media)
- `modules/<team>/` — your folder: `module.config.ts` + `ui/` (TypeScript) + `loader/` (Python)
- `packages/plugin-sdk` — the **only** package module UIs import
- `packages/wcc-impact-platform-py` — the Python helper library loaders import (`wcc_impact`)
- `packages/shared` — signal + manifest types (zod), mirrored from `schema/signal.schema.json`
- `supabase/` — migrations: tables, per-module RLS, credentials, storage policies

**The contract between everything is [`docs/CONTRACTS.md`](docs/CONTRACTS.md)** and the
`signals` table (`schema/signal.schema.json` is the source of truth). Rule of the day:
*loaders and pipelines in Python; UI in TypeScript; the signals table in between.*

Readable contract references are generated under [`docs/generated/`](docs/generated):
signal fields, manifest constraints, SDK exports/signatures, and Python helper signatures.
The [contract-source map](docs/contract-sources.md) identifies the owner of each concept.
Contributors run `pnpm docs:generate`; CI rejects stale generated output.

When signals are not enough, [`docs/module-backends.md`](docs/module-backends.md) walks
through module-owned Postgres tables and Edge Functions using the live `demo-seed` example.

## License

MIT — see [LICENSE](LICENSE).
