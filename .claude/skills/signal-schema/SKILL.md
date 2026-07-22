---
name: signal-schema
description: How to read and use the signal contract — the shape of every row in the shared signals table. Use when constructing signal payloads, validating loader output, or answering "what fields does a signal have?".
---

# The signal schema

**The single source of truth is `/schema/signal.schema.json`.** Read that file for the
field list, types, enums, length caps, and required fields — do not rely on any copy
(including this skill; it deliberately lists no fields). Three mirrors are kept in sync
with it and CI-checked:

| Mirror | Where | Use it for |
|---|---|---|
| `signalSchema` (zod) + `Signal` / `SignalRow` types | `@wcc-impact/shared` (re-exported by `@wcc-impact/plugin-sdk`) | Typing and validating in TypeScript UIs |
| `publish_signal(...)` keyword arguments | `wcc_impact` (Python) | Building signals in loaders — it validates against the JSON Schema before inserting |
| `signals` table DDL + RLS caps | `supabase/migrations/` | What the database itself enforces |

Enum values (source types, severities, verification states) come from `@wcc-impact/shared`
consts (`SOURCE_TYPES`, `SEVERITIES`, `VERIFICATIONS`) or the schema file's `enum` arrays —
never hard-code your own list.

## Using it in TypeScript

```ts
import { signalSchema, SEVERITIES, type SignalRow } from '@wcc-impact/plugin-sdk';

// Type a component prop
function Row({ signal }: { signal: SignalRow }) { /* ... */ }

// Validate untrusted data (rarely needed in UIs — useSignals returns typed rows)
const parsed = signalSchema.safeParse(candidate);
```

## Using it in Python

`publish_signal()` (see the `publish-signals` skill) takes one keyword argument per schema
field and validates before inserting — you should never need to read the JSON Schema
programmatically in a loader. Your loader's `sample()` must return a dict that validates
against the schema; CI runs that check on every PR:

```python
def sample() -> dict:
    """One representative payload, NOT inserted. CI validates this against
    schema/signal.schema.json."""
    return {
        "module_id": "team-outage-watch",
        "title": "Cellular outage reported in Brooklyn",
        "signal_type": "outage",
        "source_type": "official",
        "severity": "moderate",
    }
```

## Things the schema won't tell you (RLS does)

- Inserts require the event token AND a registered, **enabled** `module_id`.
- `id` / `created_at` are database-generated — never supply them.
- Post-insert, only `verification` and `confidence` are updatable, and only by
  authenticated users. Everything else is immutable.

The schema freezes 26–27 Jul. After that, changes need organiser sign-off and a
coordinated zod + Python + SQL update — design your loader to the frozen schema, and put
anything extra in the `raw` jsonb field.
