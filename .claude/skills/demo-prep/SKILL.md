---
name: demo-prep
description: Getting a module demo-ready — the 15:00 UI merge freeze, the 16:00 README handover submission, and structuring the 4-minute demo from the shared dashboard. Use in the afternoon of event day.
---

# Demo prep

Demos run 16:00–17:00 **from the shared dashboard** on the big screen: each team walks
their tile → their module page. Ten teams, one hour — **~4 minutes each, no slack**. The
dashboard served on the projector machine is synced to `main` after the freeze and reads
the same live Supabase data as everyone else.

## Deadlines (event day)

| Time | What |
|---|---|
| **15:00** | **UI merge freeze** — last dashboard merges. The CI queue needs the runway; a red PR at 14:55 is a mentor emergency, at 15:25 it's too late. Loaders keep publishing signals after the freeze. |
| ~15:30 | Scenario storm peak — your module should be visibly reacting |
| **16:00** | Submission: module merged + README handover sections complete |
| 16:00–17:00 | Demos, ~4 min each, judged against the published criteria |

Work backwards: your final UI PR should be **open and green by ~14:30**.

## Pre-freeze checklist

- [ ] `pnpm gen && pnpm lint && pnpm typecheck && pnpm build` green locally before the
      final push — don't discover CI failures in the queue.
- [ ] Loader running and healthy: green on the health strip, recent `last_seen`, signals
      flowing. The loader runs from **your laptop** during demos — keep it plugged in,
      awake, and on the WiFi.
- [ ] Signals geolocated where possible (map beats feed on a projector) and severities
      honest — your data is on screen during *other* teams' demos too.
- [ ] Tile name/icon/description read well at a glance — that's your first impression.
- [ ] No real faces, names, or addresses anywhere in your test data or uploads (the media
      bucket is public-read). Clean up embarrassing test signals before 16:00.

## The README handover (submission = this is done)

Your module's `README.md` has pre-structured sections — fill every one. It feeds the
per-solution implementation docs WCC receives, so it's the part of your work with the
longest life. Don't skip the production section: the platform note is that Supabase is
the database/realtime layer and Python services run wherever WCC runs Python (Azure
Functions / Container Apps being the likely fit) — say what YOUR loader would need.

## The 4 minutes

A shape that fits: **problem** (30s — which WCC statement, why it matters) → **live walk**
(2min — tile → your page; show real signals arriving on the shared map/feed, storm-peak
data is on screen naturally) → **how** (60s — data sources, what Claude does in your
pipeline, one honest limitation) → **production path** (30s — from your README).

- Demo from the shared dashboard, not localhost — the point of the platform is ten
  modules in one product.
- Have a fallback: if your live source goes quiet, know which existing signals on the
  map tell your story. Never dead-air waiting for a poll tick.
- Rehearse once at ~15:30 against the storm peak. Time it. Four minutes is shorter than
  you think.
