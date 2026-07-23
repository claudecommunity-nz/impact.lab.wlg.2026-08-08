-- ============================================================================
-- demo-seed backend schema — this module's OWN Postgres table, beyond the
-- shared `signals` table. A green merge to main applies it automatically;
-- organiser manual retry: `bash scripts/apply-module-backends.sh`.
--
-- Convention: every module-owned table is public.m_<module_id>_<name>. For
-- demo-seed (id "demo-seed") the prefix is m_demo_seed_ (wcc.module_prefix).
-- Declare the same name in module.config.ts `tables` so the dashboard subscribes
-- to it on the shared realtime channel (useModuleTable("demo-seed", "pins")).
--
-- Idempotent: safe to re-run to add columns / re-apply policies.
-- ============================================================================

create table if not exists public.m_demo_seed_pins (
  id         uuid primary key default gen_random_uuid(),   -- required: realtime matches on id
  created_at timestamptz not null default now(),
  kind       text not null default 'note',                 -- cordon | staging | hazard | note
  label      text not null,
  note       text,
  lat        double precision,
  lng        double precision
);

-- One line applies the platform contract: public read, event-token-gated writes
-- (same gate as signals), and realtime publication membership. Idempotent.
select wcc.enable_module_table('public.m_demo_seed_pins');
