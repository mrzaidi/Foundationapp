-- ===========================================================================
-- An administrator files an application on a member's behalf.
--
-- Not everyone who needs help can fill in a form. Someone comes to the office
-- with a hospital bill and no smartphone; a widow registers on a relative's
-- phone she does not keep. Until now the only way an application could exist
-- was for the member to create it themselves — the insert policy said
-- `user_id = auth.uid()` and nothing else, so even a master administrator was
-- refused by the database.
--
-- So a master may now file for anyone, and the row remembers that they did.
-- Everything else about the application stays exactly as if the member had
-- filed it: it starts at `requested`, it still needs somewhere for the money
-- to land, and it still has to be approved and transferred by the same hands
-- under the same rules. Filing is not deciding.
-- ===========================================================================

-- Who filed it, when it was not the member themselves.
alter table public.fund_requests
  add column if not exists filed_by uuid references public.profiles (id);

comment on column public.fund_requests.filed_by is
  'The administrator who filed this on the member''s behalf. Null when the member applied themselves.';

create index if not exists fund_requests_filed_by_idx
  on public.fund_requests (filed_by) where filed_by is not null;

-- ---------------------------------------------------------------------------
-- Who may create an application
--
-- Two policies, because they are two different acts. A member files their own
-- and may not claim somebody filed it for them; a master files anyone's and is
-- named in the row for doing so. Neither can create an application that starts
-- anywhere other than `requested` — filing has never been a way to skip the
-- queue, and it is not becoming one.
-- ---------------------------------------------------------------------------
drop policy if exists "requests insert own" on public.fund_requests;
create policy "requests insert own" on public.fund_requests
  for insert with check (
    user_id = auth.uid()
    and status = 'requested'
    and filed_by is null
  );

drop policy if exists "requests insert master" on public.fund_requests;
create policy "requests insert master" on public.fund_requests
  for insert with check (
    public.is_master()
    and status = 'requested'
    and filed_by = auth.uid()
  );

-- ---------------------------------------------------------------------------
-- The timeline should name who actually filed it.
--
-- The first event on every application says who started it. That was always
-- the member, because the member was the only one who could. Now that an
-- administrator can, the event should say so, or the history would quietly
-- credit an application to somebody who never made it.
-- ---------------------------------------------------------------------------
create or replace function public.log_request_created()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- note stays null so the app can render it in the member's language
  insert into public.request_events (request_id, status, note, actor_id)
  values (new.id, new.status, null, coalesce(new.filed_by, new.user_id));
  return new;
end $$;
