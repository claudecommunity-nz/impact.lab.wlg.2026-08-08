---
name: plugin-sdk
description: The full @wcc-impact/plugin-sdk surface with working examples — defineModule, useSignals, useUser/SignIn, SignalMap, SignalFeed/SignalCard, FileUpload/FileGallery, uploadFile, and design tokens. Use when building any module UI.
---

# @wcc-impact/plugin-sdk

The ONLY package module UIs import (plus `react`). All components are client components;
the SDK re-exports all `@wcc-impact/shared` types. Full signatures: `docs/CONTRACTS.md` §6.

## useSignals — the signal store

One shared realtime subscription lives in the core provider; this hook filters it
client-side. **Never open your own Supabase channel.**

```tsx
import { useSignals } from '@wcc-impact/plugin-sdk';

export default function OutagePage() {
  const { signals, loading, error } = useSignals({
    moduleId: 'team-outage-watch',      // just my module's signals
    signalType: 'outage',               // optional narrower filter
    since: new Date(Date.now() - 3600_000).toISOString(),  // last hour
  });
  if (loading) return <p className="text-muted-foreground">Loading…</p>;
  return <p>{signals.length} outages (newest first)</p>;
}
```

## SignalMap / SignalFeed / SignalCard

The shared MapLibre map (Wellington defaults, severity colouring, popups) and the
standardised feed. Pass `signals` OR `filter` (if both, `signals` wins). Modules never own
a map instance. Default map height 400px unless `className` sizes it.

```tsx
import { SignalMap, SignalFeed, SignalCard, useSignals } from '@wcc-impact/plugin-sdk';

// Simple: let the components subscribe via a filter
<SignalMap filter={{ moduleId: 'team-coast-watch' }} className="h-[500px]" />
<SignalFeed filter={{ moduleId: 'team-coast-watch' }} limit={20} />

// Or drive both from one filtered list
const { signals } = useSignals({ signalType: 'flooding' });
const severe = signals.filter((s) => s.severity === 'severe');
<SignalMap signals={severe} />
{severe[0] && <SignalCard signal={severe[0]} />}
```

The manifest's `feedCard` is accepted but **ignored this event** — SignalFeed always
renders the standard `SignalCard`, never a custom card. Fill it in for intent/handover if
you like, but it changes nothing on the shared feed today.

## Auth — useUser / SignIn (optional)

For concepts needing identity (e.g. triage verification):

```tsx
import { useUser, SignIn } from '@wcc-impact/plugin-sdk';

const { user, loading } = useUser();
if (!user) return <SignIn />;          // email magic-link, core-styled
return <p>Signed in as {user.email}</p>;
```

## Files — FileUpload / FileGallery / uploadFile

All scoped to `media/<moduleId>/` automatically; bucket is public-read, 10 MB cap.

```tsx
import { FileUpload, FileGallery, uploadFile } from '@wcc-impact/plugin-sdk';

<FileUpload moduleId="team-intake" accept="image/*"
            onUploaded={(url) => console.log('public URL', url)} />
<FileGallery moduleId="team-intake" />

// Programmatic (e.g. inside a submit handler) — throws on RLS rejection
const url = await uploadFile(file, 'team-intake');   // → put in media_urls
```

## Design tokens — never hard-code colours

The theme lives in `@wcc-impact/ui`'s `tokens.css` (CSS variables + Tailwind v4 `@theme`
utilities), imported once by the dashboard's `globals.css` — module UIs never import CSS,
just use the utility classes. The names are the standard shadcn/ui set:

- Core: `bg-background`, `bg-card`, `text-foreground`, `text-card-foreground`,
  `text-muted-foreground`, `bg-primary`, `bg-accent`, `border-border`
  (CSS vars `--color-background` … `--color-accent`).
- Severity scale: `bg-severity-minor|moderate|severe|extreme|unknown` — the same scale the
  map and default cards use (what `mapLayer.color: "severity"` maps to).

```tsx
<div className="rounded-lg bg-card border border-border p-4">
  <span className="bg-severity-severe text-white rounded px-2">SEVERE</span>
</div>
```

## homeStat — your number on the big screen

Declare `homeStat: { label: string; signalType?: string }` in your `module.config.ts` to
put one stat tile on the shared home dashboard: a live count of your module's signals,
optionally filtered to one `signal_type`. See the `create-module` skill.

## The rules (lint-enforced)

No imports from `apps/dashboard` internals. No own realtime channels. No `.env` secrets in
browser code (there are none to read — writes from local dev use the token the SDK reads
itself; the deployed dashboard is read-only). Need something the SDK lacks? Ask an
organiser about the iframe escape hatch — mid-event SDK changes don't happen.
