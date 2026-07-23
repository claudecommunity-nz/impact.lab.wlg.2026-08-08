-- Per-module write isolation.
--
-- Loader requests carry one opaque x-module-token. Only its SHA-256 digest is
-- stored, and RLS resolves the owning module before comparing it with the row,
-- storage prefix, or module-table owner being written. Browser writes use a
-- signed-in user's organiser-controlled app_metadata.module_id claim; no
-- module token is ever shipped to JavaScript.
--
-- The previous room token remains available only through an explicit,
-- time-bounded migration window. The window is NULL (off) by default.

create extension if not exists pgcrypto with schema extensions;

alter table private.event_config
  add column if not exists legacy_module_writes_until timestamptz;

create table if not exists private.module_credentials (
  module_id   text primary key
    check (module_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  token_hash  bytea not null unique,
  token_suffix text not null,
  created_at  timestamptz not null default now(),
  rotated_at  timestamptz not null default now(),
  revoked_at  timestamptz
);

comment on table private.module_credentials is
  'Per-module loader credentials. Stores SHA-256 only; plaintext tokens are shown once by organiser tooling.';
comment on column private.module_credentials.revoked_at is
  'Non-null immediately blocks loader tokens and authenticated browser users assigned to this module.';

revoke all on private.module_credentials from public, anon, authenticated;

-- Module-table ownership is recorded when organiser deployment applies each
-- modules/<id>/backend/schema.sql under an explicit process-local context.
create table if not exists private.module_table_owners (
  table_oid     oid primary key,
  physical_name text not null unique,
  module_id     text not null
    check (module_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  configured_at timestamptz not null default now()
);

revoke all on private.module_table_owners from public, anon, authenticated;

create or replace function private.request_header(header_name text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select (
    coalesce(
      nullif(current_setting('request.headers', true), ''),
      '{}'
    )::jsonb ->> lower(header_name)
  )
$$;

revoke all on function private.request_header(text) from public;

-- True for exactly one target module when any supported credential form is
-- valid:
--   1. loader x-module-token resolves to that active module;
--   2. authenticated JWT app_metadata.module_id names that active module; or
--   3. the legacy room-token window is explicitly open and x-module-id matches.
create or replace function public.module_credential_ok(target_module_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    target_module_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    and (
      exists (
        select 1
        from private.module_credentials c
        where c.module_id = target_module_id
          and c.revoked_at is null
          and c.token_hash = extensions.digest(
            coalesce(private.request_header('x-module-token'), ''),
            'sha256'
          )
          and private.request_header('x-module-token') is not null
      )
      or (
        coalesce(auth.jwt() ->> 'role', '') = 'authenticated'
        and auth.jwt() -> 'app_metadata' ->> 'module_id' = target_module_id
        and exists (
          select 1
          from private.module_credentials c
          where c.module_id = target_module_id
            and c.revoked_at is null
        )
      )
      or (
        private.request_header('x-module-id') = target_module_id
        and public.event_token_ok()
        and exists (
          select 1
          from private.event_config c
          where c.legacy_module_writes_until > now()
        )
      )
    )
$$;

comment on function public.module_credential_ok(text) is
  'Ownership check for initial registration: active module token, assigned authenticated user, or explicitly time-bounded legacy migration.';

create or replace function public.module_write_ok(target_module_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.module_credential_ok(target_module_id)
     and exists (
       select 1
       from public.modules m
       where m.id = target_module_id
         and m.enabled
     )
$$;

comment on function public.module_write_ok(text) is
  'Per-module ownership plus the modules.enabled kill-switch. Used by signals, heartbeats, storage, and module tables.';

revoke all on function public.module_credential_ok(text) from public;
revoke all on function public.module_write_ok(text) from public;
grant execute on function public.module_credential_ok(text)
  to anon, authenticated, service_role;
grant execute on function public.module_write_ok(text)
  to anon, authenticated, service_role;

-- Organiser/service-role credential operations. Rotation replaces the hash and
-- clears revocation immediately; it requires no dashboard or database deploy.
create or replace function public.rotate_module_credential(
  target_module_id text,
  plaintext_token text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if target_module_id !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'invalid module id %', target_module_id;
  end if;
  if length(plaintext_token) < 32 then
    raise exception 'module tokens must contain at least 32 characters';
  end if;

  insert into private.module_credentials (
    module_id,
    token_hash,
    token_suffix,
    rotated_at,
    revoked_at
  )
  values (
    target_module_id,
    extensions.digest(plaintext_token, 'sha256'),
    right(plaintext_token, 6),
    now(),
    null
  )
  on conflict (module_id) do update
    set token_hash = excluded.token_hash,
        token_suffix = excluded.token_suffix,
        rotated_at = now(),
        revoked_at = null;
end
$$;

create or replace function public.revoke_module_credential(target_module_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update private.module_credentials
  set revoked_at = now()
  where module_id = target_module_id;
  if not found then
    raise exception 'no credential exists for module %', target_module_id;
  end if;
end
$$;

create or replace function public.set_legacy_module_write_window(window_end timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if window_end is not null and window_end > now() + interval '24 hours' then
    raise exception 'legacy module-write window cannot exceed 24 hours';
  end if;
  update private.event_config
  set legacy_module_writes_until = window_end
  where id;
  if not found then
    raise exception 'private.event_config has no token row; configure the legacy token first';
  end if;
end
$$;

revoke all on function public.rotate_module_credential(text, text) from public;
revoke all on function public.revoke_module_credential(text) from public;
revoke all on function public.set_legacy_module_write_window(timestamptz) from public;
grant execute on function public.rotate_module_credential(text, text) to service_role;
grant execute on function public.revoke_module_credential(text) to service_role;
grant execute on function public.set_legacy_module_write_window(timestamptz) to service_role;

-- Core policies now compare the credential owner with the row being changed.
drop policy if exists "room can insert signals for enabled modules" on public.signals;
drop policy if exists "room can triage signals" on public.signals;
drop policy if exists "room can register modules" on public.modules;
drop policy if exists "room can update modules" on public.modules;

create policy "module can insert its signals"
  on public.signals for insert
  with check (
    public.module_write_ok(module_id)
    and length(title) <= 200
    and (description is null or length(description) <= 2000)
  );

create policy "module can triage its signals"
  on public.signals for update
  to authenticated
  using (public.module_write_ok(module_id))
  with check (public.module_write_ok(module_id));

create policy "module can register itself"
  on public.modules for insert
  with check (public.module_credential_ok(id));

create policy "module can update itself while enabled"
  on public.modules for update
  using (public.module_write_ok(id))
  with check (public.module_write_ok(id));

-- Storage uses the same ownership + kill-switch predicate. This remains a
-- SECURITY DEFINER wrapper because the storage service evaluates policies under
-- a separate role/pool.
create or replace function public.wcc_storage_upload_ok(bucket_id text, object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select bucket_id = 'media'
     and public.module_write_ok((storage.foldername(object_name))[1])
$$;

comment on function public.wcc_storage_upload_ok(text, text) is
  'Storage upload gate: media bucket + credential owner equals first path segment + enabled kill-switch.';

drop policy if exists "room can upload under an enabled module prefix" on storage.objects;
drop policy if exists "module can upload under its enabled prefix" on storage.objects;
create policy "module can upload under its enabled prefix"
  on storage.objects for insert
  with check (public.wcc_storage_upload_ok(bucket_id, name));

-- Secure module-table configurator with an explicit owner. The one-argument
-- wrapper below reads the organiser deployment context set by
-- scripts/apply-module-backends.sh, preserving existing schema.sql source while
-- making ownership enforceable.
create or replace function wcc.enable_module_table(
  tbl regclass,
  owner_module_id text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  fq text := tbl::text;
  nm text := (parse_ident(tbl::text))[array_length(parse_ident(tbl::text), 1)];
  expected_prefix text := wcc.module_prefix(owner_module_id);
  seq regclass;
begin
  if owner_module_id !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'enable_module_table: invalid owner module id %', owner_module_id;
  end if;
  if nm not like (expected_prefix || '%') or length(nm) <= length(expected_prefix) then
    raise exception
      'enable_module_table: % is outside module % namespace (expected public.%<table>)',
      fq, owner_module_id, expected_prefix;
  end if;

  delete from private.module_table_owners
  where physical_name = fq and table_oid <> tbl::oid;
  insert into private.module_table_owners (
    table_oid,
    physical_name,
    module_id,
    configured_at
  )
  values (tbl::oid, fq, owner_module_id, now())
  on conflict (table_oid) do update
    set physical_name = excluded.physical_name,
        module_id = excluded.module_id,
        configured_at = now();

  execute format('alter table %s enable row level security', fq);
  execute format('grant select on %s to anon, authenticated', fq);
  execute format('grant insert, update, delete on %s to anon, authenticated', fq);
  execute format('grant all on %s to service_role', fq);

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

  execute format('drop policy if exists wcc_read on %s', fq);
  execute format('drop policy if exists wcc_write_insert on %s', fq);
  execute format('drop policy if exists wcc_write_update on %s', fq);
  execute format('drop policy if exists wcc_write_delete on %s', fq);
  execute format('create policy wcc_read on %s for select using (true)', fq);
  execute format(
    'create policy wcc_write_insert on %s for insert with check (public.module_write_ok(%L))',
    fq,
    owner_module_id
  );
  execute format(
    'create policy wcc_write_update on %s for update using (public.module_write_ok(%L)) with check (public.module_write_ok(%L))',
    fq,
    owner_module_id,
    owner_module_id
  );
  execute format(
    'create policy wcc_write_delete on %s for delete using (public.module_write_ok(%L))',
    fq,
    owner_module_id
  );

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = (parse_ident(fq))[1]
      and tablename = nm
  ) then
    execute format('alter publication supabase_realtime add table %s', fq);
  end if;
end
$$;

create or replace function wcc.enable_module_table(tbl regclass)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_module_id text := nullif(
    current_setting('wcc.deploying_module_id', true),
    ''
  );
begin
  if owner_module_id is null then
    raise exception
      'enable_module_table: owner context missing; use scripts/apply-module-backends.sh or call enable_module_table(table, module_id)';
  end if;
  perform wcc.enable_module_table(tbl, owner_module_id);
end
$$;

comment on function wcc.enable_module_table(regclass, text) is
  'Apply public read, owner-module-scoped writes, grants, and realtime to a module table.';
comment on function wcc.enable_module_table(regclass) is
  'Deployment-context wrapper for module schema files; scripts/apply-module-backends.sh supplies the owner.';

revoke all on function wcc.enable_module_table(regclass, text) from public;
revoke all on function wcc.enable_module_table(regclass) from public;

-- Close the old room-token policies on every existing module table immediately.
-- The normal deploy step re-applies each schema seconds later with its owner
-- context; until then, RLS has no write policy and therefore fails closed.
do $$
declare
  table_row record;
begin
  for table_row in
    select format('%I.%I', n.nspname, c.relname) as fq
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and c.relname like 'm\_%' escape '\'
  loop
    execute format('drop policy if exists wcc_write_insert on %s', table_row.fq);
    execute format('drop policy if exists wcc_write_update on %s', table_row.fq);
    execute format('drop policy if exists wcc_write_delete on %s', table_row.fq);
  end loop;
end
$$;
