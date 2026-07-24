# Spatial incident triage

The shared `signals` table remains the append-only evidence bus. Spatial indexing and
response decisions live beside it:

1. A trigger projects every located signal into `signal_geo.location` as
   `geography(Point, 4326)`.
2. GiST indexes support radius and nearest-area filtering; a geometry expression index
   supports viewport and polygon operations.
3. Public RPCs expose bounded spatial reads without exposing raw source payloads.
4. Authenticated response members receive a deterministic, cross-module triage queue.
5. An operator promotes evidence into an incident. Nearby same-type evidence inside the
   configured time window is linked, not deleted or rewritten.
6. Later operator decisions append assessment history.

This deliberately separates two questions:

- **Action priority:** how quickly responders should act if the report is true.
- **Verification priority:** how quickly the evidence should be corroborated.

A severe unverified report can therefore be action P2 and verification P1. Severity,
official provenance, independent sources, spatial clustering, missing/coarse location,
and recency are returned as explainable reason codes.

## Spatial functions

| Function | Purpose | Access |
|---|---|---|
| `signals_nearby(lat, lng, radius, since, limit)` | Radius search ordered by distance | Public |
| `signals_in_view(min_lat, min_lng, max_lat, max_lng, since, limit)` | Map viewport query | Public |
| `signals_in_response_area(area_id, since, limit)` | Point-in-polygon query | Public, subject to area visibility |
| `signal_hotspots(since, eps_m, minpoints, limit)` | Same-type DBSCAN clusters in NZTM2000 metres | Public |
| `signal_serious_pockets(since, cell_m, minpoints, limit)` | Cross-type moderate/severe/extreme report concentrations in bounded NZTM cells | Response member |
| `signal_triage_queue(window_hours, limit)` | Consequence/corroboration/spatial queue | Response member |
| `create_incident_from_signal(signal_id)` | Promote and correlate evidence | Response member |
| `assess_incident(...)` | Update state and append audit history | Response member |

Public hotspot computation is clamped to the newest seven days and 5,000 located
signals before DBSCAN. The response queue similarly preselects at most 2,000 candidates
before per-row spatial correlation. These server-side bounds apply even when callers
request larger histories.

`signal_serious_pockets` is a separate response-member display query rather than a
different name for `signal_hotspots`. Hotspots preserve signal type for hazard-specific
analysis. Report concentrations place moderate, severe, and extreme reports from all
types into fixed 750 metre NZTM cells, then require at least one severe or extreme report
and the configured minimum report count in every returned cell. Fixed cells prevent
density chaining from turning adjacent observations into a multi-kilometre cluster. The
candidate set is severity-first and capped at 5,000 rows. Its response includes both
candidate and output cap states, qualifying-cell and report totals, reported-severity
counts, serious-only verification and official counts, distinct reported origins,
signal-type breakdowns, time extent, cell polygon, approximate centroid, and location
precision warnings. “Reported origins” does not claim that sources are independent.

Default correlation rules are 500 metres and 30 minutes. Add a `triage_rules` row for a
signal type when a hazard needs a different distance or time model. These are operational
defaults, not automatic truth: incident creation remains a human decision.

Promotion locks the complete correlated evidence set in stable UUID order. Concurrent
operators promoting neighbouring reports therefore converge on the same incident. The
core provider also observes incident and evidence changes on its existing realtime channel
and invalidates the operations queue without opening another subscription.

## Map location insight

The shared Situation Overview map is the public, hands-on PostGIS demonstration:

1. click anywhere on the map or select a report marker;
2. choose a 500 metre, 1 kilometre, or 3 kilometre radius;
3. the dashboard calls the bounded `signals_nearby` RPC for the previous 24 hours; and
4. a map overlay summarises the returned nearest sample: active reports, highest
   severity, severe/extreme count, module and source diversity, separate
   verified/corroborated and official-source counts, leading signal types, distances,
   and the three priority reports.

The inspector requests at most 40 rows and uses the shared provider's signal revision to
refresh after new evidence arrives. It does not open another realtime channel. Reports
marked `false_report` are excluded from the active summary and disclosed as dismissed.
When the query reaches the 40-row cap, or any returned row cannot be interpreted, the
overlay explicitly marks the summary incomplete rather than presenting radius-wide facts.

The selected ring identifies the query coordinate, not an incident perimeter. The overlay
also warns when results use suburb, region, unknown, or missing precision because centroid
distances can look more exact than the source evidence. “No reports” means only that the
shared bus has no active evidence in that radius and time window; it does not mean the
location is safe. Promotion into an incident remains an authenticated human decision.

## Full-screen regional map

