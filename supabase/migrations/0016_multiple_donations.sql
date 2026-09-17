-- ===========================================================================
-- A donor may give more than once in a month.
--
-- 0010 put `unique (donor_id, month)` on donations, to stop the same gift
-- being recorded twice and inflating the fund. That guarded against a real
-- mistake, but it also made a real event impossible: somebody who gives 2,000
-- at the start of the month and 3,000 after payday had a second gift that the
-- system could only store by overwriting the first. The fund then read 3,000
-- when 5,000 had arrived.
--
-- So the constraint goes, and each gift is its own row with its own date and
-- note. A month's giving for a donor is now the sum of their rows, which is
-- what `donor_month` returns, and the individual rows travel with it so the
-- screen can show where the total came from.
--
-- The double-entry risk the constraint existed for is handled where it
-- belongs: a recorded donation is visible in the list immediately, with its
-- date, and can be removed one row at a time.
-- ===========================================================================

-- Dropped by lookup rather than by name: the constraint was created inline in
-- 0010, so its name is whatever Postgres chose, and asserting that name here
-- would make this migration fail on any database that was built differently.
do $$
declare c text;
begin
  select conname into c
    from pg_constraint
   where conrelid = 'public.donations'::regclass
     and contype  = 'u'
     and pg_get_constraintdef(oid) ilike '%(donor_id, month)%';
  if c is not null then
    execute format('alter table public.donations drop constraint %I', c);
  end if;
end $$;

-- The unique index was also doing the lookup work. Replace it, or every read
-- of a donor's month becomes a scan.
create index if not exists donations_donor_month_idx
  on public.donations (donor_id, month);

-- ---------------------------------------------------------------------------
-- Donors for a month, with each gift listed.
--
-- `given` is still the figure it always was — what this donor gave in this
-- month — so everything reading it keeps working; it is now a sum rather than
-- a single row. `entries` is the detail behind that sum, and `entry_count`
-- lets a screen decide whether the detail is worth showing.
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
             coalesce(p.full_name, d.name) as name,
             coalesce(p.mobile, d.contact) as contact,
             p.id                          as user_id,
             p.email                       as email,
             d.monthly_pledge, d.is_active, d.note,
             g.given,
             g.entry_count,
             -- The most recent gift: what a single-line summary should date
             -- itself by.
             g.received_on,
             coalesce(g.entries, '[]'::json) as entries
      from public.donors d
      left join public.profiles p on p.id = d.user_id
      left join lateral (
        select sum(dn.amount)      as given,
               count(*)::int       as entry_count,
               max(dn.received_on) as received_on,
               json_agg(
                 json_build_object(
                   'id',          dn.id,
                   'amount',      dn.amount,
                   'received_on', dn.received_on,
                   'note',        dn.note
                 ) order by dn.received_on, dn.created_at
               ) as entries
          from public.donations dn
         where dn.donor_id = d.id
           and dn.month = date_trunc('month', p_month)::date
      ) g on true
      where d.is_active or g.entry_count > 0
    ) t
  ), '[]'::json) else null end;
$$;

-- ---------------------------------------------------------------------------
-- Budget position, counting donors rather than donation rows.
--
-- Replaces the 0012 version, and only for this: `count(*)` over donations was
-- the number of donors while a donor could have one row. With several rows
-- each it became the number of gifts, and the dashboard would have reported
-- more donors than the foundation has.
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
    select coalesce(sum(d.amount), 0)   as total,
           count(distinct d.donor_id)   as donors,
           count(*)                     as gifts
    from public.donations d, m
    where d.month = m.start_day
  )
  select case when public.is_admin() then json_build_object(
    'month',      (select start_day from m),
    'budget',     coalesce((select b.amount from public.monthly_budgets b, m
                             where b.month = m.start_day), 0),
    'donated',    (select total from given),
    'donors',     (select donors from given),
    'gifts',      (select gifts from given),
    'fund',       (select total from given),
    'spent',      (select total from spent),
    'transfers',  (select transfers from spent),
    'committed',  (select total from committed),
    'remaining',  (select total from given) - (select total from spent),
    'has_budget', (select total from given) > 0
  ) else null end;
$$;
