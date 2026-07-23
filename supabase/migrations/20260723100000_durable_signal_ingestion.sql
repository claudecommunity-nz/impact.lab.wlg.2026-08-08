-- Durable/idempotent signal delivery and public loader queue health.
--
-- A participant loader writes each validated signal to a local SQLite outbox,
-- then retries with this stable key. The database constraint closes the
-- ambiguous-commit gap: if the insert committed but its HTTP response was lost,
-- replaying the key cannot create a second shared signal.

alter table public.signals
  add column idempotency_key text,
  add constraint signals_idempotency_key_length
    check (idempotency_key is null or length(idempotency_key) between 1 and 200),
  add constraint signals_module_id_idempotency_key_key
    unique (module_id, idempotency_key);

comment on column public.signals.idempotency_key is
  'Stable per-module key for deduplicating loader transport retries and repeated upstream items.';

-- Queue state is public operational metadata, not queue contents. It lets the
-- event-day activity hub flag a team whose laptop is accumulating unsent work.
alter table public.modules
  add column queue_depth integer not null default 0
    check (queue_depth >= 0),
  add column queue_oldest_at timestamptz,
  add column queue_last_success_at timestamptz,
  add column queue_last_error text,
  add column queue_dead_letters integer not null default 0
    check (queue_dead_letters >= 0),
  add column queue_updated_at timestamptz;

comment on column public.modules.queue_last_error is
  'Public bounded diagnostic from the loader outbox; never contains queued payloads.';

-- Registration payloads remain unchanged. A loader may update only its
-- operational queue fields through the existing event-token RLS policy.
grant update (
  queue_depth,
  queue_oldest_at,
  queue_last_success_at,
  queue_last_error,
  queue_dead_letters,
  queue_updated_at
) on public.modules to anon, authenticated;
