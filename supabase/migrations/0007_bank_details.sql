-- ===========================================================================
-- Bank details on the profile.
--
-- The foundation transfers money; it needs somewhere to send it. Until now
-- that destination was collected off-system, which meant an approved
-- application could sit waiting on a phone call. These three columns make the
-- destination part of the member's record, and a trigger refuses to accept a
-- new application from a member who has not supplied one.
-- ===========================================================================

alter table public.profiles
  add column if not exists bank_name           text,
  add column if not exists bank_account_title  text,
  add column if not exists bank_account_number text;

comment on column public.profiles.bank_name is
  'Bank / microfinance bank / wallet, chosen from the list in src/lib/banks.ts.';
comment on column public.profiles.bank_account_title is
  'Account holder name, as printed on the account.';
comment on column public.profiles.bank_account_number is
  'IBAN (PK…, 24 chars) or plain account number. Stored uppercase, no spaces.';

-- Length floors only. The exact shape differs between an IBAN, a 14-digit
-- account number and an 11-digit wallet, so the app validates the shape and
-- the database refuses only what is obviously unusable.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_bank_account_number_len') then
    alter table public.profiles
      add constraint profiles_bank_account_number_len
      check (bank_account_number is null or char_length(bank_account_number) between 6 and 34);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'profiles_bank_account_title_len') then
    alter table public.profiles
      add constraint profiles_bank_account_title_len
      check (bank_account_title is null or char_length(btrim(bank_account_title)) >= 3);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- A member cannot apply without a payout destination.
--
-- This lives in Postgres rather than only in /api/requests so that the rule
-- holds for anything that talks to the database — the native app, a future
-- import script, or an admin acting on a member's behalf.
-- ---------------------------------------------------------------------------
create or replace function public.require_bank_details()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  p record;
begin
  select bank_name, bank_account_title, bank_account_number
    into p
    from public.profiles
   where id = new.user_id;

  -- `found`, not `p is null`: a real profile whose bank columns are all empty
  -- also yields an all-NULL record, and that is a different error entirely.
  if not found then
    raise exception 'No profile found for this account.'
      using errcode = 'check_violation';
  end if;

  if coalesce(btrim(p.bank_name), '') = ''
     or coalesce(btrim(p.bank_account_title), '') = ''
     or coalesce(btrim(p.bank_account_number), '') = '' then
    raise exception 'Add your bank details before applying for a fund.'
      using errcode = 'check_violation';
  end if;

  return new;
end $$;

drop trigger if exists trg_require_bank_details on public.fund_requests;
create trigger trg_require_bank_details
  before insert on public.fund_requests
  for each row execute function public.require_bank_details();
