-- ===========================================================================
-- 1. A fifth fund: School Fees
-- 2. Monthly budgets — the foundation sets what it can give in a month, and
--    every transfer draws that balance down.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- School Fees fund
-- ---------------------------------------------------------------------------
insert into public.fund_types
  (id, name, description, gradient, icon, document_label, document_required,
   min_amount, max_amount, sort_order, name_ur, description_ur, document_label_ur)
values
  ('school', 'School Fees Fund',
   'Tuition, admission and exam fees for children in school',
   'g-plum', 'book', 'Fee voucher, challan or school letter', true,
   1000, 120000, 5,
   'تعلیمی فیس فنڈ',
   'بچوں کی ٹیوشن، داخلہ اور امتحانی فیس میں مدد',
   'فیس واؤچر، چالان یا اسکول کا خط')
on conflict (id) do update set
  name              = excluded.name,
  description       = excluded.description,
  gradient          = excluded.gradient,
  icon              = excluded.icon,
  document_label    = excluded.document_label,
  document_required = excluded.document_required,
  min_amount        = excluded.min_amount,
  max_amount        = excluded.max_amount,
  sort_order        = excluded.sort_order,
  name_ur           = excluded.name_ur,
  description_ur    = excluded.description_ur,
  document_label_ur = excluded.document_label_ur;

-- ---------------------------------------------------------------------------
-- Monthly budget
--
-- The remaining balance is never stored — it is always
--   budget − (everything transferred in that month)
-- so it cannot drift out of step with the transfers that caused it.
-- ---------------------------------------------------------------------------
create table if not exists public.monthly_budgets (
  month      date primary key,                       -- always the 1st of the month
  amount     numeric(12,2) not null check (amount >= 0),
  note       text,
  updated_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- guard against a row for the 14th of a month sitting beside one for the 1st
create or replace function public.normalise_budget_month()
returns trigger language plpgsql as $$
begin
  new.month := date_trunc('month', new.month)::date;
  return new;
end $$;

drop trigger if exists budgets_normalise on public.monthly_budgets;
create trigger budgets_normalise before insert or update on public.monthly_budgets
  for each row execute function public.normalise_budget_month();

drop trigger if exists budgets_touch on public.monthly_budgets;
create trigger budgets_touch before update on public.monthly_budgets
  for each row execute function public.touch_updated_at();

alter table public.monthly_budgets enable row level security;

drop policy if exists "budgets admin read"  on public.monthly_budgets;
drop policy if exists "budgets admin write" on public.monthly_budgets;

-- Budgets are internal finance: administrators only, members never see them.
create policy "budgets admin read" on public.monthly_budgets
  for select using (public.is_admin());
create policy "budgets admin write" on public.monthly_budgets
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Budget position for a given month
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
    -- approved but not yet paid: money the foundation has promised this month
    select coalesce(sum(coalesce(r.amount_approved, r.amount_requested)), 0) as total
    from public.fund_requests r
    where r.status = 'accepted'
  )
  select case when public.is_admin() then json_build_object(
    'month',      (select start_day from m),
    'budget',     coalesce((select b.amount from public.monthly_budgets b, m where b.month = m.start_day), 0),
    'spent',      (select total from spent),
    'transfers',  (select transfers from spent),
    'committed',  (select total from committed),
    'remaining',  coalesce((select b.amount from public.monthly_budgets b, m where b.month = m.start_day), 0)
                    - (select total from spent),
    'has_budget', exists (select 1 from public.monthly_budgets b, m where b.month = m.start_day)
  ) else null end;
$$;

-- ---------------------------------------------------------------------------
-- Recent months, for the budget history table
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
