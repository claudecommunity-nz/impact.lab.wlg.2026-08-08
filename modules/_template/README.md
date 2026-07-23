# __MODULE_NAME__ (`__MODULE_ID__`)

> Hackathon prototype built alongside Wellington City Council — **not real emergency
> information. In an emergency call 111.**

<!--
This README is your HANDOVER DOC. It feeds the per-solution implementation docs
Chris and Adam owe WCC after the event, and a filled-in version is part of your
16:00 submission. Replace every _italic hint_ with real content — short and
honest beats long and glossy.
-->

## What it does

_Two or three sentences: what problem this module solves, what data it watches,
and what shows up on the shared dashboard (signal types, map layer, page)._

## Problem statement

_Which WCC problem statement (1-5) you tackled, in your own words, plus the
SME owner you worked with and any scope decisions you made on the day._

## Data sources

_Publicly available datasets only (CE condition). One row per source:_

| Source | URL / dataset | Licence | How we use it |
| --- | --- | --- | --- |
| _e.g. GeoNet CAP feed_ | _https://..._ | _CC BY 4.0_ | _polled every 60s for quake alerts_ |

## How it works

_A short architecture note. The default shape:_

- `loader/` — Python (uv workspace member `__MODULE_ID__-loader`). Polls the
  sources above with `run_every()`, transforms rows into signals, publishes via
  `wcc_impact.publish_signal()`.
- `ui/` — TypeScript page built on `@wcc-impact/plugin-sdk`, mounted at
  `/modules/__MODULE_ID__` in the core dashboard.
- Signal types this module emits: _`hello` (replace: list each `signal_type`
  and what it means)._
- AI usage: _e.g. `ask_claude()` classifies headlines into signal types —
  or "none"._

## How to run

From the repo root (`.env` filled in from your check-in card):

```sh
uv sync
uv run --directory modules/__MODULE_ID__/loader --package __MODULE_ID__-loader python -m src.main
```

Dashboard (tile + page) locally:

```sh
pnpm install && pnpm dev   # http://localhost:3000/modules/__MODULE_ID__
```

_Anything else a fresh machine needs (extra env vars, one-off backfill
commands), list it here — "clone to running" should be reproducible._

## Production notes for WCC

_Keep this section brutally practical — it's the part WCC engineers read first._

- **Where this runs in production:** Supabase stays the database/realtime
  layer; the Python loader runs wherever WCC runs Python — **Azure Functions
  (timer-triggered) or Azure Container Apps are the likely fit** (PLAN §8).
  The polling loop in `main.py` maps directly onto a timer trigger.
- **Auth hardening:** event-day loaders use revocable module-scoped credentials
  checked by RLS. For production, use workload identity or put writes behind a
  server-side function (for example a Supabase Edge Function or Azure Function)
  holding a narrowly scoped secret.
- **Data licences:** _confirm each source above permits operational use, not
  just hackathon use._
- **Known limitations:** _rate limits, gaps, mock/scenario data you relied on
  (the scenario feeds are NOT real sources), accuracy caveats._
- **Next steps if WCC adopts this:** _the 2-3 things you'd build next._

## Team

_Names / GitHub handles / contact (with each person's consent) — so WCC knows
who to ask follow-up questions._
