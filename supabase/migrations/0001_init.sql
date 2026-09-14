-- ===========================================================================
-- Subaidar Hasnain Foundation — core schema
-- Run in Supabase → SQL Editor (or `supabase db push`).
-- ===========================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$ begin
  create type gender_t as enum ('male', 'female', 'other');
exception when duplicate_object then null; end $$;

do $$ begin
  -- The four stages the member sees, plus a terminal 'rejected'.
  create type request_status as enum ('requested', 'review', 'accepted', 'transferred', 'rejected');
exception when duplicate_object then null; end $$;

do $$ begin
  create type user_role as enum ('member', 'admin');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- profiles — one row per auth user, holds the registration details
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  full_name    text        not null,
  gender       gender_t    not null,
  age          int         not null check (age between 12 and 120),
  country      text        not null,
  city         text        not null,
  email        text        not null,
  mobile       text        not null,
  nic_path     text,                                    -- storage path of the NIC image
  role         user_role   not null default 'member',
  is_blocked   boolean     not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists profiles_role_idx on public.profiles (role);
create index if not exists profiles_created_idx on public.profiles (created_at desc);

-- ---------------------------------------------------------------------------
-- fund_types — the options on the member dashboard (data-driven, not hardcoded)
-- ---------------------------------------------------------------------------
create table if not exists public.fund_types (
  id                text primary key,          -- 'monthly' | 'accidental' | 'grocery' | 'electricity'
  name              text    not null,
  description       text,
  gradient          text    not null default 'g-brand',   -- CSS class used by the UI
  icon              text    not null default 'heart',
  document_label    text    not null default 'Supporting document',
  document_required boolean not null default true,
  min_amount        numeric(12,2) not null default 1000,
  max_amount        numeric(12,2),
  is_active         boolean not null default true,
  sort_order        int     not null default 0
);

-- ---------------------------------------------------------------------------
-- fund_requests — an application for help
-- ---------------------------------------------------------------------------
create sequence if not exists public.request_ref_seq start 1001;