The `/map` route is the high-level emergency-management view. Public visitors can inspect
the bounded latest-report marker sample. The **Report concentrations** sidebar is loaded
only in Operations mode for an authenticated response member; PostgreSQL enforces that
boundary. The default seven-day scope makes the seeded hackathon scenario visible;
operators can switch to six or 24 hours without changing source evidence.

The sidebar orders displayed cells by highest reported severity, severe/extreme count,
reported-origin count, then recency. That is an evidence sort, not operational priority.
Each card shows:

- severe and extreme report counts;
- distinct reported origins;
- unverified serious, verified/corroborated, and official counts separately;
- the leading report types and newest-report age; and
- a warning when suburb, region, or unknown centroids affect the group.

Yellow-ring count pins are approximate cell centroids, and dashed polygons show the
bounded analysis cells. Neither is an incident symbol or hazard perimeter. Selecting one
focuses the map and opens the same bounded nearby-evidence inspector used by the Situation
Overview map. That inspector is supplementary radius evidence, not exact cell membership.
It uses the chosen map time window and still returns only the nearest 40 reports, with its
existing incompleteness disclosure.

The map consumes the one root `SignalProvider` subscription. PostGIS aggregation is
refetched from the provider's signal/operational revision after a short debounce, so the
feature does not create another realtime channel or aggregate every burst row separately.

Individual markers remain the shared provider's newest 500-row sample, filtered to the
chosen event window and excluding dismissed reports. The sidebar permanently discloses
that the analytical cell query considers up to 5,000 rows, so a concentration may contain
reports not present in the marker sample.

Empty results mean only that no qualifying group formed from shared reports in that
window. Every concentration is labelled **Automated grouping · not reviewed**; a human
must inspect the evidence and use the authenticated incident workflow before it becomes
an operational incident.

## Assign an operations account

The user must sign in to the dashboard once with the magic-link form so Supabase Auth has
created the account. In the Supabase SQL editor, find the exact user:

```sql
select id, email, created_at
from auth.users
where lower(email) = lower('operator@example.org');
```

Then assign one of `operator`, `controller`, or `admin`:

```sql
select public.set_response_member(
  '00000000-0000-0000-0000-000000000000'::uuid,
  'admin'
);
```

Remove access with:

```sql
select public.remove_response_member(
  '00000000-0000-0000-0000-000000000000'::uuid
);
```

The dashboard toggle is only presentation. PostgreSQL grants, RLS, and the RPC access
check enforce the boundary if a browser calls the API directly.

## Hackathon demo accounts

The Operations access panel deliberately shows three public scenario accounts:

| Response role | Email |
|---|---|
| Operator | `operator@demo.impactlab.nz` |
| Controller | `controller@demo.impactlab.nz` |
| Response admin | `admin@demo.impactlab.nz` |

All three use the intentionally public password `WellingtonResponse2026!`. These are
response-workflow roles, not Supabase project-admin accounts. The initial incident
workflow grants all response members the same operational RPCs while preserving their
distinct role for UI and later policy refinement.

Create or refresh the users only after the spatial migration has deployed. Supply the
service-role key in the organiser's shell; never commit it or prefix it `NEXT_PUBLIC_`:

```sh
export SUPABASE_URL="https://wjxnahicdudybycedgih.supabase.co"
read -s SUPABASE_SERVICE_ROLE_KEY
export SUPABASE_SERVICE_ROLE_KEY
pnpm --filter @wcc-impact/dashboard provision-demo-users
unset SUPABASE_SERVICE_ROLE_KEY
```

The command is idempotent: it creates missing users, restores their password and
server-controlled demo metadata, assigns `response_members`, then verifies password login
and the exact database role.

After the event, set `NEXT_PUBLIC_DEMO_AUTH_ENABLED=false` in Vercel and redeploy, then
remove the accounts and their cascading memberships:

```sh
pnpm --filter @wcc-impact/dashboard provision-demo-users -- --remove
```

Cleanup refuses to delete an existing matching email unless its server-controlled
`app_metadata.demo_account` flag is true.

## Response-area polygons

Hotspots work immediately from signal coordinates. For named operational areas, load a
reviewed Wellington boundary dataset into `response_areas`:

- transform the source to EPSG:4326;
- store polygons as `MultiPolygon`;
- record `source`, `source_version`, and `effective_at`;
- use `public_visible = false` for internal operational boundaries.

Do not infer authoritative areas from `place_name`. That field remains useful display
text, but spelling and centroid-based geocoding are not reliable containment tests.

## Deployment

Do not paste the migration into the live SQL editor. The normal protected path is:

1. commit the migration and dashboard changes;
2. open a PR and let CI rebuild the PostgreSQL 17 + PostGIS stack;
3. merge after CI passes;
4. let `Deploy Supabase` dry-run and apply pending migrations;
5. assign response members after their first sign-in;
6. optionally import authoritative response-area polygons.

The migration backfills all existing located development signals automatically.
