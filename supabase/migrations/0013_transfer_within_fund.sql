-- ===========================================================================
-- A transfer cannot exceed the month's fund.
--
-- Until now the portal warned and let it through. It should refuse: the fund is
-- the donations that actually arrived, and paying out more than arrived is not
-- a generous decision, it is an overdraft nobody agreed to. If the committee
-- wants to approve more, the answer is another donation, not a bigger number.
--
-- The rule lives here rather than only in /api/requests/:id so it holds for
-- anything that writes — the native app, a script, or a hand-run UPDATE.
-- ===========================================================================

create or replace function public.check_transfer_within_fund()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  pays_at    timestamptz;
  month_start date;
  month_end   date;
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

  select coalesce(sum(d.amount), 0) into fund
    from public.donations d
   where d.month = month_start;

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
      'This transfer is % but only % is left in the % fund. Record more donations first.',
      to_char(amount, 'FM999,999,999'),
      to_char(greatest(remaining, 0), 'FM999,999,999'),
      to_char(month_start, 'Month YYYY')
      using errcode = 'check_violation';
  end if;

  return new;
end $$;

-- After requests_log_status alphabetically, so transferred_at is already set.
drop trigger if exists trg_transfer_within_fund on public.fund_requests;
create trigger trg_transfer_within_fund
  before update on public.fund_requests
  for each row execute function public.check_transfer_within_fund();
