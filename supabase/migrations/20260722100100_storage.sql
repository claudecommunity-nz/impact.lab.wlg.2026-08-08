-- ============================================================================
-- WCC Emergency Hack — shared `media` storage bucket (PLAN §7.2)
-- One public-read bucket; writes are event-token-gated and scoped to a
-- registered, ENABLED module via the key prefix media/<module_id>/...
-- (folders in Supabase Storage are pure key prefixes).
-- NOTE: bucket is public-read → kickoff privacy rule: no real faces, names,
-- or addresses in test submissions.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit)
values ('media', 'media', true, 10485760)  -- 10 MiB per file
on conflict (id) do update
  set public = true, file_size_limit = 10485760;

-- Public read (listing + serving via the API; public URLs work regardless).
create policy "media is publicly readable"
  on storage.objects for select
  using (bucket_id = 'media');

-- INSERT: room-only token AND first path segment must be SOME registered,
-- enabled module_id — so uploads land under a real module prefix and the
-- kill-switch also stops a disabled module's uploads. NOTE: this is NOT
-- per-uploader scoping — the event token is shared room-wide, so any team can
-- upload into another team's media/<module_id>/ prefix. Treat prefixes as a
-- convention, not a security boundary.
create policy "room can upload under an enabled module prefix"
  on storage.objects for insert
  with check (
    bucket_id = 'media'
    and public.event_token_ok()
    and exists (
      select 1 from public.modules m
      where m.id = (storage.foldername(name))[1]
        and m.enabled
    )
  );

-- No UPDATE/DELETE policies: overwriting/removing objects is service-role-only
-- (organiser moderation of the public bucket).
