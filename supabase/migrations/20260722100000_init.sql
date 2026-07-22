-- ============================================================================
-- WCC Emergency Hack — core schema: modules registry + signals + RLS gating
-- (PLAN §7.1). Source of truth for all DDL; applied to live AND standby via
-- `supabase db push`. schema/schema.sql is a generated read-only snapshot.
-- ============================================================================

-- ─── Event-token gate ────────────────────────────────────────────────────────
-- Every write policy requires the shared room-only event token, sent by clients
-- as the `x-event-token` request header (PostgREST exposes headers to RLS via
-- current_setting('request.headers')). The expected value lives in
-- private.event_config — a schema PostgREST never exposes, readable only through
-- the SECURITY DEFINER check below. (A database GUC was rejected: ALTER DATABASE
-- needs owner rights the migration/organiser roles don't reliably have, and GUC
-- changes need a PostgREST config reload; a table takes effect immediately.)
--
-- The token VALUE is set OUT OF BAND — never in a migration (public repo):
--
--   psql "$SUPABASE_DB_URL" -c \
--     "insert into private.event_config (id, token) values (true, '<TOKEN-FROM-CHECK-IN-CARD>')
--      on conflict (id) do update set token = excluded.token;"
--
-- Takes effect immediately. To rotate mid-event: same command, new value,
-- announce it in the room. Until a token is set, ALL writes are blocked.
create schema if not exists private;
revoke all on schema private from public;

create table private.event_config (
  id    boolean primary key default true check (id),  -- single-row table
  token text not null
);

create or replace function public.event_token_ok()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from private.event_config c
    where c.token = (current_setting('request.headers', true)::json ->> 'x-event-token')
  )
$$;

comment on function public.event_token_ok() is
  'True when the request''s x-event-token header matches private.event_config.token (set out of band, never committed).';

-- ─── modules: the runtime registry ──────────────────────────────────────────
create table public.modules (
  id          text primary key,                    -- folder name / module_id
  name        text not null,
  icon        text,
  description text,
  enabled     boolean not null default true,       -- ORGANISER KILL-SWITCH
  last_seen   timestamptz,                         -- loader heartbeat
  updated_at  timestamptz not null default now()
);

comment on column public.modules.enabled is
  'Kill-switch: only the service role may change this (column grants exclude it for anon/authenticated). Flip it in Supabase Studio.';

-- keep updated_at honest on any update (registration refresh, heartbeat, ...)
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end
$$;

create trigger modules_touch_updated_at
  before update on public.modules
  for each row execute function public.touch_updated_at();

-- ─── signals: the shared feed ────────────────────────────────────────────────
-- Contract mirror of /schema/signal.schema.json — that file is the source of truth.
create table public.signals (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  observed_at  timestamptz,
  reported_at  timestamptz,
  source       text,
  source_type  text not null check (source_type in ('official','community','media','sensor')),
  signal_type  text not null,
  title        text not null,
  description  text,
  lat          double precision check (lat between -90 and 90),
  lng          double precision check (lng between -180 and 180),
  place_name   text,
  severity     text not null default 'unknown'
               check (severity in ('minor','moderate','severe','extreme','unknown')),
  verification text not null default 'unverified'
               check (verification in ('unverified','corroborated','verified','false_report')),
  confidence   double precision check (confidence between 0 and 1),
  link         text,
  media_urls   text[] not null default '{}',
  module_id    text not null references public.modules (id),
  raw          jsonb
);

create index signals_created_at_idx on public.signals (created_at desc);
create index signals_module_id_idx  on public.signals (module_id);
create index signals_signal_type_idx on public.signals (signal_type);

-- ─── Base table privileges ───────────────────────────────────────────────────
-- RLS gates rows; these grants gate table access itself. Migrations run as the
-- CLI's admin role, so Supabase's default privileges do NOT apply to these
-- tables — every grant must be explicit or PostgREST returns 42501 for anon.
grant usage on schema public to anon, authenticated, service_role;
grant all    on public.modules, public.signals to service_role;
grant select on public.modules, public.signals to anon, authenticated;
grant insert on public.signals to anon, authenticated;  -- rows still gated by the token policy below

-- ─── Row Level Security ──────────────────────────────────────────────────────
alter table public.modules enable row level security;
alter table public.signals enable row level security;

-- Anyone (anon) may READ everything — the feed is public by design.
create policy "modules are publicly readable"
  on public.modules for select
  using (true);

create policy "signals are publicly readable"
  on public.signals for select
  using (true);

-- signals INSERT: room-only token + module must exist AND be enabled (the
-- kill-switch silences a disabled module's inserts, not just its tile) +
-- length guardrails.
create policy "room can insert signals for enabled modules"
  on public.signals for insert
  with check (
    public.event_token_ok()
    and exists (
      select 1 from public.modules m
      where m.id = module_id and m.enabled
    )
    and length(title) <= 200
    and (description is null or length(description) <= 2000)
  );

-- signals UPDATE (triage): room-gated via the token, like every other write,
-- AND authenticated users only, AND ONLY the triage columns. RLS can't restrict
-- columns, so the column-level grants below do that part.
create policy "room can triage signals"
  on public.signals for update
  to authenticated
  using (public.event_token_ok())
  with check (public.event_token_ok());

revoke update on public.signals from anon, authenticated;
grant  update (verification, confidence) on public.signals to authenticated;
-- No DELETE policies: deletes are service-role-only (organiser cleanup).

-- modules INSERT/UPDATE: room-only token. The `enabled` column is excluded
-- from the grants so only the service role (organisers, via Studio) can flip
-- it. `id` stays in the UPDATE grant because PostgREST upserts include every
-- payload column in the ON CONFLICT DO UPDATE SET list — client payloads must
-- simply never include `enabled` (see docs/CONTRACTS.md).
create policy "room can register modules"
  on public.modules for insert
  with check (public.event_token_ok());

create policy "room can update modules"
  on public.modules for update
  using (public.event_token_ok())
  with check (public.event_token_ok());

revoke insert, update on public.modules from anon, authenticated;
grant  insert (id, name, icon, description, last_seen)
  on public.modules to anon, authenticated;
grant  update (id, name, icon, description, last_seen)
  on public.modules to anon, authenticated;

-- ─── Realtime ────────────────────────────────────────────────────────────────
-- One core-provider subscription fans changes out via React context (PLAN §7.3).
alter publication supabase_realtime add table public.signals;
alter publication supabase_realtime add table public.modules;
