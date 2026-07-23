---
name: platform-overview
description: End-to-end mental model of the hackathon platform — how module registration, signals, realtime, storage, and the organiser kill-switch actually work — and the debugging checklist for "why isn't my tile/signal showing?". Use when reasoning about how the pieces connect or diagnosing platform behaviour.
---

# Platform overview

One shared Supabase project + one Next.js dashboard + N team modules. Two data paths:

```
Python loader (your laptop)                     Dashboard (Vercel / pnpm dev)
  register_module() ──► modules table  ──realtime──► tile in nav + health strip
  publish_signal()  ──► signals table  ──realtime──► shared map + live feed
  upload_file()     ──► media bucket   ──public URL─► media_urls on signals
```

Build-time composition, runtime control:

- **Build time:** `pnpm gen` globs `modules/*/module.config.ts` into a gitignored
  `apps/dashboard/registry.gen.ts`. The dashboard mounts each module's UI at
  `/modules/[id]` via `next/dynamic` inside a per-module error boundary — a crashing
  module UI breaks only its own page.
- **Runtime:** the `modules` DB table holds registration, `last_seen` heartbeat, and the
  organiser-only `enabled` flag. The dashboard renders a tile only when the manifest is in
  the registry **and** the DB row exists **and** `enabled = true`.

## Registration

First loader run calls `register_module(id=..., name=..., ...)` — an upsert into `modules`.
The table is realtime, so the tile appears the moment the upsert succeeds; no rebuild.
The payload must NEVER include `enabled` (service-role-only column; PostgREST upserts put
every payload column into the update set, so even `enabled: true` fails the write).

## Writes and the event token

Every write (signal insert, module upsert/heartbeat, storage upload) needs the
`x-event-token` header. `wcc_impact` and the SDK attach it automatically from the
repo-root `.env`. RLS additionally requires signal inserts to reference a registered,
**enabled** module, and caps `title` (200) / `description` (2000). Reads are public — the
internet can watch the feed, only the room can write to it.

## Realtime

ONE subscription to Postgres Changes on `signals` + `modules` lives in the core provider;
`useSignals(filter)` consumes it from context with client-side filtering. Modules never
open their own channels — ten pages opening ten channels is what this design prevents.

## The kill-switch

Organisers flip `modules.enabled` in Supabase Studio (service role — no admin page).
Effects: the tile disappears from the dashboard instantly, AND the module's signal inserts
and uploads start failing RLS. Nothing client-side can change `enabled`.

## Debugging: "why isn't my tile showing?"

Work down this list — it's ordered by frequency:

1. **Loader never ran / registration failed.** The tile comes from the `modules` row, not
   the manifest. Run the loader; read its error. Most common cause: `EVENT_TOKEN` missing
   from `.env` → RLS rejects the upsert.
2. **Module disabled.** `enabled = false` hides the tile and silences inserts. Only an
   organiser can flip it back.
3. **Manifest invalid.** `pnpm gen` validates every manifest (id must be kebab-case and
   equal the folder name, etc.) — a failing manifest is excluded and CI is
   red. Run `pnpm gen` and read the error.
4. **Looking for the page, not the tile.** Your `/modules/<id>` page needs your UI merged
   (deployed dashboard) or `pnpm dev` (local). The tile itself needs only registration.

"Why isn't my signal showing?" → see the `publish-signals` skill; short version: token
missing, module not registered/enabled, over the length caps, or no `lat`/`lng` (feed yes,
map no).

Authoritative interfaces: `docs/CONTRACTS.md`. Signal fields: `schema/signal.schema.json`.
