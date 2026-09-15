-- ===========================================================================
-- Transfer receipts.
--
-- When an admin marks an application transferred they can attach the bank or
-- wallet receipt. The receipt is filed into the *member's* case file — stored
-- under their folder, recorded against their user_id — because it is evidence
-- for them, not for us: proof the money was sent, visible on their own
-- application screen without any new read policy.
--
-- That leaves only the write side to open up.
-- ===========================================================================

-- Storage: an admin may write into any member's folder. They can already read
-- and delete every object in the bucket, so this closes the last gap rather
-- than opening a new kind of access.
drop policy if exists "documents insert admin" on storage.objects;
create policy "documents insert admin" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'documents' and public.is_admin());

-- Attachments: an admin may record a file against any request. The row still
-- carries the member's user_id, which is what makes "attachments read own"
-- show it to them.
drop policy if exists "attachments insert admin" on public.request_attachments;
create policy "attachments insert admin" on public.request_attachments
  for insert with check (public.is_admin());

-- Filing the wrong receipt against a case should be fixable.
drop policy if exists "attachments delete admin" on public.request_attachments;
create policy "attachments delete admin" on public.request_attachments
  for delete using (public.is_admin());

-- The kind column has always been free text with 'report' as the default.
-- Name the values now that a second writer is using it.
comment on column public.request_attachments.kind is
  'report | bill | cnic | receipt | other — receipt is written by an admin on transfer.';

create index if not exists attachments_kind_idx
  on public.request_attachments (request_id, kind);
