-- ===========================================================================
-- Donors are members, and the fund is what they gave.
--
-- Two changes that belong together.
--
-- 1. A donor is a registered member, chosen from the roll rather than typed in.
--    Free text meant "Mohsin" and "Mohsin Raza" could be the same person twice,
--    and nothing tied a donation to an account.
--
-- 2. The month's fund is the donations received in it. The budget can no longer
--    be typed in: a figure somebody set is a promise, and the committee was
--    spending against it. Now the only way the fund goes up is a donor giving.
-- ===========================================================================

alter table public.donors
  add column if not exists user_id uuid references public.profiles (id) on delete cascade;

-- Nullable, and unique only where set: rows that predate this stay as they are
-- rather than being deleted, and the app requires an account for new ones.
create unique index if not exists donors_user_idx
  on public.donors (user_id) where user_id is not null;

comment on column public.donors.user_id is
  'The member giving. Required for anything added after 0012; null on legacy rows.';
comment on column public.donors.name is
  'Display fallback for legacy rows. Linked donors are named by their profile.';

-- Link anything that matches a member exactly; leave the rest alone.
update public.donors d
   set user_id = p.id
  from public.profiles p
 where d.user_id is null
   and lower(btrim(d.name)) = lower(btrim(p.full_name))
   and not exists (select 1 from public.donors o where o.user_id = p.id);

-- ---------------------------------------------------------------------------
-- The fund is the donations. `budget` stays in the payload so old months still
-- report what was once set, but it no longer counts toward anything.
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
    select coalesce(sum(coalesce(r.amount_approved, r.amount_requested)), 0) as total
    from public.fund_requests r
    where r.status = 'accepted'
  ),
  given as (
    select coalesce(sum(d.amount), 0) as total, count(*) as donors
    from public.donations d, m
    where d.month = m.start_day
  )
  select case when public.is_admin() then json_build_object(
    'month',      (select start_day from m),
    'budget',     coalesce((select b.amount from public.monthly_budgets b, m
                             where b.month = m.start_day), 0),
    'donated',    (select total from given),
    'donors',     (select donors from given),
    'fund',       (select total from given),
    'spent',      (select total from spent),
    'transfers',  (select transfers from spent),
    'committed',  (select total from committed),
    'remaining',  (select total from given) - (select total from spent),
    'has_budget', (select total from given) > 0
  ) else null end;
$$;

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
        coalesce((
          select sum(d.amount) from public.donations d where d.month = g.month::date
        ), 0) as donated,
        coalesce((
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
    ) t
  ), '[]'::json) else null end;
$$;

-- ---------------------------------------------------------------------------
-- Donors for a month, named by their account.
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
-- Members who could still be added as donors — the picker's source.
-- Searchable, and already-added members are left out.
-- ---------------------------------------------------------------------------
create or replace function public.donor_candidates(p_query text default '')
returns json
language sql
stable
security definer
set search_path = public
as $$
  select case when public.is_admin() then coalesce((
    select json_agg(t order by t.full_name) from (
      select p.id, p.full_name, p.email, p.mobile, p.city
      from public.profiles p
      where not exists (select 1 from public.donors d where d.user_id = p.id)
        and (
          coalesce(btrim(p_query), '') = ''
          or p.full_name ilike '%' || btrim(p_query) || '%'
          or p.email     ilike '%' || btrim(p_query) || '%'
          or p.mobile    ilike '%' || btrim(p_query) || '%'
        )
      limit 25
    ) t
  ), '[]'::json) else null end;
$$;
