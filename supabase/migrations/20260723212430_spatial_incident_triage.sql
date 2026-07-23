-- Spatial signal reads + an authenticated, cross-module incident workflow.
--
-- `signals` remains the immutable evidence bus. A trigger maintains the
-- normalized geography projection in `signal_geo`; operators promote evidence
-- into incidents and record assessments without rewriting source reports.

create extension if not exists postgis with schema extensions;

-- Supabase grants new functions to API roles through project default
-- privileges. Re-assert the intended service-only boundary for organiser
-- credential controls created by the earlier isolation migration.
revoke all on function public.rotate_module_credential(text, text)
  from public, anon, authenticated;
revoke all on function public.revoke_module_credential(text)
  from public, anon, authenticated;
revoke all on function public.set_legacy_module_write_window(timestamptz)
  from public, anon, authenticated;
grant execute on function public.rotate_module_credential(text, text) to service_role;
grant execute on function public.revoke_module_credential(text) to service_role;
grant execute on function public.set_legacy_module_write_window(timestamptz) to service_role;

-- These trigger helpers do not resolve names, but pinning the path removes a
-- mutable-path footgun before reusing touch_updated_at for incidents.
alter function public.touch_updated_at() set search_path = '';
alter function public.touch_dashboard_layout() set search_path = '';

-- ---------------------------------------------------------------------------
-- Response membership: private lookup used by RLS and public access-check RPC.
-- Membership is assigned by organisers, never by browser clients.
-- ---------------------------------------------------------------------------

create table private.response_members (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  role        text not null check (role in ('operator', 'controller', 'admin')),
  created_at  timestamptz not null default now(),
  granted_by  uuid references auth.users (id) on delete set null
);

alter table private.response_members enable row level security;
revoke all on private.response_members from public, anon, authenticated;
grant all on private.response_members to service_role;
grant usage on schema private to authenticated, service_role;

create index response_members_granted_by_idx
  on private.response_members (granted_by)
  where granted_by is not null;

create or replace function private.response_user_role()
returns text
language sql
stable
security definer
set search_path = ''
as $function$
  select rm.role
  from private.response_members rm
  where rm.user_id = (select auth.uid())
  limit 1;
$function$;

create or replace function private.response_user_ok()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select
    (select auth.uid()) is not null
    and exists (
      select 1
      from private.response_members rm
      where rm.user_id = (select auth.uid())
    );
$function$;

revoke all on function private.response_user_role() from public, anon, authenticated;
revoke all on function private.response_user_ok() from public, anon, authenticated;
grant execute on function private.response_user_role() to authenticated, service_role;
grant execute on function private.response_user_ok() to authenticated, service_role;

create or replace function public.response_access()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $function$
  select jsonb_build_object(
    'authorized', private.response_user_ok(),
    'role', private.response_user_role()
  );
$function$;

revoke all on function public.response_access() from public, anon, authenticated;
grant execute on function public.response_access() to authenticated, service_role;

create or replace function public.set_response_member(
  target_user_id uuid,
  target_role text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $function$
begin
  if target_role not in ('operator', 'controller', 'admin') then
    raise exception 'invalid response role';
  end if;

  insert into private.response_members (user_id, role, granted_by)
  values (target_user_id, target_role, (select auth.uid()))
  on conflict (user_id) do update
    set role = excluded.role,
        granted_by = excluded.granted_by;
end;
$function$;

create or replace function public.remove_response_member(target_user_id uuid)
returns void
language sql
volatile
security definer
set search_path = ''
as $function$
  delete from private.response_members where user_id = target_user_id;
$function$;

revoke all on function public.set_response_member(uuid, text)
  from public, anon, authenticated;
revoke all on function public.remove_response_member(uuid)
  from public, anon, authenticated;
grant execute on function public.set_response_member(uuid, text) to service_role;
grant execute on function public.remove_response_member(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Normalized signal geography.
-- ---------------------------------------------------------------------------

create table public.signal_geo (
  signal_id           uuid primary key
                      references public.signals (id) on delete cascade,
  event_at            timestamptz not null,
  location            extensions.geography(Point, 4326) not null,
  location_precision  text not null default 'unknown'
                      check (
                        location_precision in (
                          'exact', 'address', 'street', 'suburb', 'region', 'unknown'
                        )
                      ),
  accuracy_m           double precision
                      check (accuracy_m is null or accuracy_m >= 0),
  created_at           timestamptz not null default now()
);

create index signal_geo_location_gix
  on public.signal_geo using gist (location);
create index signal_geo_geometry_gix
  on public.signal_geo using gist ((location::extensions.geometry));
create index signal_geo_event_at_idx
  on public.signal_geo (event_at desc, signal_id);

alter table public.signal_geo enable row level security;
revoke all on public.signal_geo from public, anon, authenticated;
grant select on public.signal_geo to anon, authenticated;
grant all on public.signal_geo to service_role;

create policy "signal geography follows public signal visibility"
  on public.signal_geo for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.signals s
      join public.modules m on m.id = s.module_id
      where s.id = signal_id
        and m.enabled
    )
  );

