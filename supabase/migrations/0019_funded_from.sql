-- ===========================================================================
-- Which kind of giving a grant was paid out of.
--
-- 0018 recorded what arrived: Khums, Zakat, Sadaqah and the rest, each with
-- its own rules about what it may be spent on. That only answers half the
-- question. A foundation holding 60,000 of Zakat and 20,000 of Khums does not
-- have 80,000 to spend on anything — and once a grant has gone out of the
-- door, nothing recorded which pot it came from.
--
-- So a transfer names its source, and every kind of giving carries its own
-- balance: what came in of that kind, less what was paid out of it.
--
-- Transfers made before this are unattributed rather than guessed at. They
-- still reduce the overall fund exactly as they always did; they simply do not
-- reduce any one category, because nobody recorded which one they came from
-- and inventing an answer would be worse than admitting that.
-- ===========================================================================

alter table public.fund_requests
  add column if not exists funded_from text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.fund_requests'::regclass
       and conname  = 'fund_requests_funded_from_check'
  ) then
    alter table public.fund_requests
      add constraint fund_requests_funded_from_check check (funded_from is null or funded_from in (
        'khums', 'zakat', 'zakat_al_fitr', 'sadaqah',
        'fidyah', 'kaffarah', 'nadhr', 'general'
      ));
  end if;
end $$;

comment on column public.fund_requests.funded_from is
  'The kind of giving this grant was paid out of. Null on transfers made '
  'before migration 0019, which reduce the overall fund but no one category.';

create index if not exists fund_requests_funded_from_idx
  on public.fund_requests (funded_from) where funded_from is not null;

-- ---------------------------------------------------------------------------
-- What is left of each kind of giving.
--
-- Cumulative, not monthly, and for the same reason the account book carries
-- its balance forward: Zakat received in September and not spent is still
-- Zakat in October. A per-month figure would show it vanishing at midnight on
-- the last day, which is not what happened to the money.
--
--     available(kind) = everything received of that kind
--                     - everything transferred out of that kind
--
-- `unattributed` is what has been paid without a source recorded. It is
-- reported rather than spread across the categories, because spreading it
-- would be a guess presented as a figure.
-- ---------------------------------------------------------------------------
create or replace function public.category_balances()
returns json
language sql
stable
security definer
set search_path = public
as $$
  with kinds(kind) as (
    values ('khums'), ('zakat'), ('zakat_al_fitr'), ('sadaqah'),
           ('fidyah'), ('kaffarah'), ('nadhr'), ('general')
  )
  select case when public.is_admin() then json_build_object(
    'categories', (
      select json_agg(x order by x.available desc, x.kind)
        from (
          select k.kind,
                 coalesce((
                   select sum(dn.amount) from public.donations dn
                    where dn.donation_type = k.kind
                 ), 0) as received,
                 coalesce((
                   select sum(coalesce(r.amount_approved, r.amount_requested))
                     from public.fund_requests r
                    where r.status = 'transferred' and r.funded_from = k.kind
                 ), 0) as paid,
                 coalesce((
                   select sum(dn.amount) from public.donations dn
                    where dn.donation_type = k.kind
                 ), 0)
                 -
                 coalesce((
                   select sum(coalesce(r.amount_approved, r.amount_requested))
                     from public.fund_requests r
                    where r.status = 'transferred' and r.funded_from = k.kind
                 ), 0) as available
            from kinds k
        ) x
    ),
    -- Paid out before anybody was asked which pot it came from.
    'unattributed', coalesce((
      select sum(coalesce(r.amount_approved, r.amount_requested))
        from public.fund_requests r
       where r.status = 'transferred' and r.funded_from is null
    ), 0),
    'received_total', coalesce((select sum(amount) from public.donations), 0),
    'paid_total', coalesce((
      select sum(coalesce(r.amount_approved, r.amount_requested))
        from public.fund_requests r where r.status = 'transferred'
    ), 0)
  ) else null end;
$$;
