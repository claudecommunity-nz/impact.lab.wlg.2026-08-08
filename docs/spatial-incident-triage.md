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
| `signal_triage_queue(window_hours, limit)` | Consequence/corroboration/spatial queue | Response member |
| `create_incident_from_signal(signal_id)` | Promote and correlate evidence | Response member |
| `assess_incident(...)` | Update state and append audit history | Response member |

Default correlation rules are 500 metres and 30 minutes. Add a `triage_rules` row for a
signal type when a hazard needs a different distance or time model. These are operational
defaults, not automatic truth: incident creation remains a human decision.

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
