-- ===========================================================================
-- Households, as a section of their own.
--
-- A family was only reachable by opening the member who happened to be its
-- point of contact, buried at the bottom of that member's page. But the
-- household is what the committee actually weighs when it decides — how many
-- people live on that income, what the rent and the bills are — and there was
-- no way to see them all, or to find one by the name of the head of the
-- family.
--
-- So this answers "which households do we have, and which have we not written
-- down yet". Every member is a household whether or not anybody has recorded
-- it; a member with nothing on file is listed as not recorded rather than left
-- out, because the gap is the thing staff need to see.
--
-- The search runs on the head of the family, falling back to the name on the
-- underlying row where no head has been written down yet — which is how staff
-- say it out loud. It is a parameter, not a string pasted into a filter, so a
-- name with a comma or a bracket in it searches for exactly itself.
--
-- Nothing about the member comes back. Families and Members are separate
-- sections: the profile row is how a household is keyed, not something the
-- households screen reports on, so no name, email or mobile is returned here
-- for a screen that must not show them.
-- ===========================================================================

create or replace function public.families(
  p_query  text default '',
  p_limit  int  default 25,
  p_offset int  default 0
)
returns json
language sql
stable
security definer
set search_path = public
as $$
  with matched as (
    select
      p.id,
      -- The head of the family as recorded, and nothing else. It used to fall
      -- back to the name on the profile, which put a member's name on the
      -- households screen; a household nobody has written down yet simply has
      -- no head yet, and the list says so.
      nullif(btrim(f.head_name), '')                        as head,
      p.city,
      f.total_members,
      f.male_count,
      f.female_count,
      f.monthly_income,
      f.monthly_expense,
      f.house_type,
      f.updated_at,
      (f.user_id is not null)                               as recorded
      from public.profiles p
      left join public.family_details f on f.user_id = p.id
     where p.role = 'member'
       and (
         coalesce(p_query, '') = ''
         or f.head_name ilike '%' || p_query || '%'
         -- A household with no head written down yet is still findable, by the
         -- name on the row it is keyed to. That name is matched, never
         -- returned: it decides which rows come back, and the screen shows
         -- only what the foundation has actually recorded.
         or p.full_name ilike '%' || p_query || '%'
       )
  )
  select case when public.is_admin() then json_build_object(
    -- Both counts, because "12 of 40 households recorded" is the number the
    -- office wants, and a filtered list cannot show it on its own.
    'total',    (select count(*) from matched),
    'recorded', (select count(*) from matched where recorded),
    'rows', coalesce((
      select json_agg(row_to_json(t) order by t.recorded desc, t.head)
        from (
          select *
            from matched
           order by recorded desc, head
           limit  greatest(coalesce(p_limit, 25), 1)
          offset  greatest(coalesce(p_offset, 0), 0)
        ) t
    ), '[]'::json)
  ) else null end;
$$;

comment on function public.families(text, int, int) is
  'Every member as a household, recorded or not, searchable by head of family.';
