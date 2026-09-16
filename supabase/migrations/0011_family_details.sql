-- ===========================================================================
-- Family details — the household behind an application.
--
-- Registration captures the person; this captures the circumstances the
-- committee is actually deciding on: who depends on them, what comes in, what
-- goes out. It is filled in by staff, usually at the office with the family in
-- front of them, not by the member on their phone.
--
-- Admin-only in both directions. A member cannot read or write their own row —
-- these are caseworker notes about a household, including whether a father is
-- alive, and the foundation should be able to record them frankly.
-- ===========================================================================

create table if not exists public.family_details (
  -- One household per member, so the profile id is the key.
  user_id             uuid primary key references public.profiles (id) on delete cascade,

  head_name           text,
  father_name         text,
  father_mobile       text,
  father_status       text check (father_status in ('alive', 'deceased')),
  address             text,

  total_members       int check (total_members between 0 and 60),
  male_count          int check (male_count between 0 and 60),
  female_count        int check (female_count between 0 and 60),

  /*
   * The household roll, as [{ name, age, relation }].
   *
   * A table would be more relational, but this is edited as one form: the
   * member count drives how many rows appear and the whole household is saved
   * in a single write. JSONB keeps that atomic — no orphan rows when a count
   * shrinks, no half-saved family.
   */
  members             jsonb not null default '[]'::jsonb,

  -- labour | business | job | pension | other — several can be true at once.
  income_sources      text[] not null default '{}',
  income_source_other text,

  monthly_income      numeric(12,2) check (monthly_income >= 0),
  monthly_expense     numeric(12,2) check (monthly_expense >= 0),
  house_type          text check (house_type in ('own', 'rent')),
  has_bank_account    boolean,

  bill_ke             numeric(12,2) check (bill_ke >= 0),          -- electricity, monthly
  rent                numeric(12,2) check (rent >= 0),
  education_expense   numeric(12,2) check (education_expense >= 0),
  medical_expense     numeric(12,2) check (medical_expense >= 0),

  fund_reason         text,

  updated_by          uuid references public.profiles (id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table public.family_details is
  'Household circumstances, recorded by staff. Never member-writable.';
comment on column public.family_details.members is
  'Array of { name, age, relation }; length follows total_members.';

drop trigger if exists family_details_touch on public.family_details;
create trigger family_details_touch before update on public.family_details
  for each row execute function public.touch_updated_at();

alter table public.family_details enable row level security;

drop policy if exists "family admin" on public.family_details;
create policy "family admin" on public.family_details
  for all using (public.is_admin()) with check (public.is_admin());
