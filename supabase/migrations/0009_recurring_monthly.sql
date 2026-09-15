-- ===========================================================================
-- Standing monthly support.
--
-- The Monthly Fund is recurring by nature: a family approved for it in March
-- needs it again in April. Until now someone had to remember to re-apply, and
-- the ones least likely to remember are the ones who need it most.
--
-- Approving a monthly application now enrols the member, and on the 1st of
-- each month the system files the next application on their behalf. It arrives
-- as a normal application at `requested` — the committee still decides every
-- month, and every decision is still on the record.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Which funds recur is data, like everything else about a fund.
-- ---------------------------------------------------------------------------
alter table public.fund_types
  add column if not exists is_recurring boolean not null default false;

comment on column public.fund_types.is_recurring is
  'Approving one of these enrols the member for an automatic application each month.';

update public.fund_types set is_recurring = true where id = 'monthly';

-- A flag rather than a sentence in `purpose`: both portals need to label these
-- rows, and they label them in different languages.
alter table public.fund_requests
  add column if not exists is_automatic boolean not null default false;

comment on column public.fund_requests.is_automatic is
  'Filed by generate_recurring_requests() rather than by the member.';

-- ---------------------------------------------------------------------------
-- The standing arrangement itself.
-- ---------------------------------------------------------------------------
create table if not exists public.recurring_grants (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles (id) on delete cascade,
  fund_type_id      text not null references public.fund_types (id),
  amount            numeric(12,2) not null check (amount > 0),
  source_request_id uuid references public.fund_requests (id) on delete set null,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  last_generated_on date,               -- the month we last filed for, as its 1st
  -- One arrangement per member per fund: approving next month's application
  -- must not enrol them twice.
  unique (user_id, fund_type_id)
);

create index if not exists recurring_active_idx
  on public.recurring_grants (is_active, fund_type_id);

alter table public.recurring_grants enable row level security;

drop policy if exists "recurring read own"   on public.recurring_grants;
drop policy if exists "recurring read admin" on public.recurring_grants;
drop policy if exists "recurring write admin" on public.recurring_grants;

-- A member can see that they are enrolled; only staff can change it.
create policy "recurring read own" on public.recurring_grants
  for select using (user_id = auth.uid());
create policy "recurring read admin" on public.recurring_grants
  for select using (public.is_admin());
create policy "recurring write admin" on public.recurring_grants
  for all using (public.is_admin()) with check (public.is_admin());

drop trigger if exists trg_recurring_touch on public.recurring_grants;
create trigger trg_recurring_touch
  before update on public.recurring_grants
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Approving a recurring fund enrols the member.
--
-- Fires only on the move *into* accepted, so re-saving a note on an already
-- approved application does not reset the arrangement. The amount tracks the
-- most recent approval: if the committee approves a different figure, that is
-- the figure that recurs.
-- ---------------------------------------------------------------------------
create or replace function public.enrol_recurring_grant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recurring boolean;
begin
  if new.status <> 'accepted' or old.status = 'accepted' then
    return new;
  end if;

  select is_recurring into recurring from public.fund_types where id = new.fund_type_id;
  if not coalesce(recurring, false) then
    return new;
  end if;

  insert into public.recurring_grants (user_id, fund_type_id, amount, source_request_id,
                                       last_generated_on)
  values (new.user_id, new.fund_type_id,
          coalesce(new.amount_approved, new.amount_requested), new.id,
          date_trunc('month', (now() at time zone 'Asia/Karachi'))::date)
  on conflict (user_id, fund_type_id) do update set
    amount            = excluded.amount,
    source_request_id = excluded.source_request_id,
    is_active         = true;

  return new;
end $$;

drop trigger if exists trg_enrol_recurring on public.fund_requests;
create trigger trg_enrol_recurring
  after update of status on public.fund_requests
  for each row execute function public.enrol_recurring_grant();

-- ---------------------------------------------------------------------------
-- File this month's applications.
--
-- Idempotent on purpose. It is safe to run every day, twice, or by hand: an
-- arrangement that already has an application this month is skipped, so a
-- missed night is caught up the next day rather than lost, and a double-run
-- cannot double-apply.
--
-- Months are Pakistan months. "The 1st" for a foundation in Rawalpindi is not
-- midnight UTC, which is five in the morning there.
-- ---------------------------------------------------------------------------
create or replace function public.generate_recurring_requests()
returns table (created int, skipped int)
language plpgsql
security definer
set search_path = public
as $$
declare
  g            record;
  this_month   date := date_trunc('month', (now() at time zone 'Asia/Karachi'))::date;
  next_month   date := (this_month + interval '1 month')::date;
  n_created    int  := 0;
  n_skipped    int  := 0;
begin
  for g in
    select r.*, p.is_blocked, p.bank_name, p.bank_account_title, p.bank_account_number
      from public.recurring_grants r
      join public.profiles p on p.id = r.user_id
     where r.is_active
  loop
    -- A blocked member, or one whose payout account has been cleared, is
    -- skipped rather than failed: one bad row must not stop the whole month.
    if g.is_blocked
       or coalesce(btrim(g.bank_name), '') = ''
       or coalesce(btrim(g.bank_account_title), '') = ''
       or coalesce(btrim(g.bank_account_number), '') = '' then
      n_skipped := n_skipped + 1;
      continue;
    end if;

    if exists (
      select 1 from public.fund_requests q
       where q.user_id = g.user_id
         and q.fund_type_id = g.fund_type_id
         and (q.created_at at time zone 'Asia/Karachi') >= this_month
         and (q.created_at at time zone 'Asia/Karachi') <  next_month
    ) then
      n_skipped := n_skipped + 1;
      continue;
    end if;

    insert into public.fund_requests (user_id, fund_type_id, amount_requested, status, is_automatic)
    values (g.user_id, g.fund_type_id, g.amount, 'requested', true);

    update public.recurring_grants
       set last_generated_on = this_month
     where id = g.id;

    n_created := n_created + 1;
  end loop;

  return query select n_created, n_skipped;
end $$;

revoke all on function public.generate_recurring_requests() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Run it nightly, if this project has pg_cron.
--
-- 19:05 UTC is 00:05 in Karachi, so the job's first run of a month lands just
-- after midnight on the 1st. Wrapped because pg_cron is not enabled on every
-- Supabase plan — without it the same function is called by /api/cron/monthly,
-- and because the function is idempotent it does not matter if both run.
-- ---------------------------------------------------------------------------
do $$
begin
  create extension if not exists pg_cron;

  perform cron.unschedule('shf-monthly-grants')
    where exists (select 1 from cron.job where jobname = 'shf-monthly-grants');

  perform cron.schedule(
    'shf-monthly-grants',
    '5 19 * * *',
    $job$ select public.generate_recurring_requests(); $job$
  );
exception when others then
  raise notice 'pg_cron unavailable (%), falling back to /api/cron/monthly', sqlerrm;
end $$;