create or replace function private.sync_signal_geo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  precision_value text;
  accuracy_value double precision;
begin
  if new.lat is null or new.lng is null then
    delete from public.signal_geo where signal_id = new.id;
    return new;
  end if;

  precision_value := lower(coalesce(new.raw ->> 'location_precision', 'unknown'));
  if precision_value not in ('exact', 'address', 'street', 'suburb', 'region', 'unknown') then
    precision_value := 'unknown';
  end if;

  if coalesce(new.raw ->> 'location_accuracy_m', '') ~ '^[0-9]+([.][0-9]+)?$' then
    accuracy_value := (new.raw ->> 'location_accuracy_m')::double precision;
  else
    accuracy_value := null;
  end if;

  insert into public.signal_geo (
    signal_id,
    event_at,
    location,
    location_precision,
    accuracy_m
  )
  values (
    new.id,
    coalesce(new.observed_at, new.reported_at, new.created_at),
    extensions.st_setsrid(
      extensions.st_makepoint(new.lng, new.lat),
      4326
    )::extensions.geography,
    precision_value,
    accuracy_value
  )
  on conflict (signal_id) do update
    set event_at = excluded.event_at,
        location = excluded.location,
        location_precision = excluded.location_precision,
        accuracy_m = excluded.accuracy_m;

  return new;
end;
$function$;

revoke all on function private.sync_signal_geo() from public, anon, authenticated;

create trigger signals_sync_geography
  after insert or update of lat, lng, observed_at, reported_at, raw
  on public.signals
  for each row execute function private.sync_signal_geo();

-- Existing development rows are intentionally backfilled.
insert into public.signal_geo (
  signal_id,
  event_at,
  location,
  location_precision,
  accuracy_m
)
select
  s.id,
  coalesce(s.observed_at, s.reported_at, s.created_at),
  extensions.st_setsrid(
    extensions.st_makepoint(s.lng, s.lat),
    4326
  )::extensions.geography,
  case
    when lower(coalesce(s.raw ->> 'location_precision', 'unknown'))
      in ('exact', 'address', 'street', 'suburb', 'region', 'unknown')
      then lower(coalesce(s.raw ->> 'location_precision', 'unknown'))
    else 'unknown'
  end,
  case
    when coalesce(s.raw ->> 'location_accuracy_m', '') ~ '^[0-9]+([.][0-9]+)?$'
      then (s.raw ->> 'location_accuracy_m')::double precision
    else null
  end
from public.signals s
where s.lat is not null
  and s.lng is not null
on conflict (signal_id) do update
  set event_at = excluded.event_at,
      location = excluded.location,
      location_precision = excluded.location_precision,
      accuracy_m = excluded.accuracy_m;

-- ---------------------------------------------------------------------------
-- Versioned spatial reference layers and hazard-specific matching rules.
-- ---------------------------------------------------------------------------

create table public.response_areas (
  id              uuid primary key default gen_random_uuid(),
  name            text not null check (length(name) between 1 and 200),
  area_type       text not null default 'locality'
                  check (area_type in ('locality', 'suburb', 'ward', 'response', 'custom')),
  geom            extensions.geometry(MultiPolygon, 4326) not null,
  source          text,
  source_version  text,
  effective_at    timestamptz,
  public_visible  boolean not null default true,
  created_at      timestamptz not null default now()
);

create index response_areas_geom_gix
  on public.response_areas using gist (geom);
create index response_areas_type_name_idx
  on public.response_areas (area_type, name);

alter table public.response_areas enable row level security;
revoke all on public.response_areas from public, anon, authenticated;
grant select on public.response_areas to anon, authenticated;
grant all on public.response_areas to service_role;

create policy "public response areas are readable"
  on public.response_areas for select
  to anon
  using (public_visible);

create policy "operators can read response areas"
  on public.response_areas for select
  to authenticated
  using (public_visible or (select private.response_user_ok()));

