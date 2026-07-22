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
cp .env.example .env        # then type in the event token + your team's Anthropic key
                            # from your check-in card — never commit them
pnpm new-module team-<name>
uv run --directory modules/team-<name>/loader --package team-<name>-loader python -m src.main
pnpm dev
```

## How it fits together

- `apps/dashboard` — the core Next.js 15 dashboard (map, feed, module pages, health strip)
- `modules/<team>/` — your folder: `module.config.ts` + `ui/` (TypeScript) + `loader/` (Python)
- `packages/plugin-sdk` — the **only** package module UIs import
- `packages/wcc-impact-platform-py` — the Python helper library loaders import (`wcc_impact`)
- `packages/shared` — signal + manifest types (zod), mirrored from `schema/signal.schema.json`
- `supabase/` — migrations: tables, RLS, event-token write gating, storage policies

**The contract between everything is [`docs/CONTRACTS.md`](docs/CONTRACTS.md)** and the
`signals` table (`schema/signal.schema.json` is the source of truth). Rule of the day:
*loaders and pipelines in Python; UI in TypeScript; the signals table in between.*

## License

MIT — see [LICENSE](LICENSE).
