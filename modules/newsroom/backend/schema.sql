-- ============================================================================
-- newsroom backend — this module's OWN Postgres tables (public.m_newsroom_*).
-- Applied automatically after a green merge to main.
-- Organiser manual retry: bash scripts/apply-module-backends.sh
--
-- The module ingests NZ news RSS/Atom every 5 minutes. Articles are stored here
-- in full AND referenced from the shared `signals` table (articles.signal_id).
-- Four tables: managed feeds, ingested articles, refresh log, public comments.
-- All get public read + newsroom-credential-only writes + realtime via
-- wcc.enable_module_table(). Idempotent — safe to re-apply.
-- ============================================================================

-- ─── Feeds we manage (health + last-refresh status per source) ───────────────
create table if not exists public.m_newsroom_sources (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  source_id        text not null unique,          -- e.g. 'rnz', 'stuff'
  name             text not null,
  url              text not null,
  format           text not null default 'rss',   -- 'rss' | 'atom'
  category         text,                           -- e.g. 'politics' (null = primary)
  enabled          boolean not null default true,
  last_fetched_at  timestamptz,
  last_status      text,                           -- 'ok' | 'error'
  last_error       text,
  last_item_count  integer,
  last_duration_ms integer
);
select wcc.enable_module_table('public.m_newsroom_sources', 'newsroom');

-- ─── Ingested articles (deduped by url) ──────────────────────────────────────
create table if not exists public.m_newsroom_articles (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),  -- when WE ingested it
  url          text not null unique,                -- DB-level dedup key
  title        text not null,
  summary      text,
  source_id    text not null,
  source_name  text not null,
  published_at timestamptz,
  image_url    text,
  place_name   text,
  lat          double precision,
  lng          double precision,
  signal_id    uuid references public.signals (id) on delete set null  -- reference into the shared feed
);
create index if not exists m_newsroom_articles_created_idx on public.m_newsroom_articles (created_at desc);
select wcc.enable_module_table('public.m_newsroom_articles', 'newsroom');

-- ─── Refresh log (one row per 5-minute cycle) ────────────────────────────────
create table if not exists public.m_newsroom_refreshes (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  started_at     timestamptz,
  finished_at    timestamptz,
  duration_ms    integer,
  sources_ok     integer not null default 0,
  sources_failed integer not null default 0,
  new_articles   integer not null default 0,
  new_signals    integer not null default 0
);
select wcc.enable_module_table('public.m_newsroom_refreshes', 'newsroom');

-- ─── Public comments (name + location + body + optional image) ───────────────
-- Written ONLY by the newsroom-comment edge function (service role), which owns
-- validation; public read + realtime here so comments appear live.
create table if not exists public.m_newsroom_comments (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  article_id      uuid not null references public.m_newsroom_articles (id) on delete cascade,
  author_name     text not null,
  author_location text,
  body            text not null,
  image_url       text
);
create index if not exists m_newsroom_comments_article_idx on public.m_newsroom_comments (article_id, created_at desc);
select wcc.enable_module_table('public.m_newsroom_comments', 'newsroom');