create table public.triage_rules (
  signal_type            text primary key,
  correlation_radius_m   integer not null default 500
                         check (correlation_radius_m between 25 and 10000),
  correlation_window     interval not null default interval '30 minutes'
                         check (
                           correlation_window >= interval '1 minute'
                           and correlation_window <= interval '7 days'
                         ),
  stale_after            interval not null default interval '24 hours'
                         check (
                           stale_after >= interval '5 minutes'
                           and stale_after <= interval '30 days'
                         ),
  updated_at             timestamptz not null default now()
);

alter table public.triage_rules enable row level security;
revoke all on public.triage_rules from public, anon, authenticated;
grant select on public.triage_rules to authenticated;
grant all on public.triage_rules to service_role;

create policy "operators can read triage rules"
  on public.triage_rules for select
  to authenticated
  using ((select private.response_user_ok()));

-- ---------------------------------------------------------------------------
-- Operational incidents and append-only assessment history.
-- ---------------------------------------------------------------------------

create table public.incidents (
  id                        uuid primary key default gen_random_uuid(),
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  title                     text not null check (length(title) between 1 and 200),
  signal_type               text not null,
  status                    text not null default 'new'
                            check (
                              status in ('new', 'monitoring', 'active', 'resolved', 'dismissed')
                            ),
  action_priority           text not null default 'p4'
                            check (action_priority in ('p1', 'p2', 'p3', 'p4')),
  verification_priority     text not null default 'p3'
                            check (verification_priority in ('p1', 'p2', 'p3', 'p4')),
  first_seen_at             timestamptz not null,
  last_seen_at              timestamptz not null,
  location                  extensions.geography(Point, 4326),
  extent                    extensions.geometry(Geometry, 4326),
  evidence_count            integer not null default 0 check (evidence_count >= 0),
  independent_source_count  integer not null default 0
                            check (independent_source_count >= 0),
  reason_codes              text[] not null default '{}',
  assigned_to               uuid references auth.users (id) on delete set null,
  created_by                uuid references auth.users (id) on delete set null,
  closed_at                 timestamptz,
  notes                     text check (notes is null or length(notes) <= 4000)
);

create index incidents_status_last_seen_idx
  on public.incidents (status, last_seen_at desc, id);
create index incidents_signal_type_last_seen_idx
  on public.incidents (signal_type, last_seen_at desc, id);
create index incidents_assigned_to_idx
  on public.incidents (assigned_to)
  where assigned_to is not null;
create index incidents_created_by_idx
  on public.incidents (created_by)
  where created_by is not null;
create index incidents_location_gix
  on public.incidents using gist (location);

create trigger incidents_touch_updated_at
  before update on public.incidents
  for each row execute function public.touch_updated_at();

create table public.incident_evidence (
  incident_id       uuid not null references public.incidents (id) on delete cascade,
  signal_id         uuid not null references public.signals (id) on delete cascade,
  match_method      text not null
                    check (match_method in ('manual', 'seed', 'spatiotemporal', 'exact_source')),
  match_distance_m  double precision
                    check (match_distance_m is null or match_distance_m >= 0),
  created_at        timestamptz not null default now(),
  added_by          uuid references auth.users (id) on delete set null,
  primary key (incident_id, signal_id),
  unique (signal_id)
);

create index incident_evidence_added_by_idx
  on public.incident_evidence (added_by)
  where added_by is not null;

create table public.incident_assessments (
  id                     uuid primary key default gen_random_uuid(),
  incident_id            uuid not null references public.incidents (id) on delete cascade,
  created_at             timestamptz not null default now(),
  actor_id               uuid not null references auth.users (id) on delete restrict,
  status                 text not null
                         check (
                           status in ('new', 'monitoring', 'active', 'resolved', 'dismissed')
                         ),
  action_priority        text not null
                         check (action_priority in ('p1', 'p2', 'p3', 'p4')),
  verification_priority  text not null
                         check (verification_priority in ('p1', 'p2', 'p3', 'p4')),
  reason_codes           text[] not null default '{}',
  note                   text check (note is null or length(note) <= 4000)
);

create index incident_assessments_incident_created_idx
  on public.incident_assessments (incident_id, created_at desc, id desc);
create index incident_assessments_actor_idx
  on public.incident_assessments (actor_id, created_at desc);

alter table public.incidents enable row level security;
alter table public.incident_evidence enable row level security;
alter table public.incident_assessments enable row level security;

revoke all on public.incidents, public.incident_evidence, public.incident_assessments
  from public, anon, authenticated;
-- Browser clients read through RLS. All mutations use the audited RPCs below,
-- so an incident assessment cannot silently skip its history row.
grant select on public.incidents, public.incident_evidence, public.incident_assessments
  to authenticated;
grant all on public.incidents, public.incident_evidence, public.incident_assessments
  to service_role;

