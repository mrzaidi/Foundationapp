-- ===========================================================================
-- A household is its own record.
--
-- family_details was keyed on a member: one household per registered profile,
-- and no way to write one down for anybody else. But the office meets families
-- who have not registered and may never register — somebody brought in by a
-- relative, a widow whose son holds the phone — and the household still has to
-- be recorded, assessed and kept.
--
-- So a family stands on its own now, identified by the head of the family
-- rather than by whoever happened to sign up. One can be added at any time,
-- from the households screen, with nothing else in place first.
--
-- family_details is left alone rather than dropped: it is empty, and an empty
-- table costs nothing next to the risk of removing one in the same breath as
-- adding its replacement. Drop it once you are satisfied nothing wants it:
--     drop table if exists public.family_details;
-- ===========================================================================

create table if not exists public.families (
  id                  uuid primary key default gen_random_uuid(),

  -- The one thing a household cannot be without: somebody to call it after.
  head_name           text not null check (char_length(btrim(head_name)) >= 2),

  father_name         text,
  father_mobile       text,
  father_status       text check (father_status in ('alive', 'deceased')),
  address             text,
  city                text,
  -- A number for the household itself, since there may be no member account
  -- behind it to carry one.
  contact             text,

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

  created_by          uuid references public.profiles (id),
  updated_by          uuid references public.profiles (id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table public.families is
  'A household, standing on its own. Recorded by staff; no member account required.';

-- The list is searched by head of the family and read newest-first.
create index if not exists families_head_idx on public.families (lower(head_name));
create index if not exists families_created_idx on public.families (created_at desc);

drop trigger if exists families_touch on public.families;
create trigger families_touch before update on public.families
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Staff only, in both directions. A household holds what a family earns, what
-- it owes and who lives in it; no member has any business reading one, their
-- own included, which is why there is no "own row" policy here at all.
-- ---------------------------------------------------------------------------
alter table public.families enable row level security;

drop policy if exists "families admin" on public.families;
create policy "families admin" on public.families
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- The households function from 0022 counted members and is now meaningless:
-- the list reads the table directly, because a plain table needs no function
-- to be searched one column at a time.
-- ---------------------------------------------------------------------------
drop function if exists public.families(text, int, int);
