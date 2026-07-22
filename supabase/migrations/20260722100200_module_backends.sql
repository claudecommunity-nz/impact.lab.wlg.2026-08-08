-- ============================================================================
-- Per-module backends — let a module own Postgres tables (beyond the shared
-- `signals` table) without every module reinventing grants + RLS + realtime.
--
-- A module's tables live in `public` under a per-module prefix:  m_<id>_<name>
-- (the id lower-cased with non-alphanumerics -> "_"), so demo-seed's "pins"
-- table is  public.m_demo_seed_pins.  Prefix = namespace + a natural "drop all
-- of this module's tables" boundary; it is a CONVENTION, not a security wall
-- (the event token is room-wide — any team could write another's table).
--
-- Author flow (modules/<team>/backend/schema.sql, applied by an organiser — DDL
-- is NOT self-serve from a loader's anon key):
--
--   create table if not exists public.m_team_x_cases (
--     id uuid primary key default gen_random_uuid(),
--     created_at timestamptz not null default now(),
--     ...
--   );
--   select wcc.enable_module_table('public.m_team_x_cases');   -- one line does the rest
--
-- enable_module_table() applies: public read, event-token-gated write (via the
-- existing public.event_token_ok()), and realtime publication membership — the
-- same security model as `signals`. Re-running it is safe (idempotent).
-- ============================================================================

create schema if not exists wcc;
grant usage on schema wcc to anon, authenticated, service_role;

-- ─── Prefix helper ───────────────────────────────────────────────────────────
-- The canonical mapping module_id -> table prefix. Mirrored in TS
-- (@wcc-impact/shared moduleTableName) and Python (wcc_impact.module_table) so
-- all three agree on the name.
create or replace function wcc.module_prefix(module_id text)
returns text
language sql
immutable
set search_path = ''
as $$
  select 'm_' || regexp_replace(lower(module_id), '[^a-z0-9]+', '_', 'g') || '_'
$$;

comment on function wcc.module_prefix(text) is
  'module_id -> owned-table prefix, e.g. ''team-x'' -> ''m_team_x_''. Same rule in TS/Python SDKs.';

-- ─── The one-liner every module table opts into ──────────────────────────────
-- Grants + RLS (public read, token-gated write) + realtime, in one idempotent
-- call. SECURITY DEFINER so a module author's schema.sql (run by the organiser
-- as the migration role) can set policies without owning pg_publication.
create or replace function wcc.enable_module_table(tbl regclass)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  fq   text := tbl::text;                       -- schema-qualified, e.g. public.m_demo_seed_pins
  nm   text := (parse_ident(tbl::text))[array_length(parse_ident(tbl::text), 1)];
  seq  regclass;                                -- owned-sequence loop variable
begin
  -- Guard the convention: module tables must be public.m_*  (keeps the prefix
  -- namespace meaningful and stops enable_module_table being pointed at core
  -- tables like public.signals).
  if nm !~ '^m_[a-z0-9_]+$' then
    raise exception 'enable_module_table: % is not a module table (name must match m_<id>_<table>)', fq;
  end if;

  execute format('alter table %s enable row level security', fq);

  -- Table privileges (RLS still gates the rows; these gate table access itself).
  execute format('grant select on %s to anon, authenticated', fq);
  execute format('grant insert, update, delete on %s to anon, authenticated', fq);
  execute format('grant all on %s to service_role', fq);

  -- Sequences owned by the table (identity / serial columns): inserts through
  -- PostgREST fail with "permission denied for sequence" without this. uuid
  -- default tables have none — the loop is simply empty.
  for seq in
    select d.objid::regclass
    from pg_depend d
    where d.refobjid = tbl
      and d.classid = 'pg_class'::regclass
      and d.deptype in ('a', 'i')
      and (select relkind from pg_class where oid = d.objid) = 'S'
  loop
    execute format('grant usage, select on sequence %s to anon, authenticated', seq);
    execute format('grant all on sequence %s to service_role', seq);
  end loop;

  -- Policies — fixed names (policy names are per-table), dropped first so a
  -- re-run just refreshes them.
  execute format('drop policy if exists wcc_read on %s', fq);
  execute format('drop policy if exists wcc_write_insert on %s', fq);
  execute format('drop policy if exists wcc_write_update on %s', fq);
  execute format('drop policy if exists wcc_write_delete on %s', fq);

  -- Reads are public (the dashboard is a public picture).
  execute format('create policy wcc_read on %s for select using (true)', fq);
  -- Writes require the room event token — same gate as signals.
  execute format(
    'create policy wcc_write_insert on %s for insert with check (public.event_token_ok())', fq);
  execute format(
    'create policy wcc_write_update on %s for update using (public.event_token_ok()) with check (public.event_token_ok())', fq);
  execute format(
    'create policy wcc_write_delete on %s for delete using (public.event_token_ok())', fq);

  -- Realtime: add to the publication once (adding twice errors).
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = (parse_ident(fq))[1]
      and tablename  = nm
  ) then
    execute format('alter publication supabase_realtime add table %s', fq);
  end if;
end
$$;

comment on function wcc.enable_module_table(regclass) is
  'Apply the platform contract to a module-owned table: public read, event-token-gated writes, realtime. Idempotent. Call once per table in modules/<team>/backend/schema.sql.';

-- enable_module_table is organiser tooling (runs inside migration/apply as a
-- privileged role); do not expose it to anon/authenticated clients.
revoke all on function wcc.enable_module_table(regclass) from public;
revoke all on function wcc.module_prefix(text) from public;
grant execute on function wcc.module_prefix(text) to anon, authenticated, service_role;
