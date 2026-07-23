# Lab activity — organiser setup

The dashboard's **Lab activity** page gives every participant a read-only view of delivery
progress and public platform data. It deliberately has no merge, database-write, or
kill-switch controls.

## GitHub setup

The public-repository fallback needs no credentials and shows recent commits and pull
requests. To include PR check rollups and raise the API allowance, set these server-side in
the Vercel project:

```text
GITHUB_REPOSITORY=claudecommunity-nz/impact.lab.wlg.2026-08-08
GITHUB_TOKEN=<fine-grained read-only token>
```

Give the token access only to this repository, with read access to **Contents**, **Pull
requests**, and **Actions/commit statuses**. Never name it `NEXT_PUBLIC_GITHUB_TOKEN`: that
would place it in the browser bundle.

After deployment, visit `/api/activity/github`. The JSON `source.status` should be `ok`.
`degraded` means the public fallback is working but check rollups are unavailable;
`unavailable` includes a safe diagnostic message.

## Supabase setup

No service-role key or event token is used. The activity endpoint reads with:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

It can see exactly the participant-visible surface: `modules`, safe fields from `signals`,
manifest-declared public module tables, and the public `media` bucket. If a declared table
has not been applied yet, that table reports its own error while the rest of the page stays
available.

Signal totals come from the same `signal_aggregates()` function as the home dashboard, so
they remain exact beyond the 500-row realtime window. The **Data** tab pages older rows
through `signal_history_page(...)` rather than downloading the full table.

Visit `/api/activity/supabase` and check:

- `source.status` is `ok` (or a clearly explained `degraded`);
- `totals.registeredModules` matches the runtime registry;
- every merged manifest `tables` entry appears under `tables`;
- no credential or private-schema data appears in previews.

## Event-day operation

- The page refreshes every 30 seconds.
- GitHub responses are cached at the CDN for 30 seconds with stale-while-revalidate.
- Supabase snapshots are cached for 15 seconds.
- Source health cards make rate limits, missing configuration, or table errors visible.
- Participants can filter by module, health/check state, or free text.

If GitHub is rate-limited, confirm the server token is present and has not expired. If
Supabase is degraded, open the endpoint JSON and address the named table or public-policy
error; do not add a service-role key to make the warning disappear.