create table if not exists public.fund_requests (
  id               uuid primary key default gen_random_uuid(),
  reference        text unique not null
                     default 'SHF-' || to_char(now(), 'YY') || '-' || lpad(nextval('public.request_ref_seq')::text, 5, '0'),
  user_id          uuid not null references public.profiles (id) on delete cascade,
  fund_type_id     text not null references public.fund_types (id),
  amount_requested numeric(12,2) not null check (amount_requested > 0),
  amount_approved  numeric(12,2) check (amount_approved >= 0),
  purpose          text,
  status           request_status not null default 'requested',
  admin_note       text,
  reviewed_by      uuid references public.profiles (id),
  transfer_ref     text,
  transferred_at   timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists fund_requests_user_idx    on public.fund_requests (user_id, created_at desc);
create index if not exists fund_requests_status_idx  on public.fund_requests (status, created_at desc);
create index if not exists fund_requests_type_idx    on public.fund_requests (fund_type_id);

-- ---------------------------------------------------------------------------
-- request_attachments — medical reports, utility bills, receipts…
-- ---------------------------------------------------------------------------
create table if not exists public.request_attachments (
  id          uuid primary key default gen_random_uuid(),
  request_id  uuid not null references public.fund_requests (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  path        text not null,                  -- storage object path in the `documents` bucket
  file_name   text not null,
  mime_type   text,
  size_bytes  bigint,
  kind        text not null default 'report', -- report | bill | receipt | other
  created_at  timestamptz not null default now()
);

create index if not exists attachments_request_idx on public.request_attachments (request_id);

-- ---------------------------------------------------------------------------
-- request_events — the audit trail behind the progress tracker
-- ---------------------------------------------------------------------------
create table if not exists public.request_events (
  id          uuid primary key default gen_random_uuid(),
  request_id  uuid not null references public.fund_requests (id) on delete cascade,
  status      request_status not null,
  note        text,
  actor_id    uuid references public.profiles (id),
  created_at  timestamptz not null default now()
);

create index if not exists events_request_idx on public.request_events (request_id, created_at);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- security definer so RLS policies can check the role without recursing into
-- the profiles policies themselves.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- A member may edit their own profile, but must never be able to promote
-- themselves to admin or unblock themselves. Enforced here rather than in the
-- RLS WITH CHECK clause, which would have to re-query profiles and recurse.
create or replace function public.guard_profile_privileges()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    new.role       := old.role;
    new.is_blocked := old.is_blocked;
  end if;
  return new;
end $$;

drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard before update on public.profiles
  for each row execute function public.guard_profile_privileges();

drop trigger if exists requests_touch on public.fund_requests;
create trigger requests_touch before update on public.fund_requests
  for each row execute function public.touch_updated_at();

-- Every new request opens its timeline at 'requested'.
create or replace function public.log_request_created()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- note stays null so the app can render it in the member's language
  insert into public.request_events (request_id, status, note, actor_id)
  values (new.id, new.status, null, new.user_id);
  return new;
end $$;

drop trigger if exists requests_log_created on public.fund_requests;
create trigger requests_log_created after insert on public.fund_requests
  for each row execute function public.log_request_created();

-- Every status change appends to the timeline.
create or replace function public.log_request_status_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    insert into public.request_events (request_id, status, note, actor_id)
    values (new.id, new.status, new.admin_note, coalesce(new.reviewed_by, auth.uid()));

    if new.status = 'transferred' and new.transferred_at is null then
      new.transferred_at := now();
    end if;
  end if;
  return new;
end $$;

-- BEFORE update so transferred_at can be set on the same row.
drop trigger if exists requests_log_status on public.fund_requests;
create trigger requests_log_status before update on public.fund_requests
  for each row execute function public.log_request_status_change();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.profiles            enable row level security;
alter table public.fund_types          enable row level security;
alter table public.fund_requests       enable row level security;
alter table public.request_attachments enable row level security;
alter table public.request_events      enable row level security;

-- profiles ------------------------------------------------------------------
drop policy if exists "profiles read own"    on public.profiles;
drop policy if exists "profiles read admin"  on public.profiles;
drop policy if exists "profiles update own"  on public.profiles;
drop policy if exists "profiles update admin" on public.profiles;
drop policy if exists "profiles insert own"  on public.profiles;

create policy "profiles read own" on public.profiles
  for select using (id = auth.uid());
create policy "profiles read admin" on public.profiles
  for select using (public.is_admin());
create policy "profiles insert own" on public.profiles
  for insert with check (id = auth.uid());
create policy "profiles update own" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());
create policy "profiles update admin" on public.profiles
  for update using (public.is_admin()) with check (public.is_admin());

-- fund_types ----------------------------------------------------------------
drop policy if exists "fund types readable"   on public.fund_types;
drop policy if exists "fund types admin write" on public.fund_types;

create policy "fund types readable" on public.fund_types
  for select using (auth.role() = 'authenticated');
create policy "fund types admin write" on public.fund_types
  for all using (public.is_admin()) with check (public.is_admin());

-- fund_requests -------------------------------------------------------------
drop policy if exists "requests read own"    on public.fund_requests;
drop policy if exists "requests read admin"  on public.fund_requests;
drop policy if exists "requests insert own"  on public.fund_requests;
drop policy if exists "requests update admin" on public.fund_requests;

create policy "requests read own" on public.fund_requests
  for select using (user_id = auth.uid());
create policy "requests read admin" on public.fund_requests
  for select using (public.is_admin());
create policy "requests insert own" on public.fund_requests
  for insert with check (user_id = auth.uid() and status = 'requested');
-- Only admins move a request through the pipeline.
create policy "requests update admin" on public.fund_requests
  for update using (public.is_admin()) with check (public.is_admin());

-- request_attachments -------------------------------------------------------
drop policy if exists "attachments read own"   on public.request_attachments;
drop policy if exists "attachments read admin" on public.request_attachments;
drop policy if exists "attachments insert own" on public.request_attachments;
drop policy if exists "attachments delete own" on public.request_attachments;

create policy "attachments read own" on public.request_attachments
  for select using (user_id = auth.uid());
create policy "attachments read admin" on public.request_attachments
  for select using (public.is_admin());
create policy "attachments insert own" on public.request_attachments
  for insert with check (user_id = auth.uid());
create policy "attachments delete own" on public.request_attachments
  for delete using (user_id = auth.uid());

-- request_events ------------------------------------------------------------
drop policy if exists "events read own"   on public.request_events;
drop policy if exists "events read admin" on public.request_events;
drop policy if exists "events insert admin" on public.request_events;

create policy "events read own" on public.request_events
  for select using (
    exists (select 1 from public.fund_requests r where r.id = request_id and r.user_id = auth.uid())
  );
create policy "events read admin" on public.request_events
  for select using (public.is_admin());
create policy "events insert admin" on public.request_events
  for insert with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Admin dashboard aggregate (runs with the caller's RLS via is_admin check)
-- ---------------------------------------------------------------------------
create or replace function public.admin_stats()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select case when public.is_admin() then json_build_object(
    'members',           (select count(*) from public.profiles where role = 'member'),
    'requested',         (select count(*) from public.fund_requests where status = 'requested'),
    'review',            (select count(*) from public.fund_requests where status = 'review'),
    'accepted',          (select count(*) from public.fund_requests where status = 'accepted'),
    'transferred',       (select count(*) from public.fund_requests where status = 'transferred'),
    'rejected',          (select count(*) from public.fund_requests where status = 'rejected'),
    'total_requested',   (select coalesce(sum(amount_requested), 0) from public.fund_requests),
    'total_disbursed',   (select coalesce(sum(coalesce(amount_approved, amount_requested)), 0)
                          from public.fund_requests where status = 'transferred'),
    'by_fund',           (select coalesce(json_agg(t), '[]'::json) from (
                            select ft.id, ft.name, count(r.id) as count,
                                   coalesce(sum(r.amount_requested), 0) as amount
                            from public.fund_types ft
                            left join public.fund_requests r on r.fund_type_id = ft.id
                            group by ft.id, ft.name, ft.sort_order
                            order by ft.sort_order
                          ) t)
  ) else null end;
$$;
