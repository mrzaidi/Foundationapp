-- ===========================================================================
-- Three kinds of administrator.
--
--   master   — everything, as before
--   reports  — sees every module, changes nothing, can export
--   intake   — budget totals and adding people; no donors, no applications
--
-- Added as a level alongside role rather than as new values on the user_role
-- enum. ALTER TYPE ... ADD VALUE cannot run inside a transaction block, so an
-- enum change is a migration that can half-apply — and every policy, trigger
-- and function already written against role = 'admin' would have to be found
-- and revisited. A nullable column beside it leaves all of that working and
-- makes the new rules additive.
--
-- NULL means master. Every administrator who exists today was created with
-- full access and must keep it; a migration that silently demoted the only
-- account able to approve anything would be worse than no migration.
-- ===========================================================================

alter table public.profiles
  add column if not exists admin_level text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_admin_level_check') then
    alter table public.profiles
      add constraint profiles_admin_level_check
      check (admin_level is null or admin_level in ('master', 'reports', 'intake'));
  end if;
end $$;

comment on column public.profiles.admin_level is
  'Which kind of administrator: master, reports (read plus export) or intake (budget totals and adding people). Null means master, for accounts created before levels existed.';

-- ---------------------------------------------------------------------------
-- Who is what.
--
-- security definer for the same reason is_admin() is: a policy that re-queried
-- profiles to answer this would recurse into the policy being evaluated.
-- ---------------------------------------------------------------------------

create or replace function public.admin_level()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
           when p.role <> 'admin' then null
           else coalesce(p.admin_level, 'master')
         end
    from public.profiles p
   where p.id = auth.uid();
$$;

/** Full access. The only level that may move money or change who is who. */
create or replace function public.is_master()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.admin_level() = 'master';
$$;

/**
 * Named givers and their amounts.
 *
 * Deliberately not the same question as "can see the budget". A month's
 * balance is an operating figure; who paid it and how much each of them gave
 * is personal, and the intake level exists precisely so somebody can be
 * trusted with the first without being handed the second.
 */
create or replace function public.can_see_donors()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.admin_level() in ('master', 'reports');
$$;

-- ---------------------------------------------------------------------------
-- Donor records follow can_see_donors(), not is_admin().
--
-- Hiding the module in the interface is not access control; without this an
-- intake administrator could read every donor straight from the API.
-- ---------------------------------------------------------------------------

drop policy if exists "donors admin"    on public.donors;
drop policy if exists "donations admin" on public.donations;
drop policy if exists "donors read"     on public.donors;
drop policy if exists "donors write"    on public.donors;
drop policy if exists "donations read"  on public.donations;
drop policy if exists "donations write" on public.donations;

create policy "donors read" on public.donors
  for select using (public.can_see_donors());
create policy "donors write" on public.donors
  for all using (public.is_master()) with check (public.is_master());

create policy "donations read" on public.donations
  for select using (public.can_see_donors());
create policy "donations write" on public.donations
  for all using (public.is_master()) with check (public.is_master());

-- The donor list is read through this, so it has to ask the same question.
create or replace function public.donor_month(p_month date default current_date)
returns json
language sql
stable
security definer
set search_path = public
as $$
  select case when public.can_see_donors() then coalesce((
    select json_agg(t order by t.name) from (
      select d.id,
             coalesce(p.full_name, d.name)  as name,
             coalesce(p.mobile, d.contact)  as contact,
             p.id                           as user_id,
             p.email                        as email,
             d.monthly_pledge, d.is_active, d.note,
             dn.id          as donation_id,
             dn.amount      as given,
             dn.received_on as received_on,
             dn.note        as donation_note
      from public.donors d
      left join public.profiles p on p.id = d.user_id
      left join public.donations dn
        on dn.donor_id = d.id
       and dn.month = date_trunc('month', p_month)::date
      where d.is_active or dn.id is not null
    ) t
  ), '[]'::json) else null end;
$$;

-- ---------------------------------------------------------------------------
-- Deciding applications, and moving money, is the master's alone.
--
-- The API refuses it too, but a rule that lives only in the API is a rule that
-- holds until somebody calls PostgREST directly.
-- ---------------------------------------------------------------------------

create or replace function public.guard_request_decisions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- A member editing their own draft is not what this guards; only a change
  -- to where the application has got to, or to the money on it.
  if new.status is distinct from old.status
     or new.amount_approved is distinct from old.amount_approved then
    if public.is_admin() and not public.is_master() then
      raise exception 'Your administrator account cannot decide applications or record transfers.'
        using errcode = 'insufficient_privilege';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists requests_guard_decisions on public.fund_requests;
create trigger requests_guard_decisions
  before update on public.fund_requests
  for each row execute function public.guard_request_decisions();

-- ---------------------------------------------------------------------------
-- Only a master may create or change an administrator.
--
-- Extends the guard from 0001, which stopped members promoting themselves but
-- was written when every administrator was equal. Without this an intake
-- administrator — who may legitimately add people — could add a master one.
-- ---------------------------------------------------------------------------

create or replace function public.guard_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    new.role        := old.role;
    new.admin_level := old.admin_level;
    new.is_blocked  := old.is_blocked;
  elsif not public.is_master() then
    -- An administrator who is not a master may edit details, never standing.
    if new.role is distinct from old.role
       or new.admin_level is distinct from old.admin_level then
      raise exception 'Only a master administrator can change what someone is.'
        using errcode = 'insufficient_privilege';
    end if;
    new.is_blocked := old.is_blocked;
  end if;
  return new;
end $$;

create or replace function public.guard_profile_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Registration inserts a member for itself; that path has no session yet and
  -- is unaffected. This catches an administrator inserting somebody else.
  if new.role = 'admin' and auth.uid() is not null and not public.is_master() then
    raise exception 'Only a master administrator can create an administrator.'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;

drop trigger if exists profiles_guard_insert on public.profiles;
create trigger profiles_guard_insert
  before insert on public.profiles
  for each row execute function public.guard_profile_insert();
