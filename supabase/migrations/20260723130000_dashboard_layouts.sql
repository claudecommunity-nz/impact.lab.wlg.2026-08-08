-- Personal widget-dashboard layouts. This is core user-preference data, never
-- module-owned data: module credentials and app_metadata.module_id do not grant
-- access. Signed-out users keep the same document in localStorage.

create table public.dashboard_layouts (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid references auth.users(id) on delete cascade,
  scope           text not null default 'personal'
                  check (scope in ('personal', 'shared')),
  slug            text unique,
  name            text not null check (length(name) between 1 and 80),
  schema_version  smallint not null default 1 check (schema_version > 0),
  revision        bigint not null default 1 check (revision > 0),
  document        jsonb not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint dashboard_layout_scope_owner check (
    (scope = 'personal' and owner_id is not null and slug is null)
    or
    (scope = 'shared' and owner_id is null and slug is not null)
  ),
  constraint dashboard_layout_document_object check (
    jsonb_typeof(document) = 'object'
    and coalesce(jsonb_typeof(document -> 'widgets'), '') = 'array'
  ),
  constraint dashboard_layout_widget_cap check (
    jsonb_array_length(document -> 'widgets') <= 100
  ),
  constraint dashboard_layout_size_cap check (
    pg_column_size(document) <= 65536
  ),
  constraint dashboard_layout_one_personal_per_user unique (owner_id)
);

comment on table public.dashboard_layouts is
  'Versioned personal and organiser-published widget layouts. Documents contain ids, JSON settings, and grid positions only; never executable component paths.';

create or replace function public.touch_dashboard_layout()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  if new.document is distinct from old.document
     or new.name is distinct from old.name
     or new.schema_version is distinct from old.schema_version then
    new.revision = old.revision + 1;
  end if;
  return new;
end
$$;

create trigger dashboard_layouts_touch
  before update on public.dashboard_layouts
  for each row execute function public.touch_dashboard_layout();

grant all on public.dashboard_layouts to service_role;
grant select on public.dashboard_layouts to anon;
grant select, insert, update, delete on public.dashboard_layouts to authenticated;

alter table public.dashboard_layouts enable row level security;

create policy "shared dashboard layouts are publicly readable"
  on public.dashboard_layouts for select
  using (scope = 'shared' or owner_id = auth.uid());

create policy "users create their personal dashboard layout"
  on public.dashboard_layouts for insert
  to authenticated
  with check (
    scope = 'personal'
    and owner_id = auth.uid()
    and slug is null
  );

create policy "users update their personal dashboard layout"
  on public.dashboard_layouts for update
  to authenticated
  using (scope = 'personal' and owner_id = auth.uid())
  with check (
    scope = 'personal'
    and owner_id = auth.uid()
    and slug is null
  );

create policy "users delete their personal dashboard layout"
  on public.dashboard_layouts for delete
  to authenticated
  using (scope = 'personal' and owner_id = auth.uid());

-- Layout synchronization is ordinary request/response. Deliberately do not add
-- this table to supabase_realtime: SignalProvider remains the single channel.
