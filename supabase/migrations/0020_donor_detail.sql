-- ===========================================================================
-- One donor, in full.
--
-- The donor table was carrying a list of every gift inside one of its cells,
-- with a receipt link and a remove button on each — a page of records trying
-- to be a page of detail at the same time, and doing neither well.
--
-- So the list goes back to being a list, and this answers the other question:
-- who is this person, what have they given, of which kind, and when. All of
-- it, not one month, because a donor's history is the thing a committee wants
-- when it opens their name.
-- ===========================================================================

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
        'email',          p.email,
        'city',           p.city,
        'country',        p.country,
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
