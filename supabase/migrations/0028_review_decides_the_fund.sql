-- ===========================================================================
-- Three changes to how an application is decided.
--
-- 1. Which fund pays for it is chosen at review, not at transfer, and is
--    settled once the application is approved.
-- 2. A role sees only the statuses it is given, so an office can split the
--    work: one person takes applications in, another only pays them out.
-- 3. A standing monthly arrangement, once approved, approves itself each
--    month — until somebody rejects it.
--
-- And one correction underneath all three: deciding an application was still
-- master-only in the database, from 0015, which would have made the roles in
-- point 2 unable to do the job they are named for.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. The fund is chosen at review and settled on approval
--
-- It used to be asked at transfer — the last possible moment, when the money
-- was already going out of the door. Asking at review puts it in front of the
-- person actually weighing the application, who is the one who knows whether
-- this is Zakat or Khums, and leaves it visible for as long as the decision is
-- still open.
--
-- Once the application is approved it is fixed. An approval is a promise made
-- out of a particular fund; moving it afterwards rewrites which fund paid for
-- a decision that has already been taken.
-- ---------------------------------------------------------------------------
create or replace function public.guard_funded_from()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.funded_from is distinct from old.funded_from
     and old.status in ('accepted', 'transferred') then
    raise exception 'The fund was settled when this application was approved and cannot be changed.'
      using errcode = 'insufficient_privilege';
  end if;

  -- Approving without naming a fund leaves a promise nothing is set against.
  if new.status = 'accepted'
     and old.status is distinct from 'accepted'
     and new.funded_from is null then
    raise exception 'Choose which fund pays for this before approving it.'
      using errcode = 'check_violation';
  end if;

  return new;
end $$;

drop trigger if exists requests_guard_funded_from on public.fund_requests;
create trigger requests_guard_funded_from
  before update on public.fund_requests
  for each row execute function public.guard_funded_from();

-- ---------------------------------------------------------------------------
-- 2. A role sees the statuses it is given
--
-- A role with no rows here sees everything, which is what every role does
-- today and what the master role must always do. Giving a role even one status
-- narrows it to exactly those.
-- ---------------------------------------------------------------------------
create table if not exists public.role_statuses (
  role_id uuid not null references public.roles (id) on delete cascade,
  status  request_status not null,
  primary key (role_id, status)
);

comment on table public.role_statuses is
  'Which application statuses a role may see. No rows for a role means all of them.';

alter table public.role_statuses enable row level security;

drop policy if exists "role statuses read" on public.role_statuses;
create policy "role statuses read" on public.role_statuses
  for select using (public.is_admin());
drop policy if exists "role statuses write master" on public.role_statuses;
create policy "role statuses write master" on public.role_statuses
  for all using (public.is_master()) with check (public.is_master());

/**
 * The statuses this administrator may see, as an array.
 *
 * Empty means unrestricted — the caller shows everything. The master role is
 * never restricted whatever rows exist, for the same reason it always holds
 * every capability: the account that fixes a mistake must be able to see it.
 */
create or replace function public.my_statuses()
returns request_status[]
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.is_master() then '{}'::request_status[]
    else coalesce((
      select array_agg(rs.status)
        from public.profiles p
        join public.role_statuses rs on rs.role_id = p.role_id
       where p.id = auth.uid() and p.role = 'admin'
    ), '{}'::request_status[])
  end;
$$;

-- An application a role may not see is not theirs to read, whatever the app
-- asks for. The existing admin read policy is narrowed rather than replaced.
drop policy if exists "requests read admin" on public.fund_requests;
create policy "requests read admin" on public.fund_requests
  for select using (
    public.is_admin()
    and (
      cardinality(public.my_statuses()) = 0
      or status = any (public.my_statuses())
    )
  );

-- ---------------------------------------------------------------------------
-- 3. Deciding is a capability, not a rank
--
-- 0015 wrote this as "master or nothing", which was true when there were three
-- fixed levels. 0025 made roles out of rows, and this is the line that would
-- have stopped an Application Manager approving anything — the one job the
-- role exists for. It asks for the capability now.
-- ---------------------------------------------------------------------------
create or replace function public.guard_request_decisions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status
     or new.amount_approved is distinct from old.amount_approved then
    if public.is_admin() and not public.has_capability('decide_requests') then
      raise exception 'Your administrator account cannot decide applications or record transfers.'
        using errcode = 'insufficient_privilege';
    end if;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- 4. A standing arrangement approves itself
--
-- The committee decided once, when it approved the first application. Making
-- somebody approve the same household for the same fund every month was not a
-- second decision, it was the first one re-typed — and a month where nobody
-- got round to it was a family not paid.
--
-- So an arrangement carries the amount and the fund that were approved, and
-- each month's application arrives already approved. Rejecting one is always
-- available and stops nothing else; ending the arrangement is how it stops for
-- good.
-- ---------------------------------------------------------------------------
alter table public.recurring_grants
  add column if not exists funded_from text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'recurring_grants_funded_from_check') then
    alter table public.recurring_grants
      add constraint recurring_grants_funded_from_check
      check (funded_from is null or funded_from in
        ('khums','zakat','zakat_al_fitr','sadaqah','fidyah','kaffarah','nadhr','general'));
  end if;
end $$;

comment on column public.recurring_grants.funded_from is
  'The fund the first approval came out of. Each month''s application inherits it.';

-- Carry the fund across from the application that started each arrangement.
update public.recurring_grants g
   set funded_from = r.funded_from
  from public.fund_requests r
 where g.source_request_id = r.id
   and g.funded_from is null
   and r.funded_from is not null;

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

    /*
     * Approved on arrival, because it was approved when the arrangement was
     * made — but only when the fund it comes out of is known. Without one,
     * this month's application waits for somebody to say which fund pays,
     * rather than being approved against nothing.
     */
    insert into public.fund_requests (
      user_id, fund_type_id, amount_requested, amount_approved,
      status, is_automatic, funded_from
    )
    values (
      g.user_id, g.fund_type_id, g.amount,
      case when g.funded_from is not null then g.amount else null end,
      case when g.funded_from is not null then 'accepted' else 'requested' end,
      true, g.funded_from
    );

    update public.recurring_grants
       set last_generated_on = this_month
     where id = g.id;

    n_created := n_created + 1;
  end loop;

  created := n_created;
  skipped := n_skipped;
  return next;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Enrolment remembers the fund as well as the amount
--
-- 0009's version carried the approved amount into the arrangement so that the
-- figure recurs. The fund has to travel the same way, or next month's
-- application has an amount and nothing to pay it from and falls back to
-- waiting for a human — which is the thing point 4 exists to stop.
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

  insert into public.recurring_grants (user_id, fund_type_id, amount, funded_from,
                                       source_request_id, last_generated_on)
  values (new.user_id, new.fund_type_id,
          coalesce(new.amount_approved, new.amount_requested), new.funded_from, new.id,
          date_trunc('month', (now() at time zone 'Asia/Karachi'))::date)
  on conflict (user_id, fund_type_id) do update set
    amount            = excluded.amount,
    -- Keep whatever fund the arrangement already had if this approval named
    -- none; losing it would send next month back to waiting for a human.
    funded_from       = coalesce(excluded.funded_from, public.recurring_grants.funded_from),
    source_request_id = excluded.source_request_id,
    is_active         = true;

  return new;
end $$;
