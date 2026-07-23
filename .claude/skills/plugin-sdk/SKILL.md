---
name: plugin-sdk
description: The full @wcc-impact/plugin-sdk surface with working examples — defineModule, useSignals, useUser/SignIn, SignalMap, SignalFeed/SignalCard, FileUpload/FileGallery, uploadFile, and design tokens. Use when building any module UI.
---

# @wcc-impact/plugin-sdk

The ONLY package module UIs import (plus `react`). All components are client components;
the SDK re-exports all `@wcc-impact/shared` types. The exhaustive, CI-checked export list
and live TypeScript signatures are in `docs/generated/plugin-sdk-reference.md`; this skill
keeps workflow examples and rules rather than a second API list.

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

Every module's signals render with the same standard `SignalCard` — per-module card
swapping is deliberately not part of this event's manifest.

## Auth — useUser / SignIn (optional)

For concepts needing identity (e.g. triage verification):

```tsx
import { useUser, SignIn } from '@wcc-impact/plugin-sdk';

const { user, loading } = useUser();
if (!user) return <SignIn />;          // email magic-link, core-styled
return <p>Signed in as {user.email}</p>;
```

An organiser must assign the user's immutable JWT `app_metadata.module_id`. RLS then
allows writes only to that module. `MODULE_TOKEN` is loader-only and is never available
to browser code.

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
  map and default cards colour by.

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
browser code. UI writes require a signed-in, organiser-assigned module account; anonymous
and cross-module users are read-only. Need something the SDK lacks? Ask an organiser about
the iframe escape hatch — mid-event SDK changes don't happen.
