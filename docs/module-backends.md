# Optional module backends

Most modules need only the shared `signals` table. Use a module backend when the
module has durable state that is not evidence on the shared map, or when it needs
small server-side logic that should not run in a browser or loader.

The complete working reference is `modules/demo-seed`:

```text
modules/demo-seed/
├─ module.config.ts
├─ ui/index.tsx
└─ backend/
   ├─ schema.sql
   └─ functions/
      └─ summary/index.ts
```

The module page shows the copyable schema, SDK, and function patterns. The
`demo-seed-summary` function remains a deployed, public read-only reference that
teams can invoke while developing their own module.

## Choose the smallest data path

| Need | Use |
|---|---|
| Evidence that belongs on the shared map/feed | `publish_signal()` |
| Module-specific rows with public reads and owner-only writes | Module-owned Postgres table |
| Browser-safe derived UI state | React in the module UI or widget |
| A webhook, secret-bearing external API call, or controlled server operation | Edge Function |
| Shared incident promotion, assessment, or response-member access | The core incident RPCs |

Do not copy shared signals into another table just to query them. Do not create a
module-owned incident table: incident state and audit history belong to the core
response workflow described in [`spatial-incident-triage.md`](spatial-incident-triage.md).

## Add a module-owned table

### 1. Declare the schema

Create `modules/<module-id>/backend/schema.sql`. Table names are
`public.m_<module_id>_<name>`; hyphens in the module id become underscores.
Every realtime table needs a UUID primary key.

```sql
create table if not exists public.m_team_coast_watch_cases (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  status     text not null default 'open',
  label      text not null
);

select wcc.enable_module_table(
  'public.m_team_coast_watch_cases',
  'team-coast-watch'
);
```

`wcc.enable_module_table(...)` applies the platform contract in one place:

- public reads for collaboration;
- writes restricted to the owning module;
- the module kill-switch;
- RLS and Data API grants; and
- membership in the shared realtime publication.

Keep the file idempotent because deployment may safely reapply it.

### 2. Declare the logical table name

Add the suffix, not the full Postgres name, to `module.config.ts`:

```ts
export default defineModule({
  // ...
  tables: ["cases"],
});
```

This tells the core provider to include the table in its one realtime
subscription.

### 3. Read live rows in the UI

Module UIs import only React and `@wcc-impact/plugin-sdk`:

```tsx
"use client";

import { useModuleTable } from "@wcc-impact/plugin-sdk";

type CaseRow = {
  id: string;
  created_at: string;
  status: string;
  label: string;
};

export default function Cases() {
  const { rows, loading, stale, error } = useModuleTable<CaseRow>(
    "team-coast-watch",
    "cases",
  );

  // Render loading/error/stale states, then rows.
}
```

Never call `supabase.channel()` from a module. `useModuleTable()` is already live
through the shared provider.

### 4. Write through the owning identity

A Python loader writes with its module token:

```py
from wcc_impact import module_table

module_table("team-coast-watch", "cases").insert(
    {"status": "open", "label": "Check coastal access"}
).execute()
```

A browser can write with `moduleTable(...)` only after an organiser assigns the
signed-in user to that module. Anonymous users and users assigned to another
module remain read-only:

```ts
import { moduleTable } from "@wcc-impact/plugin-sdk";

const { error } = await moduleTable("team-coast-watch", "cases").insert({
  status: "open",
  label: "Check coastal access",
});
if (error) throw error;
```

See [`module-write-isolation.md`](module-write-isolation.md) for assignment,
rotation, revocation, and recovery.

## Add an Edge Function

Create:

```text
modules/team-coast-watch/backend/functions/summary/index.ts
```

The protected deployment workflow discovers the folder and deploys it as
`team-coast-watch-summary`. Functions are not declared in the manifest.

Call it through the SDK so the project key and current user session are attached:

```ts
import { invokeModuleFunction } from "@wcc-impact/plugin-sdk";

type Summary = {
  total: number;
  generatedAt: string;
};

const summary = await invokeModuleFunction<Summary>(
  "team-coast-watch",
  "summary",
);
```

The `demo-seed-summary` implementation demonstrates:

- browser CORS and `OPTIONS` handling;
- an explicit method allowlist;
- environment and upstream-response checks;
- public Data API reads with no service-role key;
- structured non-2xx errors; and
- a dynamic JSON response suitable for a module UI or loader.

## Edge Function security

Treat every module function as a public HTTP endpoint until its handler proves
otherwise. The platform supports public actions and webhooks, so module
functions currently deploy with gateway JWT verification disabled.
`invokeModuleFunction()` still forwards the current session when one exists,
but forwarding a header is not authorization.

Use these rules:

1. Public read-only functions may use the injected anon key and public tables.
2. An authenticated function must validate the `Authorization` token, then make
   database calls with that caller's auth context so RLS remains in force.
3. Webhooks must verify the provider signature before doing work.
4. Validate methods, body shape, lengths, identifiers, and file types.
5. Return safe errors; log private diagnostic detail in the function runtime.
6. Never return or expose `SUPABASE_SERVICE_ROLE_KEY`.
7. Service-role writes are organiser-reviewed exceptions. Because they bypass
   RLS, the handler becomes the entire authorization boundary.

For response operations, do not use a service-role function to bypass
`response_members`, incident RLS, or the audited incident RPCs.

## Deployment and verification

Participants commit only files inside `modules/<module-id>/`. CI validates module
declarations and schema shape. After a green merge to `main`, the protected
`Deploy Supabase` workflow:

1. applies core migrations;
2. applies each module schema in its own transaction;
3. verifies ownership, RLS, grants, and realtime membership; and
4. deploys module functions under their prefixed names.

Before opening the PR:

```sh
pnpm gen
pnpm lint
pnpm typecheck
pnpm build
```

After deployment, invoke the function from the application with
`invokeModuleFunction()` or inspect it with the Supabase function tooling.
Organisers can retry deployment using the commands in
[`supabase-deployment.md`](supabase-deployment.md).

## Review checklist

- The state genuinely does not belong in `signals`.
- Every table name uses the module prefix and has a UUID primary key.
- Every table ends with `wcc.enable_module_table(table, module_id)`.
- Every realtime table suffix is declared in `module.config.ts`.
- The module UI uses SDK accessors and opens no realtime channel.
- Function CORS, methods, input validation, errors, and authentication are explicit.
- No browser bundle or committed file contains a module token, service-role key,
  third-party secret, private person data, or private response data.
