-- ===========================================================================
-- Accounts: every rupee in, every rupee out, and what is left.
--
-- Until now the month stood alone. `budget_status` reported what donors gave
-- this month less what was paid out this month, which answers "how did this
-- month go" and quietly throws away the answer to "what do we actually have".
-- A month that took 50,000 and paid 30,000 opened the next month at zero, and
-- the 20,000 that was genuinely still in the account existed nowhere.
--
-- So the balance carries forward. It is deliberately NOT stored and NOT moved
-- by a monthly job: a carried figure that lives in a row can be missed when
-- the job does not run, doubled when it runs twice, and wrong for ever after
-- a donation is backdated. Instead the opening balance of any month is
-- derived -- everything received before it, less everything paid before it --
-- so it is right the first time and stays right when history is corrected.
--
--     opening(m)   = all donations before m - all transfers before m
--     closing(m)   = opening(m) + received(m) - paid(m)
--     opening(m+1) = closing(m)                        , by construction
--
-- That identity is the whole feature. Nothing has to run for it to hold.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- The month's ledger: one line per movement, with a running balance.
--
-- Donations are money in, transferred applications are money out, and nothing
-- else moves the account -- an approved application that has not been paid is
-- a commitment, not a movement, and is reported separately.
-- ---------------------------------------------------------------------------
create or replace function public.account_ledger(p_month date default current_date)
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
  opening as (
    select
      coalesce((select sum(d.amount)
                  from public.donations d cross join m
                 where d.month < m.start_day), 0)
      -
      coalesce((select sum(coalesce(r.amount_approved, r.amount_requested))
                  from public.fund_requests r cross join m
                 where r.status = 'transferred'
                   and (r.transferred_at at time zone 'Asia/Karachi') < m.start_day), 0)
      as amount
  ),
  entries as (
    select dn.received_on   as on_date,
           dn.created_at    as at,
           'in'::text       as direction,
           -- Admin 2 sees the money without being told who gave it: that
           -- level exists to show the budget, not the donor list.
           case when public.can_see_donors()
                then coalesce(p.full_name, dr.name)
                else 'Donation received'
           end              as party,
           'Donation'::text as kind,
           null::text       as reference,
           dn.amount        as amount,
           dn.note          as note
      from public.donations dn
      join public.donors dr       on dr.id = dn.donor_id
      left join public.profiles p on p.id  = dr.user_id
      cross join m
     where dn.month = m.start_day

    union all

    select (r.transferred_at at time zone 'Asia/Karachi')::date as on_date,
           r.transferred_at                                as at,
           'out'::text                                     as direction,
           pr.full_name                                    as party,
           coalesce(ft.name, 'Grant')                      as kind,
           r.reference                                     as reference,
           coalesce(r.amount_approved, r.amount_requested) as amount,
           nullif(btrim(coalesce(r.transfer_ref, '')), '') as note
      from public.fund_requests r
      join public.profiles pr        on pr.id = r.user_id
      left join public.fund_types ft on ft.id = r.fund_type_id
      cross join m
     where r.status = 'transferred'
       and (r.transferred_at at time zone 'Asia/Karachi') >= m.start_day
       and (r.transferred_at at time zone 'Asia/Karachi') <  m.end_day
  ),
  ordered as (
    select e.*,
           (select amount from opening)
             + sum(case when e.direction = 'in' then e.amount else -e.amount end)
               over (order by e.on_date, e.at
                     rows between unbounded preceding and current row) as balance
      from entries e
  )
  select case when public.is_admin() then json_build_object(
    'month',     (select start_day from m),
    'opening',   (select amount from opening),
    'received',  coalesce((select sum(amount) from entries where direction = 'in'), 0),
    'paid',      coalesce((select sum(amount) from entries where direction = 'out'), 0),
    'closing',   (select amount from opening)
                   + coalesce((select sum(amount) from entries where direction = 'in'), 0)
                   - coalesce((select sum(amount) from entries where direction = 'out'), 0),
    -- Promised but not yet paid. Not a movement, but a committee reading the
    -- closing balance needs to know how much of it is already spoken for.
    'committed', coalesce((select sum(coalesce(r.amount_approved, r.amount_requested))
                             from public.fund_requests r
                            where r.status = 'accepted'), 0),
    'entries',   coalesce((select json_agg(o order by o.on_date, o.at) from ordered o),
                          '[]'::json)
  ) else null end;
$$;

-- ---------------------------------------------------------------------------
-- The same thing month by month, for the summary above the ledger.
--
-- `opening` is derived per row rather than carried down the list, so any one
-- month is correct whether or not the months before it are on screen.
-- ---------------------------------------------------------------------------
create or replace function public.account_months(p_months int default 12)
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
        coalesce((select sum(d.amount)
                    from public.donations d
                   where d.month = g.month::date), 0) as received,
        coalesce((select sum(coalesce(r.amount_approved, r.amount_requested))
                    from public.fund_requests r
                   where r.status = 'transferred'
                     and (r.transferred_at at time zone 'Asia/Karachi') >= g.month
                     and (r.transferred_at at time zone 'Asia/Karachi') <  g.month + interval '1 month'), 0) as paid,
        coalesce((select sum(d.amount)
                    from public.donations d
                   where d.month < g.month::date), 0)
        -
        coalesce((select sum(coalesce(r.amount_approved, r.amount_requested))
                    from public.fund_requests r
                   where r.status = 'transferred'
                     and (r.transferred_at at time zone 'Asia/Karachi') < g.month), 0) as opening
      from generate_series(
             date_trunc('month', current_date)
               - ((greatest(p_months, 1) - 1) || ' months')::interval,
             date_trunc('month', current_date),
             interval '1 month'
           ) as g(month)
    ) t
  ), '[]'::json) else null end;
