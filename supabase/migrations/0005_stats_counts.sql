-- ===========================================================================
-- Fix: the dashboard reported "0 registered members" while accounts existed.
--
-- admin_stats() counted only profiles with role = 'member', so any account
-- promoted to admin vanished from the count. A foundation administrator is
-- still a registered account, and staff are a handful of rows — the number
-- people want on the dashboard is "how many accounts exist".
--
-- `members` now counts every profile; `admins` is broken out separately so the
-- split is still visible if it is ever needed.
-- ===========================================================================

create or replace function public.admin_stats()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select case when public.is_admin() then json_build_object(
    'members',           (select count(*) from public.profiles),
    'admins',            (select count(*) from public.profiles where role = 'admin'),
    'requested',         (select count(*) from public.fund_requests where status = 'requested'),
    'review',            (select count(*) from public.fund_requests where status = 'review'),
    'accepted',          (select count(*) from public.fund_requests where status = 'accepted'),
    'transferred',       (select count(*) from public.fund_requests where status = 'transferred'),
    'rejected',          (select count(*) from public.fund_requests where status = 'rejected'),
    'total_requested',   (select coalesce(sum(amount_requested), 0) from public.fund_requests),
    'total_disbursed',   (select coalesce(sum(coalesce(amount_approved, amount_requested)), 0)
                          from public.fund_requests where status = 'transferred'),
    'by_fund',           (select coalesce(json_agg(t), '[]'::json) from (
                            select ft.id, ft.name, count(r.id) as count,
                                   coalesce(sum(r.amount_requested), 0) as amount
                            from public.fund_types ft
                            left join public.fund_requests r on r.fund_type_id = ft.id
                            group by ft.id, ft.name, ft.sort_order
                            order by ft.sort_order
                          ) t)
  ) else null end;
$$;