create policy "operators manage incidents"
  on public.incidents for all
  to authenticated
  using ((select private.response_user_ok()))
  with check ((select private.response_user_ok()));

create policy "operators read incident evidence"
  on public.incident_evidence for select
  to authenticated
  using ((select private.response_user_ok()));
create policy "operators add incident evidence"
  on public.incident_evidence for insert
  to authenticated
  with check ((select private.response_user_ok()));
create policy "operators remove incident evidence"
  on public.incident_evidence for delete
  to authenticated
  using ((select private.response_user_ok()));

create policy "operators read incident assessments"
  on public.incident_assessments for select
  to authenticated
  using ((select private.response_user_ok()));
create policy "operators add incident assessments"
  on public.incident_assessments for insert
  to authenticated
  with check (
    (select private.response_user_ok())
    and actor_id = (select auth.uid())
  );

-- ---------------------------------------------------------------------------
-- Public spatial read RPCs.
-- ---------------------------------------------------------------------------

create or replace function public.signals_nearby(
  p_lat double precision,
  p_lng double precision,
  p_radius_m integer default 1000,
  p_since timestamptz default null,
  p_limit integer default 100
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $function$
declare
  result jsonb;
begin
  if p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'invalid WGS84 coordinate';
  end if;

  select coalesce(jsonb_agg(row_data order by distance_m, event_at desc), '[]'::jsonb)
  into result
  from (
    select
      (to_jsonb(s) - 'raw') || jsonb_build_object(
        'event_at', g.event_at,
        'distance_m', round(
          extensions.st_distance(
            g.location,
            extensions.st_setsrid(
              extensions.st_makepoint(p_lng, p_lat),
              4326
            )::extensions.geography
          )::numeric,
          1
        ),
        'location_precision', g.location_precision,
        'accuracy_m', g.accuracy_m
      ) as row_data,
      extensions.st_distance(
        g.location,
        extensions.st_setsrid(
          extensions.st_makepoint(p_lng, p_lat),
          4326
        )::extensions.geography
      ) as distance_m,
      g.event_at
    from public.signal_geo g
    join public.signals s on s.id = g.signal_id
    join public.modules m on m.id = s.module_id
    where m.enabled
      and g.event_at >= coalesce(p_since, now() - interval '24 hours')
      and extensions.st_dwithin(
        g.location,
        extensions.st_setsrid(
          extensions.st_makepoint(p_lng, p_lat),
          4326
        )::extensions.geography,
        least(greatest(coalesce(p_radius_m, 1000), 1), 100000)
      )
    order by distance_m, g.event_at desc
    limit least(greatest(coalesce(p_limit, 100), 1), 500)
  ) q;

  return result;
end;
$function$;

create or replace function public.signals_in_view(
  p_min_lat double precision,
  p_min_lng double precision,
  p_max_lat double precision,
  p_max_lng double precision,
  p_since timestamptz default null,
  p_limit integer default 500
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $function$
declare
  result jsonb;
begin
  if p_min_lat not between -90 and 90
    or p_max_lat not between -90 and 90
    or p_min_lng not between -180 and 180
    or p_max_lng not between -180 and 180
    or p_min_lat >= p_max_lat
    or p_min_lng >= p_max_lng
  then
    raise exception 'invalid WGS84 bounding box';
  end if;

  select coalesce(jsonb_agg(row_data order by event_at desc, id desc), '[]'::jsonb)
  into result
  from (
    select
      (to_jsonb(s) - 'raw') || jsonb_build_object(
        'event_at', g.event_at,
        'location_precision', g.location_precision,
        'accuracy_m', g.accuracy_m
      ) as row_data,
      g.event_at,
      s.id
    from public.signal_geo g
    join public.signals s on s.id = g.signal_id
    join public.modules m on m.id = s.module_id
    where m.enabled
      and g.event_at >= coalesce(p_since, now() - interval '24 hours')
      and (g.location::extensions.geometry)
        operator(extensions.&&)
        extensions.st_makeenvelope(
          p_min_lng,
          p_min_lat,
          p_max_lng,
          p_max_lat,
          4326
        )
    order by g.event_at desc, s.id desc
    limit least(greatest(coalesce(p_limit, 500), 1), 1000)
  ) q;

  return result;
end;
$function$;

create or replace function public.signals_in_response_area(
  p_area_id uuid,
  p_since timestamptz default null,
  p_limit integer default 500
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $function$
  select coalesce(jsonb_agg(row_data order by event_at desc, id desc), '[]'::jsonb)
  from (
    select
      (to_jsonb(s) - 'raw') || jsonb_build_object(
        'event_at', g.event_at,
        'area_id', a.id,
        'area_name', a.name,
        'location_precision', g.location_precision,
        'accuracy_m', g.accuracy_m
      ) as row_data,
      g.event_at,
      s.id
    from public.response_areas a
    join public.signal_geo g
      on extensions.st_covers(a.geom, g.location::extensions.geometry)
    join public.signals s on s.id = g.signal_id
    join public.modules m on m.id = s.module_id
    where a.id = p_area_id
      and m.enabled
      and g.event_at >= coalesce(p_since, now() - interval '24 hours')
    order by g.event_at desc, s.id desc
    limit least(greatest(coalesce(p_limit, 500), 1), 1000)
  ) rows;
$function$;

create or replace function public.signal_hotspots(
  p_since timestamptz default null,
  p_eps_m integer default 750,
  p_minpoints integer default 2,
  p_limit integer default 50
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $function$
  with located as (
    select
      s.id,
      s.signal_type,
      s.place_name,
      s.severity,
      s.verification,
      s.module_id,
      s.source_type,
      s.source,
      s.link,
      g.event_at,
      extensions.st_transform(g.location::extensions.geometry, 2193) as geom_nztm,
      case s.severity
        when 'extreme' then 4
        when 'severe' then 3
        when 'moderate' then 2
        when 'minor' then 1
        else 0
      end as severity_rank
    from public.signal_geo g
    join public.signals s on s.id = g.signal_id
    join public.modules m on m.id = s.module_id
    where m.enabled
      and s.verification <> 'false_report'
      and g.event_at >= greatest(
        coalesce(p_since, now() - interval '24 hours'),
        now() - interval '168 hours'
      )
    order by g.event_at desc, s.id desc
    limit 5000
  ),
  clustered as (
    select
      located.*,
      extensions.st_clusterdbscan(
        geom_nztm,
        eps => least(greatest(coalesce(p_eps_m, 750), 25), 10000)::double precision,
        minpoints => least(greatest(coalesce(p_minpoints, 2), 2), 20)
      ) over (
        partition by signal_type
        order by event_at, id
      ) as cluster_id
    from located
  ),
  grouped as (
    select
      signal_type,
      cluster_id,
      count(*)::integer as signal_count,
      count(*) filter (where verification = 'unverified')::integer as unverified_count,
      count(distinct coalesce(
        nullif(link, ''),
        nullif(lower(source), ''),
        module_id || ':' || source_type
      ))::integer as independent_source_count,
      min(event_at) as first_seen_at,
      max(event_at) as last_seen_at,
      max(severity_rank) as max_severity_rank,
      (
        array_agg(place_name order by event_at desc)
          filter (where place_name is not null and btrim(place_name) <> '')
      )[1] as representative_place,
      extensions.st_centroid(extensions.st_collect(geom_nztm)) as centroid_nztm
    from clustered
    where cluster_id is not null
    group by signal_type, cluster_id
  ),
  limited as (
    select *
    from grouped
    order by max_severity_rank desc, signal_count desc, last_seen_at desc
    limit least(greatest(coalesce(p_limit, 50), 1), 200)
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'key', signal_type || ':' || cluster_id,
        'signal_type', signal_type,
        'label', coalesce(representative_place, signal_type || ' hotspot'),
        'signal_count', signal_count,
        'unverified_count', unverified_count,
        'independent_source_count', independent_source_count,
        'first_seen_at', first_seen_at,
        'last_seen_at', last_seen_at,
        'max_severity', case max_severity_rank
          when 4 then 'extreme'
          when 3 then 'severe'
          when 2 then 'moderate'
          when 1 then 'minor'
          else 'unknown'
        end,
        'lat', extensions.st_y(
          extensions.st_transform(centroid_nztm, 4326)
        ),
        'lng', extensions.st_x(
          extensions.st_transform(centroid_nztm, 4326)
        )
      )
      order by max_severity_rank desc, signal_count desc, last_seen_at desc
    ),
    '[]'::jsonb
  )
  from limited;
$function$;

revoke all on function public.signals_nearby(
  double precision, double precision, integer, timestamptz, integer
) from public, anon, authenticated;
revoke all on function public.signals_in_view(
  double precision, double precision, double precision, double precision, timestamptz, integer
) from public, anon, authenticated;
revoke all on function public.signals_in_response_area(uuid, timestamptz, integer)
  from public, anon, authenticated;
revoke all on function public.signal_hotspots(timestamptz, integer, integer, integer)
  from public, anon, authenticated;

grant execute on function public.signals_nearby(
  double precision, double precision, integer, timestamptz, integer
) to anon, authenticated, service_role;
grant execute on function public.signals_in_view(
  double precision, double precision, double precision, double precision, timestamptz, integer
) to anon, authenticated, service_role;
grant execute on function public.signals_in_response_area(uuid, timestamptz, integer)
  to anon, authenticated, service_role;
grant execute on function public.signal_hotspots(timestamptz, integer, integer, integer)
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Operator-only triage and incident mutation RPCs.
-- ---------------------------------------------------------------------------

create or replace function public.signal_triage_queue(
  p_window_hours integer default 24,
  p_limit integer default 100
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $function$
declare
  result jsonb;
begin
  if not private.response_user_ok() then
    raise exception 'response operator access required' using errcode = '42501';
  end if;

  with eligible as (
    select
      s.*,
      coalesce(g.event_at, s.observed_at, s.reported_at, s.created_at) as event_at,
      g.location,
      g.location_precision,
      g.accuracy_m,
      coalesce(r.correlation_radius_m, 500) as correlation_radius_m,
      coalesce(r.correlation_window, interval '30 minutes') as correlation_window,
      case s.severity
        when 'extreme' then 4
        when 'severe' then 3
        when 'moderate' then 2
        when 'minor' then 1
        else 0
      end as severity_rank
    from public.signals s
    join public.modules m on m.id = s.module_id
    left join public.signal_geo g on g.signal_id = s.id
    left join public.triage_rules r on r.signal_type = s.signal_type
    where m.enabled
      and s.verification <> 'false_report'
      and not exists (
        select 1
        from public.incident_evidence ie
        where ie.signal_id = s.id
      )
      and coalesce(g.event_at, s.observed_at, s.reported_at, s.created_at)
        >= now() - make_interval(hours => least(greatest(coalesce(p_window_hours, 24), 1), 168))
      and (
        s.verification = 'unverified'
        or s.severity in ('moderate', 'severe', 'extreme')
      )
  ),
  candidates as (
    -- Spatial correlation is intentionally bounded before the per-row lateral
    -- lookup. A public demo credential must not be able to turn a seven-day
    -- queue into an unbounded number of GiST probes.
    select *
    from eligible
    order by
      severity_rank desc,
      (verification = 'unverified') desc,
      event_at desc,
      id desc
    limit least(greatest(coalesce(p_limit, 100), 10), 200) * 10
  ),
  enriched as (
    select
      c.*,
      coalesce(nearby.nearby_count, 0) as nearby_count,
      coalesce(nearby.independent_source_count, 1) as independent_source_count
    from candidates c
    left join lateral (
      select
        count(*)::integer as nearby_count,
        count(distinct coalesce(
          nullif(ns.link, ''),
          nullif(lower(ns.source), ''),
          ns.module_id || ':' || ns.source_type
        ))::integer as independent_source_count
      from public.signal_geo ng
      join public.signals ns on ns.id = ng.signal_id
      join public.modules nm on nm.id = ns.module_id
      where c.location is not null
        and nm.enabled
        and ns.verification <> 'false_report'
        and ns.signal_type = c.signal_type
        and ng.event_at between
          c.event_at - c.correlation_window
          and c.event_at + c.correlation_window
        and extensions.st_dwithin(
          ng.location,
          c.location,
          c.correlation_radius_m
        )
    ) nearby on true
  ),
  ranked as (
    select
      e.*,
      case
        when severity_rank = 4
          and (
            verification in ('verified', 'corroborated')
            or source_type = 'official'
            or independent_source_count >= 2
          ) then 'p1'
        when severity_rank >= 3 then 'p2'
        when severity_rank = 2 or independent_source_count >= 2 then 'p3'
        else 'p4'
      end as action_priority,
      case
        when verification = 'unverified' and severity_rank >= 3 then 'p1'
        when verification = 'unverified'
          and (severity_rank = 2 or independent_source_count >= 2) then 'p2'
        when verification = 'unverified' then 'p3'
        else 'p4'
      end as verification_priority
    from enriched e
  ),
  limited as (
    select *
    from ranked
    order by
      least(
        case action_priority when 'p1' then 1 when 'p2' then 2 when 'p3' then 3 else 4 end,
        case verification_priority when 'p1' then 1 when 'p2' then 2 when 'p3' then 3 else 4 end
      ),
      severity_rank desc,
      independent_source_count desc,
      event_at desc,
      id desc
    limit least(greatest(coalesce(p_limit, 100), 1), 200)
  )
  select coalesce(
    jsonb_agg(
      (to_jsonb(limited) - 'raw' - 'location' - 'severity_rank'
        - 'correlation_radius_m' - 'correlation_window')
      || jsonb_build_object(
        'reason_codes',
        array_remove(array[
          case when severity in ('severe', 'extreme') then 'high_consequence' end,
          case when verification = 'unverified' then 'needs_verification' end,
          case when independent_source_count >= 2 then 'independent_corroboration' end,
          case when nearby_count >= 3 then 'spatial_cluster' end,
          case when location is null then 'missing_location' end,
          case when location_precision in ('suburb', 'region', 'unknown')
            then 'low_location_precision' end,
          case when source_type = 'official' then 'official_source' end
        ], null)
      )
      order by
        least(
          case action_priority when 'p1' then 1 when 'p2' then 2 when 'p3' then 3 else 4 end,
          case verification_priority when 'p1' then 1 when 'p2' then 2 when 'p3' then 3 else 4 end
        ),
        severity_rank desc,
        independent_source_count desc,
        event_at desc,
        id desc
    ),
    '[]'::jsonb
  )
  into result
  from limited;

  return result;
end;
$function$;

create or replace function public.create_incident_from_signal(p_signal_id uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  existing_incident_id uuid;
  new_incident_id uuid;
  candidate_signal_ids uuid[];
  candidate_signal_id uuid;
  seed_signal public.signals%rowtype;
  seed_geo public.signal_geo%rowtype;
  radius_m integer;
  time_window interval;
  seed_event_at timestamptz;
  initial_action_priority text;
  initial_verification_priority text;
begin
  if not private.response_user_ok() then
    raise exception 'response operator access required' using errcode = '42501';
  end if;

  select s.*
  into strict seed_signal
  from public.signals s
  join public.modules m on m.id = s.module_id
  where s.id = p_signal_id
    and m.enabled
    and s.verification <> 'false_report';

  select g.*
  into seed_geo
  from public.signal_geo g
  where g.signal_id = p_signal_id;

  seed_event_at := coalesce(
    seed_geo.event_at,
    seed_signal.observed_at,
    seed_signal.reported_at,
    seed_signal.created_at
  );

  select
    coalesce(r.correlation_radius_m, 500),
    coalesce(r.correlation_window, interval '30 minutes')
  into radius_m, time_window
  from (select 1) singleton
  left join public.triage_rules r on r.signal_type = seed_signal.signal_type;

  select coalesce(
    array_agg(candidate.id order by candidate.id),
    array[p_signal_id]
  )
  into candidate_signal_ids
  from (
    select s.id
    from public.signals s
    join public.modules m on m.id = s.module_id
    left join public.signal_geo g on g.signal_id = s.id
    where m.enabled
      and s.verification <> 'false_report'
      and s.signal_type = seed_signal.signal_type
      and (
        s.id = p_signal_id
        or (
          seed_geo.location is not null
          and g.location is not null
          and g.event_at between seed_event_at - time_window and seed_event_at + time_window
          and extensions.st_dwithin(g.location, seed_geo.location, radius_m)
        )
      )
  ) candidate;

  -- Lock every correlated evidence row in UUID order. Neighboring signals
  -- therefore share at least one lock and cannot be promoted into competing
  -- incidents by concurrent operators.
  foreach candidate_signal_id in array candidate_signal_ids loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(candidate_signal_id::text, 0)
    );
  end loop;

  select ie.incident_id
  into existing_incident_id
  from public.incident_evidence ie
  where ie.signal_id = any(candidate_signal_ids)
  order by
    (ie.signal_id = p_signal_id) desc,
    ie.created_at,
    ie.incident_id
  limit 1;

  initial_action_priority := case
    when seed_signal.severity = 'extreme'
      and (
        seed_signal.verification in ('verified', 'corroborated')
        or seed_signal.source_type = 'official'
      ) then 'p1'
    when seed_signal.severity in ('extreme', 'severe') then 'p2'
    when seed_signal.severity = 'moderate' then 'p3'
    else 'p4'
  end;

  initial_verification_priority := case
    when seed_signal.verification = 'unverified'
      and seed_signal.severity in ('extreme', 'severe') then 'p1'
    when seed_signal.verification = 'unverified'
      and seed_signal.severity = 'moderate' then 'p2'
    when seed_signal.verification = 'unverified' then 'p3'
    else 'p4'
  end;

  if existing_incident_id is null then
    insert into public.incidents (
      title,
      signal_type,
      action_priority,
      verification_priority,
      first_seen_at,
      last_seen_at,
      location,
      reason_codes,
      created_by
    )
    values (
      seed_signal.title,
      seed_signal.signal_type,
      initial_action_priority,
      initial_verification_priority,
      seed_event_at,
      seed_event_at,
      seed_geo.location,
      array_remove(array[
        case when seed_signal.severity in ('severe', 'extreme') then 'high_consequence' end,
        case when seed_signal.verification = 'unverified' then 'needs_verification' end,
        case when seed_geo.signal_id is null then 'missing_location' end
      ], null),
      (select auth.uid())
    )
    returning id into new_incident_id;
  else
    new_incident_id := existing_incident_id;
  end if;

  insert into public.incident_evidence (
    incident_id,
    signal_id,
    match_method,
    match_distance_m,
    added_by
  )
  select
    new_incident_id,
    s.id,
    case
      when s.id = p_signal_id and existing_incident_id is null then 'seed'
      else 'spatiotemporal'
    end,
    case
      when s.id = p_signal_id or seed_geo.location is null or g.location is null then 0
      else extensions.st_distance(g.location, seed_geo.location)
    end,
    (select auth.uid())
  from public.signals s
  join public.modules m on m.id = s.module_id
  left join public.signal_geo g on g.signal_id = s.id
  where s.id = any(candidate_signal_ids)
  on conflict (signal_id) do nothing;

  update public.incidents i
  set
    first_seen_at = summary.first_seen_at,
    last_seen_at = summary.last_seen_at,
    evidence_count = summary.evidence_count,
    independent_source_count = summary.independent_source_count,
    location = coalesce(summary.centroid, i.location),
    reason_codes = case
      when summary.independent_source_count >= 2
        and not ('independent_corroboration' = any(i.reason_codes))
        then array_append(i.reason_codes, 'independent_corroboration')
      else i.reason_codes
    end
  from (
    select
      min(coalesce(g.event_at, s.observed_at, s.reported_at, s.created_at)) as first_seen_at,
      max(coalesce(g.event_at, s.observed_at, s.reported_at, s.created_at)) as last_seen_at,
      count(*)::integer as evidence_count,
      count(distinct coalesce(
        nullif(s.link, ''),
        nullif(lower(s.source), ''),
        s.module_id || ':' || s.source_type
      ))::integer as independent_source_count,
      (
        extensions.st_centroid(
          extensions.st_collect(g.location::extensions.geometry)
        )::extensions.geography
      ) as centroid
    from public.incident_evidence ie
    join public.signals s on s.id = ie.signal_id
    left join public.signal_geo g on g.signal_id = s.id
    where ie.incident_id = new_incident_id
  ) summary
  where i.id = new_incident_id;

  return new_incident_id;
end;
$function$;

create or replace function public.assess_incident(
  p_incident_id uuid,
  p_status text,
  p_action_priority text,
  p_verification_priority text,
  p_reason_codes text[] default '{}',
  p_note text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  updated_incident public.incidents%rowtype;
begin
  if not private.response_user_ok() then
    raise exception 'response operator access required' using errcode = '42501';
  end if;

  update public.incidents
  set status = p_status,
      action_priority = p_action_priority,
      verification_priority = p_verification_priority,
      reason_codes = coalesce(p_reason_codes, '{}'),
      notes = case when p_note is null then notes else p_note end,
      closed_at = case
        when p_status in ('resolved', 'dismissed') then coalesce(closed_at, now())
        else null
      end
  where id = p_incident_id
  returning * into strict updated_incident;

  insert into public.incident_assessments (
    incident_id,
    actor_id,
    status,
    action_priority,
    verification_priority,
    reason_codes,
    note
  )
  values (
    p_incident_id,
    (select auth.uid()),
    p_status,
    p_action_priority,
    p_verification_priority,
    coalesce(p_reason_codes, '{}'),
    p_note
  );

  return to_jsonb(updated_incident) - 'location' - 'extent';
end;
$function$;

revoke all on function public.signal_triage_queue(integer, integer)
  from public, anon, authenticated;
revoke all on function public.create_incident_from_signal(uuid)
  from public, anon, authenticated;
revoke all on function public.assess_incident(
  uuid, text, text, text, text[], text
) from public, anon, authenticated;

grant execute on function public.signal_triage_queue(integer, integer)
  to authenticated, service_role;
grant execute on function public.create_incident_from_signal(uuid)
  to authenticated, service_role;
grant execute on function public.assess_incident(
  uuid, text, text, text, text[], text
) to authenticated, service_role;

-- Realtime remains one browser channel. These publication entries only make
-- operator-visible incident changes available to that existing channel.
do $block$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'incidents'
  ) then
    alter publication supabase_realtime add table public.incidents;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'incident_evidence'
  ) then
    alter publication supabase_realtime add table public.incident_evidence;
  end if;
end
$block$;
