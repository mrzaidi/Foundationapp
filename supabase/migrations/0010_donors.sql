-- ===========================================================================
-- Donors.
--
-- The budget was a number somebody typed in. Where it came from lived outside
-- the system, which meant the month's capacity and the month's giving were two
-- separate truths. Donors are people who give each month; their donations for a
-- month add to that month's fund, so the figure the committee spends against is
-- the money that actually arrived.
--
-- A month's fund is therefore  set budget + donations received that month.
-- The set budget stays: some months carry a reserve, or a single large gift
-- that is not a standing donor.
-- ===========================================================================

create table if not exists public.donors (
  id             uuid primary key default gen_random_uuid(),
  name           text not null check (char_length(btrim(name)) >= 2),
  contact        text,                                   -- phone or email, free text
  monthly_pledge numeric(12,2) not null default 0 check (monthly_pledge >= 0),
  is_active      boolean not null default true,
  note           text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists donors_active_idx on public.donors (is_active, name);

-- ---------------------------------------------------------------------------
-- What a donor actually gave, in a given month.
--
-- The pledge is what they said; a donation is what arrived. Only donations
-- count toward the fund — a month should never be spent against a promise.
-- ---------------------------------------------------------------------------
create table if not exists public.donations (
  id          uuid primary key default gen_random_uuid(),
  donor_id    uuid not null references public.donors (id) on delete cascade,
  month       date not null,                             -- always the 1st
  amount      numeric(12,2) not null check (amount > 0),
  received_on date not null default current_date,
  note        text,
  recorded_by uuid references public.profiles (id),
  created_at  timestamptz not null default now(),
  -- One row per donor per month: recording the same gift twice would inflate
  -- the fund, and an inflated fund is money the committee thinks it has.
  unique (donor_id, month)
);

create index if not exists donations_month_idx on public.donations (month);

create or replace function public.normalise_donation_month()
returns trigger language plpgsql as $$
begin
  new.month := date_trunc('month', new.month)::date;
  return new;
end $$;

drop trigger if exists donations_normalise on public.donations;
create trigger donations_normalise before insert or update on public.donations
  for each row execute function public.normalise_donation_month();

drop trigger if exists donors_touch on public.donors;
create trigger donors_touch before update on public.donors
  for each row execute function public.touch_updated_at();

alter table public.donors    enable row level security;
alter table public.donations enable row level security;

drop policy if exists "donors admin"    on public.donors;
drop policy if exists "donations admin" on public.donations;

-- Donor records are internal finance, like the budget: staff only. A donor's
-- name and what they give is not something members should be able to read.
create policy "donors admin" on public.donors
  for all using (public.is_admin()) with check (public.is_admin());
create policy "donations admin" on public.donations
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Budget position, now including what donors gave.
--
-- Replaces the 0006 version. `budget` is still the figure an admin set;
-- `donated` is what arrived; `fund` is the two together and is what
-- `remaining` is measured against.
-- ---------------------------------------------------------------------------
create or replace function public.budget_status(p_month date default current_date)
returns json
language sql
stable
security definer
set search_path = public
as $$
  with m as (
    select date_trunc('month', p_month)::date as start_day,
           (date_trunc('month', p_month) + interval '1 month')::date as end_day
  ),
  spent as (
    select coalesce(sum(coalesce(r.amount_approved, r.amount_requested)), 0) as total,
           count(*) as transfers
    from public.fund_requests r, m
    where r.status = 'transferred'
      and r.transferred_at >= m.start_day
      and r.transferred_at <  m.end_day
  ),
  committed as (
    -- approved but not yet paid: money the foundation has promised
    select coalesce(sum(coalesce(r.amount_approved, r.amount_requested)), 0) as total
    from public.fund_requests r
    where r.status = 'accepted'
  ),
  given as (
    select coalesce(sum(d.amount), 0) as total, count(*) as donors
    from public.donations d, m
    where d.month = m.start_day
  ),
  base as (
    select coalesce((select b.amount from public.monthly_budgets b, m where b.month = m.start_day), 0)
             as amount
  )
  select case when public.is_admin() then json_build_object(
    'month',      (select start_day from m),
    'budget',     (select amount from base),
    'donated',    (select total from given),
    'donors',     (select donors from given),
    'fund',       (select amount from base) + (select total from given),
    'spent',      (select total from spent),
    'transfers',  (select transfers from spent),
    'committed',  (select total from committed),
    'remaining',  (select amount from base) + (select total from given) - (select total from spent),
    'has_budget', exists (select 1 from public.monthly_budgets b, m where b.month = m.start_day)
                    or (select total from given) > 0
  ) else null end;
$$;

-- ---------------------------------------------------------------------------
-- History, with the same two sources side by side.
-- ---------------------------------------------------------------------------
create or replace function public.budget_history(p_months int default 12)
returns json
language sql
stable
security definer
set search_path = public
as $$
  select case when public.is_admin() then coalesce((
    select json_agg(t order by t.month desc) from (
      select
        g.month::date as month,
        coalesce(b.amount, 0) as budget,
        coalesce((
          select sum(d.amount) from public.donations d where d.month = g.month::date
        ), 0) as donated,
        coalesce(b.amount, 0) + coalesce((
          select sum(d.amount) from public.donations d where d.month = g.month::date
        ), 0) as fund,
        coalesce((
          select sum(coalesce(r.amount_approved, r.amount_requested))
          from public.fund_requests r
          where r.status = 'transferred'
            and r.transferred_at >= g.month
            and r.transferred_at <  g.month + interval '1 month'
        ), 0) as spent
      from generate_series(
             date_trunc('month', current_date) - ((greatest(p_months, 1) - 1) || ' months')::interval,
             date_trunc('month', current_date),
             interval '1 month'
           ) as g(month)
      left join public.monthly_budgets b on b.month = g.month::date
    ) t
  ), '[]'::json) else null end;
$$;

-- ---------------------------------------------------------------------------
-- Donors for a month, with what each has given — the table the admin sees.
-- Active donors appear whether or not they have given yet, so a missing
-- donation is visible rather than absent.
-- ---------------------------------------------------------------------------
create or replace function public.donor_month(p_month date default current_date)
returns json
language sql
stable
security definer
set search_path = public
as $$
  select case when public.is_admin() then coalesce((
    select json_agg(t order by t.name) from (
      select d.id, d.name, d.contact, d.monthly_pledge, d.is_active, d.note,
             dn.id          as donation_id,
             dn.amount      as given,
             dn.received_on as received_on,
             dn.note        as donation_note
      from public.donors d
      left join public.donations dn
        on dn.donor_id = d.id
       and dn.month = date_trunc('month', p_month)::date
      where d.is_active or dn.id is not null
    ) t
  ), '[]'::json) else null end;
$$;