$$;

-- ---------------------------------------------------------------------------
-- Budget position, now opening with what was left over.
--
-- Replaces the 0016 version. `donated` is still this month's giving and
-- `spent` this month's paying; what changes is that the month no longer
-- starts at zero, so `remaining` is the money the foundation actually has
-- rather than the money this month happened to raise.
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
    from public.fund_requests r cross join m
    where r.status = 'transferred'
      and (r.transferred_at at time zone 'Asia/Karachi') >= m.start_day
      and (r.transferred_at at time zone 'Asia/Karachi') <  m.end_day
  ),
  committed as (
    select coalesce(sum(coalesce(r.amount_approved, r.amount_requested)), 0) as total
    from public.fund_requests r
    where r.status = 'accepted'
  ),
  given as (
    select coalesce(sum(d.amount), 0) as total,
           count(distinct d.donor_id) as donors,
           count(*)                   as gifts
    from public.donations d cross join m
    where d.month = m.start_day
  ),
  opening as (
    select
      coalesce((select sum(d.amount)
                  from public.donations d cross join m
                 where d.month < m.start_day), 0)
      -
      coalesce((select sum(coalesce(r.amount_approved, r.amount_requested))
                  from public.fund_requests r cross join m
                 where r.status = 'transferred'
                   and (r.transferred_at at time zone 'Asia/Karachi') < m.start_day), 0)
      as amount
  )
  select case when public.is_admin() then json_build_object(
    'month',      (select start_day from m),
    'budget',     coalesce((select b.amount from public.monthly_budgets b cross join m
                             where b.month = m.start_day), 0),
    -- Brought forward from every month before this one.
    'opening',    (select amount from opening),
    'donated',    (select total from given),
    'donors',     (select donors from given),
    'gifts',      (select gifts from given),
    -- What there is to spend: what was left over, plus what came in.
    'fund',       (select amount from opening) + (select total from given),
    'spent',      (select total from spent),
    'transfers',  (select transfers from spent),
    'committed',  (select total from committed),
    'remaining',  (select amount from opening) + (select total from given)
                    - (select total from spent),
    'has_budget', (select amount from opening) <> 0 or (select total from given) > 0
  ) else null end;
$$;

-- ---------------------------------------------------------------------------
-- The transfer guard, counting what was carried in.
--
-- Replaces the 0013 version, and it has to be replaced in the same migration
-- that introduces the carry-forward. That version measured a transfer against
-- this month's donations alone, so the moment the balance began carrying, a
-- month holding 20,000 brought forward and no new donations would have
-- refused every transfer out of it — money the foundation genuinely had,
-- blocked by the database with a message telling staff to find more donors.
--
-- The rule itself is unchanged: you cannot pay out what you do not hold. It
-- now measures against everything held rather than against one month's luck.
-- ---------------------------------------------------------------------------
create or replace function public.check_transfer_within_fund()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  pays_at     timestamptz;
  month_start date;
  month_end   date;
  opening     numeric;
  donated     numeric;
  fund        numeric;
  already     numeric;
  amount      numeric;
  remaining   numeric;
begin
  -- Only the move *into* transferred matters. Editing a note on something
  -- already paid must not be refused because the month has since filled up.
  if new.status <> 'transferred' or old.status = 'transferred' then
    return new;
  end if;

  -- requests_log_status runs before this and stamps transferred_at; fall back
  -- to now() in case the ordering ever changes.
  pays_at     := coalesce(new.transferred_at, now());
  month_start := date_trunc('month', (pays_at at time zone 'Asia/Karachi'))::date;
  month_end   := (month_start + interval '1 month')::date;

  -- Everything left over from before this month.
  select
    coalesce((select sum(d.amount)
                from public.donations d
               where d.month < month_start), 0)
    -
    coalesce((select sum(coalesce(r.amount_approved, r.amount_requested))
                from public.fund_requests r
               where r.status = 'transferred'
                 and r.id <> new.id
                 and (r.transferred_at at time zone 'Asia/Karachi') < month_start), 0)
    into opening;

  select coalesce(sum(d.amount), 0) into donated
    from public.donations d
   where d.month = month_start;

  fund := opening + donated;

  -- Everything already paid out of this month, excluding this row.
  select coalesce(sum(coalesce(r.amount_approved, r.amount_requested)), 0) into already
    from public.fund_requests r
   where r.status = 'transferred'
     and r.id <> new.id
     and (r.transferred_at at time zone 'Asia/Karachi') >= month_start
     and (r.transferred_at at time zone 'Asia/Karachi') <  month_end;

  amount    := coalesce(new.amount_approved, new.amount_requested);
  remaining := fund - already;

  if amount > remaining then
    raise exception
      'This transfer is % but the foundation only holds %, counting what was brought into % . Record more donations first.',
      to_char(amount, 'FM999,999,999'),
      to_char(greatest(remaining, 0), 'FM999,999,999'),
      to_char(month_start, 'Month YYYY')
      using errcode = 'check_violation';
  end if;

  return new;
end $$;

-- Unchanged, but re-created so applying this file alone is enough.
drop trigger if exists trg_transfer_within_fund on public.fund_requests;
create trigger trg_transfer_within_fund
  before update on public.fund_requests
  for each row execute function public.check_transfer_within_fund();
