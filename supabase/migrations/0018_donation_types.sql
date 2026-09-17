-- ===========================================================================
-- What kind of giving a donation is.
--
-- These are not categories invented for a dropdown. Khums, Zakat, Zakat
-- al-Fitr, Sadaqah, Fidyah, Kaffarah and Nadhr are distinct obligations with
-- different rules about who may receive them and what they may be spent on. A
-- foundation that records only "PKR 5,000 arrived" cannot answer the question
-- its committee will eventually be asked — and cannot answer it later either,
-- because the information was never kept.
--
-- Everything already recorded becomes a general donation. That is the honest
-- default: it says the type was not captured rather than guessing at one, and
-- a guess here would be a guess about somebody's religious obligation.
-- ===========================================================================

alter table public.donations
  add column if not exists donation_type text not null default 'general';

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.donations'::regclass
       and conname  = 'donations_type_check'
  ) then
    alter table public.donations
      add constraint donations_type_check check (donation_type in (
        'khums', 'zakat', 'zakat_al_fitr', 'sadaqah',
        'fidyah', 'kaffarah', 'nadhr', 'general'
      ));
  end if;
end $$;

comment on column public.donations.donation_type is
  'Khums, Zakat, Zakat al-Fitr, Sadaqah, Fidyah, Kaffarah, Nadhr or general. '
  'Rows predating migration 0018 are general because the type was not captured.';

-- Reporting always groups by month and type together.
create index if not exists donations_month_type_idx
  on public.donations (month, donation_type);

-- ---------------------------------------------------------------------------
-- Donors for a month, with each gift's type alongside its amount.
--
-- Replaces the 0016 version, adding `donation_type` to each entry. Everything
-- else is unchanged: `given` is still the month's total for that donor, which
-- is what the fund is made of and what every other screen reads.
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
                   'id',            dn.id,
                   'amount',        dn.amount,
                   'received_on',   dn.received_on,
                   'donation_type', dn.donation_type,
                   'note',          dn.note
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
-- Giving by type.
--
-- Two shapes from one function, because the donor screen wants both: the split
-- for one month, and each type's line over the last several months.
--
-- Every type is returned whether or not it was given, so a month with no
-- Fidyah reports Fidyah as zero rather than leaving a gap the reader has to
-- interpret — and so a chart's colours do not move about between months.
-- ---------------------------------------------------------------------------
create or replace function public.donation_types(p_months int default 6)
returns json
language sql
stable
security definer
set search_path = public
as $$
  with kinds(donation_type) as (
    values ('khums'), ('zakat'), ('zakat_al_fitr'), ('sadaqah'),
           ('fidyah'), ('kaffarah'), ('nadhr'), ('general')
  ),
  span as (
    select generate_series(
             date_trunc('month', current_date)
               - ((greatest(p_months, 1) - 1) || ' months')::interval,
             date_trunc('month', current_date),
             interval '1 month'
           )::date as month
  )
  select case when public.is_admin() then json_build_object(
    -- This month, split by type.
    'month', (select date_trunc('month', current_date)::date),
    'totals', (
      select json_agg(x order by x.total desc, x.donation_type)
        from (
          select k.donation_type,
                 coalesce((
                   select sum(dn.amount) from public.donations dn
                    where dn.donation_type = k.donation_type
                      and dn.month = date_trunc('month', current_date)::date
                 ), 0) as total,
                 coalesce((
                   select count(*) from public.donations dn
                    where dn.donation_type = k.donation_type
                      and dn.month = date_trunc('month', current_date)::date
                 ), 0) as gifts
            from kinds k
        ) x
    ),
    -- And each month in the window, split the same way.
    'months', (
      select json_agg(m order by m.month)
        from (
          select s.month,
                 (select json_object_agg(k.donation_type, coalesce((
                    select sum(dn.amount) from public.donations dn
                     where dn.donation_type = k.donation_type
                       and dn.month = s.month
                  ), 0))
                    from kinds k) as by_type,
                 coalesce((
                   select sum(dn.amount) from public.donations dn where dn.month = s.month
                 ), 0) as total
            from span s
        ) m
    )
  ) else null end;
$$;
