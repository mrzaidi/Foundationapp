-- ===========================================================================
-- Seed: the four funds shown on the member dashboard.
-- Safe to re-run — every row is an upsert.
-- ===========================================================================

insert into public.fund_types
  (id, name, description, gradient, icon, document_label, document_required, min_amount, max_amount, sort_order)
values
  ('monthly',     'Monthly Fund',        'Recurring monthly support for registered families',
   'g-brand', 'calendar',  'Income / need proof (optional)',        false, 2000,  50000,  1),

  ('accidental',  'Accidental Fund',     'Emergency help after an accident or medical event',
   'g-rose',  'health',    'Medical report, prescription or hospital bill', true, 5000,  500000, 2),

  ('grocery',     'Grocery Fund',        'Ration and household grocery assistance',
   'g-amber', 'basket',    'Grocery estimate or shop bill',         false, 1000,  30000,  3),

  ('electricity', 'Electricity Bill Fund', 'Help clearing an outstanding electricity bill',
   'g-blue',  'bolt',      'Latest electricity bill',               true,  1000,  80000,  4)
on conflict (id) do update set
  name              = excluded.name,
  description       = excluded.description,
  gradient          = excluded.gradient,
  icon              = excluded.icon,
  document_label    = excluded.document_label,
  document_required = excluded.document_required,
  min_amount        = excluded.min_amount,
  max_amount        = excluded.max_amount,
  sort_order        = excluded.sort_order;

-- ---------------------------------------------------------------------------
-- Promote yourself to admin.
-- 1. Register through the app (or Supabase → Authentication → Add user).
-- 2. Run this with your email:
--
--   update public.profiles set role = 'admin' where email = 'you@example.com';
--
-- Then sign in and open /admin.
-- ---------------------------------------------------------------------------
