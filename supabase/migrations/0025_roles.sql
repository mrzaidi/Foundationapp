-- ===========================================================================
-- Roles the foundation can change without a deploy.
--
-- 0015 gave administrators three fixed levels, written into the code. That was
-- right while there were three jobs; it stops being right the moment somebody
-- needs a fourth — a treasurer who sees the money and nothing else, a clerk
-- who only takes applications. Every such person meant an engineer.
--
-- So a role is a row now, and what it may do is a set of rows beside it. The
-- master administrator makes them up, ticks the modules each one opens, and
-- assigns people to them. The three existing levels are seeded as roles with
-- exactly the capabilities they had, and every current administrator is moved
-- onto the matching one, so nobody's access changes on the day this runs.
--
-- The master role is special and stays special: it always holds everything, it
-- cannot be edited into uselessness, and it cannot be deleted or left empty.
-- Everything else about it is ordinary. A system that can lock its own
-- administrator out is not a permission system, it is a trap.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- The tables
-- ---------------------------------------------------------------------------
create table if not exists public.roles (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique check (char_length(btrim(name)) >= 2),
  description text,

  -- Exactly one role carries this. It is the role that administers roles.
  is_master   boolean not null default false,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.roles is
  'A job in the foundation. What it may do lives in role_capabilities.';

-- One master, no more: a second would make "who may administer" ambiguous.
create unique index if not exists roles_single_master
  on public.roles (is_master) where is_master;

create table if not exists public.role_capabilities (
  role_id    uuid not null references public.roles (id) on delete cascade,
  capability text not null,
  primary key (role_id, capability)
);

comment on table public.role_capabilities is
  'One row per thing a role may do. The app''s capability names, verbatim.';

alter table public.profiles
  add column if not exists role_id uuid references public.roles (id);

comment on column public.profiles.role_id is
  'Which role this administrator holds. Null falls back to admin_level.';

create index if not exists profiles_role_idx on public.profiles (role_id);

drop trigger if exists roles_touch on public.roles;
create trigger roles_touch before update on public.roles
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- The seed: the three levels, as rows, with what they already had
-- ---------------------------------------------------------------------------
insert into public.roles (name, description, is_master)
values
  ('Master Admin', 'Every module, and the only role that can manage users and roles.', true),
  ('Admin 1', 'Member records and report exports. No budget, no donors, no applications.', false),
  ('Admin 2', 'Member records and the month''s balance. No donor details, no applications.', false)
on conflict (name) do nothing;

-- Master holds everything there is, now and after any later migration adds to
-- this list; see the trigger below that keeps it that way.
insert into public.role_capabilities (role_id, capability)
select r.id, c.capability
  from public.roles r
  cross join (values
    ('view_dashboard'), ('view_members'), ('edit_members'), ('create_members'),
    ('create_admins'), ('view_requests'), ('file_requests'), ('decide_requests'),
    ('view_budget'), ('view_accounts'), ('view_donors'), ('edit_donors'),
    ('view_funds'), ('edit_funds'), ('export_reports'), ('use_assistant_writes'),
    ('manage_roles')
  ) as c(capability)
 where r.is_master
on conflict do nothing;

insert into public.role_capabilities (role_id, capability)
select r.id, c.capability
  from public.roles r
  cross join (values
    ('view_dashboard'), ('view_members'), ('edit_members'), ('create_members'),
    ('export_reports')
  ) as c(capability)
 where r.name = 'Admin 1'
on conflict do nothing;

insert into public.role_capabilities (role_id, capability)
select r.id, c.capability
  from public.roles r
  cross join (values
    ('view_dashboard'), ('view_members'), ('edit_members'), ('create_members'),
    ('view_budget'), ('view_accounts')
  ) as c(capability)
 where r.name = 'Admin 2'
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Move everybody across, keeping exactly the access they have today
-- ---------------------------------------------------------------------------
update public.profiles p
   set role_id = r.id
  from public.roles r
 where p.role = 'admin'
   and p.role_id is null
   and (
     (coalesce(p.admin_level, 'master') = 'master'  and r.is_master)
     or (p.admin_level = 'reports' and r.name = 'Admin 1')
     or (p.admin_level = 'intake'  and r.name = 'Admin 2')
   );

-- The named master administrator, pinned. If this account is ever left without
-- the master role there is nobody to hand it back.
update public.profiles p
   set role_id = r.id, role = 'admin'
  from public.roles r
 where r.is_master
   and lower(p.email) = 'immohsinraza110@gmail.com';

-- ---------------------------------------------------------------------------
-- Master keeps everything, whatever anybody ticks
--
-- The roles screen renders the master role read-only, but the screen is not
-- the rule. Removing a capability from master would quietly strip the only
-- account that can put it back.
-- ---------------------------------------------------------------------------
create or replace function public.guard_master_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid;
begin
  target := case when tg_op = 'DELETE' then old.role_id else new.role_id end;
  if exists (select 1 from public.roles where id = target and is_master) then
    if tg_op = 'DELETE' then
      raise exception 'The master role keeps every capability.'
        using errcode = 'insufficient_privilege';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

drop trigger if exists role_caps_guard_master on public.role_capabilities;
create trigger role_caps_guard_master
  before delete on public.role_capabilities
  for each row execute function public.guard_master_role();

-- The master role itself cannot be removed or demoted.
create or replace function public.guard_master_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' and old.is_master then
    raise exception 'The master role cannot be deleted.'
      using errcode = 'insufficient_privilege';
  end if;
  if tg_op = 'UPDATE' and old.is_master and not new.is_master then
    raise exception 'The master role cannot be turned into an ordinary one.'
      using errcode = 'insufficient_privilege';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

drop trigger if exists roles_guard_master on public.roles;
create trigger roles_guard_master
  before update or delete on public.roles
  for each row execute function public.guard_master_row();

-- ---------------------------------------------------------------------------
-- There is always at least one master administrator
-- ---------------------------------------------------------------------------
create or replace function public.guard_last_master()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  master_role uuid;
  remaining   int;
begin
  select id into master_role from public.roles where is_master;
  if master_role is null then return case when tg_op = 'DELETE' then old else new end; end if;

  -- Only worth counting when this change takes somebody off the master role.
  if tg_op = 'DELETE' and old.role_id is distinct from master_role then return old; end if;
  if tg_op = 'UPDATE'
     and old.role_id is not distinct from new.role_id
     and old.role is not distinct from new.role then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.role_id is not distinct from master_role and new.role = 'admin' then
    return new;
  end if;

  select count(*) into remaining
    from public.profiles
   where role_id = master_role
     and role = 'admin'
     and id <> (case when tg_op = 'DELETE' then old.id else new.id end);

  if remaining = 0 then
    raise exception 'That would leave the foundation with no master administrator.'
      using errcode = 'insufficient_privilege';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end $$;

drop trigger if exists profiles_guard_last_master on public.profiles;
create trigger profiles_guard_last_master
  before update or delete on public.profiles
  for each row execute function public.guard_last_master();

-- ---------------------------------------------------------------------------
-- The questions the rest of the database asks, answered from roles
--
-- These three names are used by policies and triggers written in 0015 and
-- 0017. They keep their names and their meaning; only where they look changes.
-- An administrator with no role yet falls back to the old level, so this is
-- safe to run before anything else is updated.
-- ---------------------------------------------------------------------------
create or replace function public.has_capability(p_capability text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.profiles p
      join public.role_capabilities rc on rc.role_id = p.role_id
     where p.id = auth.uid()
       and p.role = 'admin'
       and rc.capability = p_capability
  )
  or exists (
    -- Not yet moved onto a role: the levels from 0015, as they were.
    select 1 from public.profiles p
     where p.id = auth.uid()
       and p.role = 'admin'
       and p.role_id is null
       and (
         coalesce(p.admin_level, 'master') = 'master'
         or (p.admin_level = 'reports' and p_capability in
             ('view_dashboard','view_members','edit_members','create_members','export_reports'))
         or (p.admin_level = 'intake' and p_capability in
             ('view_dashboard','view_members','edit_members','create_members','view_budget','view_accounts'))
       )
  );
$$;

create or replace function public.is_master()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.profiles p
      join public.roles r on r.id = p.role_id
     where p.id = auth.uid() and p.role = 'admin' and r.is_master
  )
  or exists (
    select 1 from public.profiles p
     where p.id = auth.uid()
       and p.role = 'admin'
       and p.role_id is null
       and coalesce(p.admin_level, 'master') = 'master'
  );
