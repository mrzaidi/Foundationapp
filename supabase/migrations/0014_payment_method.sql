-- ===========================================================================
-- How the money actually left: cash in hand, or a bank transfer.
--
-- The transfer reference already recorded *which* transfer it was, but not
-- how it was made — and a receipt handed to a member has to say. Cash has no
-- bank reference to quote, which is exactly why the two need telling apart.
--
-- Nullable: every transfer made before today was recorded without it, and
-- guessing retrospectively would put a false statement on a receipt. Those
-- print as "—" until somebody who knows sets them.
-- ===========================================================================

alter table public.fund_requests
  add column if not exists payment_method text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'fund_requests_payment_method_check'
  ) then
    alter table public.fund_requests
      add constraint fund_requests_payment_method_check
      check (payment_method is null or payment_method in ('cash', 'bank'));
  end if;
end $$;

comment on column public.fund_requests.payment_method is
  'How a transferred grant was paid: cash or bank. Null for transfers recorded before this was asked for.';
