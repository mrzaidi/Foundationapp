-- ===========================================================================
-- Not every household earns in rupees.
--
-- Two of the twenty-seven intake forms answered in pounds — £5000 a month in,
-- £4000 out, £1750 rent. The importer refused them rather than write 5000 into
-- a rupee column, which was right, but it left two families looking like they
-- had told us nothing.
--
-- So a household says which currency its figures are in. Everything already on
-- file is in rupees and stays that way; only the households that answered in
-- something else are anything but PKR.
--
-- Nothing sums across currencies. A household's own figures are in one
-- currency, and any screen adding households together has to say which — which
-- is why this is on the household rather than on each amount.
-- ===========================================================================

alter table public.families
  add column if not exists currency text not null default 'PKR';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'families_currency_check') then
    alter table public.families
      add constraint families_currency_check
      check (currency in ('PKR', 'USD', 'GBP', 'EUR', 'SAR', 'AED', 'CAD', 'AUD'));
  end if;
end $$;

comment on column public.families.currency is
  'The currency every money figure on this household is in. Defaults to PKR.';
