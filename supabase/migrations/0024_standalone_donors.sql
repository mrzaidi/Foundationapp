-- ===========================================================================
-- A donor is a donor, not a member who happens to give.
--
-- 0012 made a donor a registered member, chosen from the roll, to stop the
-- same person being typed in twice under two spellings. That fixed the
-- duplicates and created a different problem: the people who fund this
-- foundation are largely not the people it helps. A benefactor abroad, a
-- shopkeeper down the road, a family trust — none of them want a member
-- account, and none of them should have to hold one to give.
--
-- So a donor stands on its own again, with its own name, contact, email and
-- city, and the office adds one directly. `name` is no longer a fallback for
-- a missing profile; it is the donor's name.
--
-- user_id stays, nullable, for the donors already linked to a member. Nothing
-- new sets it. The unique index still stops one member being added twice, and
-- the reads below prefer the profile where there is one so those rows keep
-- reading exactly as they do today.
-- ===========================================================================

alter table public.donors add column if not exists email   text;
alter table public.donors add column if not exists city    text;
alter table public.donors add column if not exists address text;

comment on column public.donors.name is
  'The donor''s name. Where a member is linked, their profile name wins.';
comment on column public.donors.user_id is
  'A linked member, for donors added before 0024. Nothing new sets it.';

-- The list is searched and sorted by name.
create index if not exists donors_name_idx on public.donors (lower(name));

-- ---------------------------------------------------------------------------
-- One donor, in full — now readable without a profile behind it.
--
-- Every field that came only from the member falls back to the donor's own
-- column. Age and gender have no equivalent and are simply not asked of a
-- donor: the foundation wants to thank them and send them a receipt, not
-- assess them.
-- ---------------------------------------------------------------------------
create or replace function public.donor_detail(p_donor uuid)
returns json
language sql
stable
security definer
set search_path = public
as $$
  select case when public.is_admin() then (
    select json_build_object(
      'donor', json_build_object(
        'id',             d.id,
        'name',           coalesce(p.full_name, d.name),
        'contact',        coalesce(p.mobile, d.contact),
        'email',          coalesce(p.email, d.email),
        'city',           coalesce(p.city, d.city),
        'country',        p.country,
        'address',        d.address,
        'age',            p.age,
        'gender',         p.gender,
        'monthly_pledge', d.monthly_pledge,
        'is_active',      d.is_active,
        'note',           d.note,
        'user_id',        p.id,
        'since',          d.created_at
      ),

      -- Every gift, newest first. A donor's record is not a month.
      'donations', coalesce((
        select json_agg(json_build_object(
                 'id',            dn.id,
                 'amount',        dn.amount,
                 'donation_type', dn.donation_type,
                 'received_on',   dn.received_on,
                 'month',         dn.month,
                 'note',          dn.note
               ) order by dn.received_on desc, dn.created_at desc)
          from public.donations dn where dn.donor_id = d.id
      ), '[]'::json),

      -- Twelve months, including the empty ones: a gap in giving is itself
      -- worth seeing, and a chart that silently skips them hides it.
      'months', coalesce((
        select json_agg(json_build_object('month', g.month::date, 'total', coalesce((
                 select sum(dn.amount) from public.donations dn
                  where dn.donor_id = d.id and dn.month = g.month::date
               ), 0)) order by g.month)
          from generate_series(
                 date_trunc('month', current_date) - interval '11 months',
                 date_trunc('month', current_date),
                 interval '1 month'
               ) as g(month)
      ), '[]'::json),

      -- What they have given in total, and what of each kind.
      'totals', json_build_object(
        'all_time', coalesce((select sum(amount) from public.donations where donor_id = d.id), 0),
        'gifts',    coalesce((select count(*) from public.donations where donor_id = d.id), 0),
        'by_type',  coalesce((
          select json_agg(json_build_object('kind', t.donation_type, 'total', t.total)
                          order by t.total desc)
            from (
              select dn.donation_type, sum(dn.amount) as total
                from public.donations dn
               where dn.donor_id = d.id
               group by dn.donation_type
            ) t
        ), '[]'::json)
      )
    )
    from public.donors d
    left join public.profiles p on p.id = d.user_id
    where d.id = p_donor
  ) else null end;
$$;


-- ---------------------------------------------------------------------------
-- The donor list for a month.
--
-- Taken from 0018 unchanged but for one line: `email` now falls back to the
-- donor's own column, so an unlinked donor shows the address the office has
-- for them instead of a blank. The name and contact already fell back this
-- way, which is why they needed nothing.
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
             coalesce(p.email, d.email)    as email,
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