$$;

create or replace function public.can_see_donors()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_capability('view_donors');
$$;

-- ---------------------------------------------------------------------------
-- Who may read and change roles
--
-- Any administrator may read them: the sidebar has to resolve its own role to
-- know what to draw. Only the master may write them.
-- ---------------------------------------------------------------------------
alter table public.roles enable row level security;
alter table public.role_capabilities enable row level security;

drop policy if exists "roles read" on public.roles;
create policy "roles read" on public.roles
  for select using (public.is_admin());
drop policy if exists "roles write master" on public.roles;
create policy "roles write master" on public.roles
  for all using (public.is_master()) with check (public.is_master());

drop policy if exists "role caps read" on public.role_capabilities;
create policy "role caps read" on public.role_capabilities
  for select using (public.is_admin());
drop policy if exists "role caps write master" on public.role_capabilities;
create policy "role caps write master" on public.role_capabilities
  for all using (public.is_master()) with check (public.is_master());

-- ---------------------------------------------------------------------------
-- Changing somebody's standing is a master's job
--
-- This is 0015's guard with one column added to each branch: role_id is now
-- part of what "standing" means, and has to be protected in exactly the same
-- places the role and the level already were.
--
-- Both branches matter. The first silently puts back anything a member tried
-- to change about their own standing — without it, a member editing their own
-- profile could make themselves an administrator. The second lets an ordinary
-- administrator edit somebody's details but never what they are.
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
    new.role_id     := old.role_id;
    new.is_blocked  := old.is_blocked;
  elsif not public.is_master() then
    -- An administrator who is not a master may edit details, never standing.
    if new.role is distinct from old.role
       or new.admin_level is distinct from old.admin_level
       or new.role_id is distinct from old.role_id then
      raise exception 'Only a master administrator can change what someone is.'
        using errcode = 'insufficient_privilege';
    end if;
    new.is_blocked := old.is_blocked;
  end if;
  return new;
end $$;

drop trigger if exists profiles_guard_privileges on public.profiles;
create trigger profiles_guard_privileges
  before update on public.profiles
  for each row execute function public.guard_profile_privileges();
