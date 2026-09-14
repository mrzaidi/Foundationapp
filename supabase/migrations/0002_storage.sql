-- ===========================================================================
-- Storage: one private bucket for every member document
-- (NIC images, medical reports, utility bills, receipts)
--
-- Object paths are always  <user-uuid>/<folder>/<filename>
-- so the first path segment is the owner and policies can key off it.
-- ===========================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documents',
  'documents',
  false,                                  -- private: served only via signed URLs
  10485760,                               -- 10 MB per file
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']
)
on conflict (id) do update
  set file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types,
      public             = excluded.public;

drop policy if exists "documents insert own"  on storage.objects;
drop policy if exists "documents read own"    on storage.objects;
drop policy if exists "documents read admin"  on storage.objects;
drop policy if exists "documents update own"  on storage.objects;
drop policy if exists "documents delete own"  on storage.objects;
drop policy if exists "documents delete admin" on storage.objects;

-- A member can only write into their own folder.
create policy "documents insert own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "documents read own" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Admins can read every document — this is what lets them open the medical
-- report or electricity bill attached to a request.
create policy "documents read admin" on storage.objects
  for select to authenticated
  using (bucket_id = 'documents' and public.is_admin());

create policy "documents update own" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "documents delete own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "documents delete admin" on storage.objects
  for delete to authenticated
  using (bucket_id = 'documents' and public.is_admin());
