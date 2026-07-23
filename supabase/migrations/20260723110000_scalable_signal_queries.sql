-- Authoritative signal aggregates + stable keyset history.
--
-- The browser realtime store intentionally retains only 500 recent rows.
-- Counts and historical access therefore live in database functions: one
-- summary RPC replaces per-widget/per-module count queries, while the history
-- RPC pages on the immutable (created_at, id) tuple.

create index signals_created_id_idx
  on public.signals (created_at desc, id desc);

create index signals_module_type_created_id_idx
  on public.signals (module_id, signal_type, created_at desc, id desc);

create or replace function public.signal_aggregates()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $function$
  with enabled_signals as materialized (
    select s.*
    from public.signals s
    join public.modules m on m.id = s.module_id
    where m.enabled
  ),
  summary as (
    select
      count(*) as total,
      max(created_at) as newest_created_at,
      count(*) filter (where created_at >= now() - interval '60 minutes') as active_60m,
      count(*) filter (where created_at >= now() - interval '15 minutes') as new_15m,
      count(*) filter (
        where created_at >= now() - interval '30 minutes'
          and created_at < now() - interval '15 minutes'
      ) as previous_15m,
      count(*) filter (
        where source_type = 'official'
          and created_at >= now() - interval '60 minutes'
      ) as official_active_60m,
      count(distinct place_name) filter (
        where place_name is not null and btrim(place_name) <> ''
      ) as distinct_places,
      jsonb_build_object(
        'minor', count(*) filter (where severity = 'minor'),
        'moderate', count(*) filter (where severity = 'moderate'),
        'severe', count(*) filter (where severity = 'severe'),
        'extreme', count(*) filter (where severity = 'extreme'),
        'unknown', count(*) filter (where severity = 'unknown')
      ) as by_severity,
      jsonb_build_object(
        'official', count(*) filter (where source_type = 'official'),
        'community', count(*) filter (where source_type = 'community'),
        'media', count(*) filter (where source_type = 'media'),
        'sensor', count(*) filter (where source_type = 'sensor')
      ) as by_source,
      jsonb_build_object(
        'unverified', count(*) filter (where verification = 'unverified'),
        'corroborated', count(*) filter (where verification = 'corroborated'),
        'verified', count(*) filter (where verification = 'verified'),
        'false_report', count(*) filter (where verification = 'false_report')
      ) as by_verification
    from enabled_signals
  ),
  module_totals as (
    select module_id, count(*) as count
    from enabled_signals
    group by module_id
  ),
  module_types as (
    select module_id, signal_type, count(*) as count
    from enabled_signals
    group by module_id, signal_type
  )
  select jsonb_build_object(
    'generated_at', statement_timestamp(),
    'newest_created_at', summary.newest_created_at,
    'total', summary.total,
    'active_60m', summary.active_60m,
    'new_15m', summary.new_15m,
    'previous_15m', summary.previous_15m,
    'official_active_60m', summary.official_active_60m,
    'distinct_places', summary.distinct_places,
    'by_severity', summary.by_severity,
    'by_source', summary.by_source,
    'by_verification', summary.by_verification,
    'by_module', coalesce(
      (select jsonb_object_agg(module_id, count order by module_id) from module_totals),
      '{}'::jsonb
    ),
    'module_signal_types', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'module_id', module_id,
            'signal_type', signal_type,
            'count', count
          )
          order by module_id, signal_type
        )
        from module_types
      ),
      '[]'::jsonb
    )
  )
  from summary;
$function$;

comment on function public.signal_aggregates() is
  'Exact enabled-module signal totals and breakdowns for the capped realtime client store.';

create or replace function public.signal_history_page(
  p_limit integer default 50,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null,
  p_module_id text default null,
  p_signal_type text default null
)
returns setof public.signals
language sql
stable
security invoker
set search_path = ''
as $function$
  select s.*
  from public.signals s
  join public.modules m on m.id = s.module_id
  where m.enabled
    and (p_module_id is null or s.module_id = p_module_id)
    and (p_signal_type is null or s.signal_type = p_signal_type)
    and (
      p_before_created_at is null
      or p_before_id is null
      or (s.created_at, s.id) < (p_before_created_at, p_before_id)
    )
  order by s.created_at desc, s.id desc
  limit least(greatest(coalesce(p_limit, 50), 1), 101);
$function$;

comment on function public.signal_history_page(integer, timestamptz, uuid, text, text) is
  'Stable keyset pagination over enabled-module signals; callers request page size + 1.';

grant execute on function public.signal_aggregates()
  to anon, authenticated, service_role;
grant execute on function public.signal_history_page(integer, timestamptz, uuid, text, text)
  to anon, authenticated, service_role;
