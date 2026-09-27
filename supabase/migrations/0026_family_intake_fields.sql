-- ===========================================================================
-- The fields the paper form asks for that the table did not have.
--
-- The household form the office has been collecting on Google Forms carries
-- more than 0023 anticipated: how many of the household are children, the
-- bank the family actually uses, a mobile wallet where there is no account,
-- and who verified the form and when.
--
-- It also carries answers no numeric column can hold. Twenty-two of the
-- twenty-seven income figures are not numbers — "Under 50000", "500k+",
-- "Above 0.3million", "£5000", "پنشن 30/40۔ دکان کی امدنی 50/60". A committee
-- decides who gets money from these figures, so a guess dressed as a number is
-- worse than no number: `source_row` keeps the form's own answer beside the
-- parsed one, and `intake_notes` names the fields nobody could parse, so the
-- gaps are visible on the screen rather than buried.
-- ===========================================================================

-- How the household is made up. male_count and female_count are the adults;
-- the form counts children separately and so does this.
alter table public.families add column if not exists children_count int
  check (children_count between 0 and 40);

comment on column public.families.children_count is
  'Children in the household. male_count and female_count are the adults.';

-- Where the money would be sent. The form takes these as free text and they
-- arrive as free text — "IBAN PK07HABB…", "A/c NO:Pk04 NBP …Mohni Bazar Br",
-- account numbers with dashes and spaces. Normalising them here would be
-- guessing at somebody's bank details.
alter table public.families add column if not exists bank_name           text;
alter table public.families add column if not exists bank_account_title  text;
alter table public.families add column if not exists bank_account_number text;
alter table public.families add column if not exists wallet_number       text;

comment on column public.families.bank_account_number is
  'As written on the form. Never normalised: it is somebody''s account.';
comment on column public.families.wallet_number is
  'Easypaisa or JazzCash, for households with no bank account.';

-- Anything the family added about where they live, beyond own or rented.
alter table public.families add column if not exists housing_note text;

-- Who took the form down, and when. A household assessment that nobody signed
-- is worth less than one that somebody did.
alter table public.families add column if not exists verified_by text;
alter table public.families add column if not exists verified_on date;
alter table public.families add column if not exists submitted_at timestamptz;

comment on column public.families.verified_by is
  'The person who confirmed this household''s details in person.';

-- ---------------------------------------------------------------------------
-- What the form actually said
--
-- Every answer as submitted, keyed by the form's own question. Nothing that
-- was collected is lost to a parser, and any figure on the screen can be
-- checked against what the family said.
-- ---------------------------------------------------------------------------
alter table public.families add column if not exists source_row jsonb;

comment on column public.families.source_row is
  'The intake form response verbatim, for auditing anything parsed out of it.';

-- The fields that could not be read as numbers, named in plain words so staff
-- see the gap on the record rather than an empty box they assume is a zero.
alter table public.families add column if not exists intake_notes text;

comment on column public.families.intake_notes is
  'Which answers could not be parsed, and what the family actually wrote.';
