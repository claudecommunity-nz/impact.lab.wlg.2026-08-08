-- Bounded analytical cells for the authenticated regional response map.
--
-- These rows are deliberately called report concentrations rather than
-- incidents. A fixed metric grid prevents density chaining from turning a
-- sequence of nearby reports into a multi-kilometre "pocket". A human still
-- has to inspect and verify the underlying evidence before creating an
-- operational incident.

create or replace function public.signal_serious_pockets(
  p_since timestamptz default null,
  p_cell_m integer default 750,
  p_minpoints integer default 2,
  p_limit integer default 12
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

  with parameters as (
    select
      greatest(
        coalesce(p_since, now() - interval '24 hours'),
        now() - interval '168 hours'
      ) as since_at,
      least(greatest(coalesce(p_cell_m, 750), 250), 2000)::integer as cell_m,
      least(greatest(coalesce(p_minpoints, 2), 2), 20)::integer as min_points,
      least(greatest(coalesce(p_limit, 12), 1), 50)::integer as pocket_limit
  ),
  eligible as (
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
      g.location,
      g.location_precision,
      g.accuracy_m,
      case s.severity
        when 'extreme' then 4
        when 'severe' then 3
        when 'moderate' then 2
        else 0
      end as severity_rank
    from public.signal_geo g
    join public.signals s on s.id = g.signal_id
    join public.modules m on m.id = s.module_id
    cross join parameters
    where m.enabled
      and s.verification <> 'false_report'
      and s.severity in ('moderate', 'severe', 'extreme')
      and g.event_at >= parameters.since_at
      and g.event_at <= now() + interval '5 minutes'
  ),
  candidate_window as (
    -- Keep one overflow row so the response can disclose its analytical cap
    -- without an unbounded count over a public-sized time window.
    select *
    from eligible
    order by severity_rank desc, event_at desc, id desc
    limit 5001
  ),
  candidate_meta as (
    select
      least(count(*), 5000)::integer as candidate_count,
      count(*) > 5000 as candidates_truncated
    from candidate_window
  ),
  located as (
    select
      candidate_window.*,
      extensions.st_transform(
        location::extensions.geometry,
        2193
      ) as geom_nztm
    from candidate_window
    order by severity_rank desc, event_at desc, id desc
    limit 5000
  ),
  gridded as (
    select
      located.*,
      floor(
        extensions.st_x(geom_nztm) / parameters.cell_m
      )::bigint as cell_x,
      floor(
        extensions.st_y(geom_nztm) / parameters.cell_m
      )::bigint as cell_y,
      parameters.cell_m,
      parameters.min_points,
      parameters.pocket_limit
    from located
    cross join parameters
  ),
  grouped as (
    select
      cell_x,
      cell_y,
      cell_m,
      max(pocket_limit) as pocket_limit,
      count(*)::integer as report_count,
      count(*) filter (
        where severity in ('severe', 'extreme')
      )::integer as serious_count,
      count(*) filter (where severity = 'moderate')::integer as moderate_count,
      count(*) filter (where severity = 'severe')::integer as severe_count,
      count(*) filter (where severity = 'extreme')::integer as extreme_count,
      count(*) filter (
        where severity in ('severe', 'extreme')
          and verification = 'unverified'
      )::integer as unverified_serious_count,
      count(*) filter (
        where severity in ('severe', 'extreme')
          and verification in ('verified', 'corroborated')
      )::integer as verified_or_corroborated_serious_count,
      count(*) filter (
        where severity in ('severe', 'extreme')
          and source_type = 'official'
      )::integer as official_serious_count,
      count(distinct coalesce(
        nullif(link, ''),
        nullif(lower(source), ''),
        module_id || ':' || source_type
      ))::integer as reported_origin_count,
      min(event_at) as first_seen_at,
      max(event_at) as last_seen_at,
      max(severity_rank) as max_severity_rank,
      (
        array_agg(place_name order by event_at desc)
          filter (
            where place_name is not null
              and btrim(place_name) <> ''
          )
      )[1] as representative_place,
      count(*) filter (
        where location_precision in ('suburb', 'region', 'unknown')
      )::integer as coarse_location_count,
      count(*) filter (
        where location_precision = 'unknown'
      )::integer as unknown_precision_count,
      max(accuracy_m) as max_accuracy_m,
      extensions.st_centroid(
        extensions.st_collect(geom_nztm)
      ) as centroid_nztm,
      extensions.st_makeenvelope(
        cell_x * cell_m,
        cell_y * cell_m,
        (cell_x + 1) * cell_m,
        (cell_y + 1) * cell_m,
        2193
      ) as cell_extent_nztm
    from gridded
    group by cell_x, cell_y, cell_m, min_points
    having count(*) >= min_points
      and count(*) filter (
        where severity in ('severe', 'extreme')
      ) > 0
  ),
  type_counts as (
    select
      cell_x,
      cell_y,
      jsonb_agg(
        jsonb_build_object(
          'signal_type', signal_type,
          'count', type_count
        )
        order by type_count desc, signal_type
      ) as signal_types
    from (
      select
        cell_x,
        cell_y,
        signal_type,
        count(*)::integer as type_count
      from gridded
      group by cell_x, cell_y, signal_type
    ) counts
    group by cell_x, cell_y
  ),
  qualifying as (
    select grouped.*, type_counts.signal_types
    from grouped
    join type_counts using (cell_x, cell_y)
  ),
  qualifying_meta as (
    select
      count(*)::integer as qualifying_pocket_count,
      coalesce(sum(report_count), 0)::integer as qualifying_report_count,
      coalesce(sum(serious_count), 0)::integer as qualifying_serious_count,
      coalesce(sum(unverified_serious_count), 0)::integer
        as qualifying_unverified_serious_count,
      coalesce(max(pocket_limit), (select pocket_limit from parameters))::integer
        as pocket_limit
    from qualifying
  ),
  limited as (
    select *
    from qualifying
    order by
      max_severity_rank desc,
      serious_count desc,
      reported_origin_count desc,
      last_seen_at desc,
      cell_x,
      cell_y
    limit (select pocket_limit from parameters)
  ),
  pockets as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'key', 'cell:' || cell_x || ':' || cell_y,
          'label', coalesce(
            representative_place,
            'Approximate report concentration'
          ),
          'lat', extensions.st_y(
            extensions.st_transform(centroid_nztm, 4326)
          ),
          'lng', extensions.st_x(
            extensions.st_transform(centroid_nztm, 4326)
          ),
          'extent', extensions.st_asgeojson(
            extensions.st_transform(cell_extent_nztm, 4326)
          )::jsonb,
          'report_count', report_count,
          'serious_count', serious_count,
          'moderate_count', moderate_count,
          'severe_count', severe_count,
          'extreme_count', extreme_count,
          'unverified_serious_count', unverified_serious_count,
          'verified_or_corroborated_serious_count',
            verified_or_corroborated_serious_count,
          'official_serious_count', official_serious_count,
          'reported_origin_count', reported_origin_count,
          'signal_types', signal_types,
          'first_seen_at', first_seen_at,
          'last_seen_at', last_seen_at,
          'precision_status', case
            when unknown_precision_count = report_count then 'undeclared'
            when unknown_precision_count = 0 then 'declared'
            else 'mixed'
          end,
          'coarse_location_count', coarse_location_count,
          'unknown_precision_count', unknown_precision_count,
          'max_accuracy_m', max_accuracy_m,
          'max_severity', case max_severity_rank
            when 4 then 'extreme'
            when 3 then 'severe'
            else 'moderate'
          end
        )
        order by
          max_severity_rank desc,
          serious_count desc,
          reported_origin_count desc,
          last_seen_at desc,
          cell_x,
          cell_y
      ),
      '[]'::jsonb
    ) as rows
    from limited
  )
  select jsonb_build_object(
    'generated_at', now(),
    'since', parameters.since_at,
    'cell_m', parameters.cell_m,
    'min_points', parameters.min_points,
    'candidate_count', candidate_meta.candidate_count,
    'candidate_limit', 5000,
    'candidates_truncated', candidate_meta.candidates_truncated,
    'qualifying_pocket_count', qualifying_meta.qualifying_pocket_count,
    'qualifying_report_count', qualifying_meta.qualifying_report_count,
    'qualifying_serious_count', qualifying_meta.qualifying_serious_count,
    'qualifying_unverified_serious_count',
      qualifying_meta.qualifying_unverified_serious_count,
    'pocket_limit', qualifying_meta.pocket_limit,
    'pockets_truncated',
      qualifying_meta.qualifying_pocket_count > qualifying_meta.pocket_limit,
    'pockets', pockets.rows
  )
  into result
  from parameters
  cross join candidate_meta
  cross join qualifying_meta
  cross join pockets;

  return result;
end;
$function$;

revoke all on function public.signal_serious_pockets(
  timestamptz, integer, integer, integer
) from public, anon, authenticated;
grant execute on function public.signal_serious_pockets(
  timestamptz, integer, integer, integer
) to authenticated, service_role;
