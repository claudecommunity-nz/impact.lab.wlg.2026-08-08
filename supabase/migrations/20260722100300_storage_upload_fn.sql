-- ============================================================================
-- Fix: token-gated storage uploads were rejected by RLS even with a valid
-- x-event-token and a registered, enabled module.
--
-- The storage service evaluates INSERT policies inside a rolled-back
-- permission-check transaction under its own evaluation role — NOT the same
-- context PostgREST gives policies. Empirically (CI probe on storage-api
-- v1.62.5): the identical conjuncts return TRUE when evaluated inside a
-- SECURITY DEFINER function and FALSE when written inline in the policy,
-- because the inline subquery on public.modules runs as the storage
-- evaluation role while the definer function evaluates as its owner.
--
-- So the upload gate moves into one SECURITY DEFINER predicate — same checks,
-- role-independent evaluation, and one place to read the whole rule:
-- bucket must be `media`, the room event token must be present, and the first
-- path segment must be a registered AND enabled module id (kill-switch).
-- ============================================================================

create or replace function public.wcc_storage_upload_ok(bucket_id text, object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select bucket_id = 'media'
     and public.event_token_ok()
     and exists (
       select 1 from public.modules m
       where m.id = (storage.foldername(object_name))[1]
         and m.enabled
     )
$$;

comment on function public.wcc_storage_upload_ok(text, text) is
  'Storage upload gate: media bucket + room event token + enabled module prefix. SECURITY DEFINER so it evaluates identically under the storage service''s policy-check role and PostgREST.';

-- The storage service's evaluation role is version-dependent — keep the
-- default PUBLIC execute so the policy can always call it (it only reads
-- public data and returns a boolean).

drop policy if exists "room can upload under an enabled module prefix" on storage.objects;
create policy "room can upload under an enabled module prefix"
  on storage.objects for insert
  with check (public.wcc_storage_upload_ok(bucket_id, name));
