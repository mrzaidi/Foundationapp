# Subaidar Hasnain Foundation

One Next.js app that serves three things:

| Surface | Route | Who uses it |
|---|---|---|
| **Member app** (installable PWA) | `/`, `/requests`, `/profile`, `/help` | Families applying for help |
| **Admin portal** | `/admin/**` | Foundation staff |
| **APIs** | `/api/**` | Both of the above |

Backed by **Supabase** — Postgres, auth, and a private bucket for CNICs, medical
reports and utility bills. Deployed on **Vercel**.

Bilingual: **English and اردو**, with full right-to-left layout. The language is
a cookie, so it survives across devices sessions and applies to server-rendered
pages too.

---

## 1. Set up Supabase

Project: `tkpgccgmpkmbynjwxgyw`

In the Supabase dashboard → **SQL Editor**, paste **`supabase/SETUP.sql`** and hit
Run. That one file is every source concatenated in order, and it is
idempotent — safe to re-run after any change:

1. `0001_init.sql` — tables, triggers, row-level security
2. `0002_storage.sql` — the private `documents` bucket + policies
3. `seed.sql` — the funds
4. `0003_urdu.sql` — Urdu fund copy
5. `0004_fix_admin_bootstrap.sql` — lets the first admin be created
6. `0005_stats_counts.sql` — dashboard account counts
7. `0006_school_fees_and_budget.sql` — School Fees fund + monthly budgets
8. `0007_bank_details.sql` — payout account on the profile + the apply guard
9. `0008_transfer_receipts.sql` — lets an admin file a receipt into a member's case
10. `0009_recurring_monthly.sql` — standing monthly arrangements + the nightly job
11. `0010_donors.sql` — donors, donations, and the month's fund
12. `0011_family_details.sql` — the household behind an application
13. `0012_donors_are_members.sql` — donors are members; the fund is donations only

Edit those sources, never `SETUP.sql`. Regenerate it with:

```bash
node supabase/build-setup.mjs
```

Then **Authentication → Providers → Email**: make sure Email is enabled.
Confirmation emails are not needed — `/api/auth/register` creates users
pre-confirmed, because members register at the foundation office.

### Make yourself an admin

Register through the app first, then run:

```sql
update public.profiles set role = 'admin' where email = 'you@example.com';
```

Sign in again and `/admin` opens.

---

## 2. Run it locally

```bash
npm install
```

`.env.local` already has the project URL and the publishable key. Add the
**secret key** yourself — Supabase dashboard → Project Settings → API Keys →
`service_role` / secret:

```
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...
```

Registration will not work without it; everything else will.

```bash
npm run dev
```

Opens on http://localhost:5195.

---

## 3. Deploy to Vercel

One command, once a token is in place.

1. Create a token at **vercel.com/account/tokens** (scope: your team).
2. Add it to `.env.local`:

   ```
   VERCEL_TOKEN=...
   ```

3. Ship it:

   ```bash
   npm run deploy            # production
   npm run deploy:preview    # preview build
   ```

The script links the project to `team_AvF6vaz9eiFEb9K60ycS3VI5`, syncs
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and
`SUPABASE_SERVICE_ROLE_KEY` to all three Vercel environments, deploys, and
prints the URL. Secrets are piped from `.env.local` — never typed on a command
line, never left in shell history. Re-running is safe.

Afterwards add the deployed URL to Supabase → **Authentication → URL
Configuration → Site URL / Redirect URLs**, or sign-in redirects will fail.

---

## Architecture

```
src/
  app/
    (auth)/login, register     phone-shell screens, no bottom nav
    (member)/                  dashboard, requests, profile, help
    admin/                     desktop portal — dashboard, applications, members, funds
    api/                       route handlers (see below)
  components/                  shared UI — all styling lives in app/globals.css
  lib/
    supabase/{client,server,admin}.ts
    i18n/{en,ur,index,server}.ts
    format.ts, funds.ts, types.ts
  middleware.ts                session refresh + route guards
supabase/                      migrations + seed
preview/                       design review & clickable prototype (build script)
```

### API

| Method | Route | Notes |
|---|---|---|
| `POST` | `/api/auth/register` | Creates the auth user + profile (service role) |
| `GET` | `/api/me` | Signed-in member's profile |
| `PATCH` | `/api/me` | Update editable profile fields |
| `GET` | `/api/requests` | List (own; `?scope=all` for admins) |
| `POST` | `/api/requests` | Submit an application |
| `GET` | `/api/requests/:id` | Detail with timeline + attachments |
| `PATCH` | `/api/requests/:id` | Admin: change status, approved amount, note |
| `POST` | `/api/requests/:id/attachments` | Record uploaded files against a request |
| `GET` | `/api/documents?path=` | Short-lived signed URL for a private document |
| `GET` | `/api/admin/stats` | Dashboard aggregates |
| `GET/PATCH` | `/api/admin/members` | List members; change role / block |
| `GET` | `/api/admin/analytics` | Rows behind the dashboard charts |
| `GET/PUT` | `/api/admin/budget` | Read / set the monthly budget |

### Security model

Authorisation lives in Postgres, not just in the API:

- **RLS on every table.** A member can only select their own profile, requests,
  attachments and events. Admins are recognised by a `security definer`
  `is_admin()` function, so policies never recurse.
- **Only admins can update `fund_requests`.** A member's insert policy also
  forces `status = 'requested'`, so nobody can self-approve.
- **A trigger guards privilege escalation** — a member editing their own profile
  cannot change `role` or `is_blocked`, even by calling the database directly.
- **Storage paths are namespaced by user id** (`<uid>/requests/<request>/file`),
  and the bucket policy checks the first path segment. Admins get a separate
  read policy so they can open any document.
- **Documents are never linked directly** — the app mints a 10-minute signed URL
  on click.
- **The service-role key is server-only**, used by `/api/auth/register` and
  nothing else.

### Status pipeline

`requested → review → accepted → transferred`, plus a terminal `rejected`.
Every change is written to `request_events` by a trigger, so the member's
progress history and the admin's audit trail are the same rows and cannot drift.

### Family details

Registration captures the person; family details capture the circumstances the
committee is actually deciding on — who depends on the member, what comes in,
what goes out, and why the fund is needed. Staff fill it in, usually at the
office with the family in front of them.

Admin-only in both directions: a member can neither read nor write their own
row. These are caseworker notes about a household, including whether a father
is alive, and the foundation should be able to record them frankly.

The household roll is a JSONB array rather than a table. It is edited as one
form — the member count drives how many rows appear and the whole household
saves in a single write — so keeping it in one column keeps that atomic: no
orphan rows when a count shrinks, no half-saved family. Lowering the count
never discards a row someone has already filled in; only trailing blanks go.

### Standing monthly support

Approving an application for a fund marked `is_recurring` (the Monthly Fund)
enrols the member. On the 1st of each month the next application is filed for
them, arriving at `requested` — the committee still decides every month, and
every decision stays on the record.

The work is one idempotent Postgres function, `generate_recurring_requests()`:
an arrangement that already has an application this month is skipped, so a
missed night is caught up rather than lost and a double run cannot double-apply.
Months are Pakistan months. It is driven by pg_cron where the project has it,
and otherwise by a Vercel cron hitting `/api/cron/monthly` (set `CRON_SECRET`;
without it that route refuses rather than running open). Both may run; it does
not matter.

Staff can stop, resume or re-price an arrangement from the application or the
member record. A blocked member, or one whose payout account has been cleared,
is skipped rather than failed — one bad row must not stop the month.

### Transfer receipts

Marking an application transferred takes an optional receipt. It is filed into
the **member's** case file — stored under their storage folder, recorded against
their user id — so it appears on their own application screen as proof of
payment, with no new read policy. 0008 opens only the write side: an admin may
write into any member's folder and record an attachment against any request.

The upload runs *before* the status changes. If it fails the application stays
where it was, which beats a request marked transferred with its evidence missing
and nothing on screen to say so. Only staff can file one — a member
manufacturing their own proof of transfer would be worse than no receipt at all.

### Bank details

The foundation transfers money, so every member has a payout account: bank
(chosen from `src/lib/banks.ts` — every SBP-licensed bank, the microfinance
banks, and the mobile wallets many families actually use), IBAN or account
number, and account holder name.

It is collected at registration, and existing members are asked for it the
first time they apply — the apply sheet opens on a bank step instead of the
form, saves through `PATCH /api/me`, and carries on where it left off.

The rule is enforced in three places, narrowest last: the form validates the
IBAN with the ISO 13616 mod-97 checksum, `POST /api/requests` answers 422 with
a sentence the app can show, and a `before insert` trigger on
`fund_requests` refuses the row outright — so it holds for the native app and
anything else that reaches the database.

Admins see the account on both the application and the member record, which is
what they need in hand to make the transfer.

### The month's fund

Donors are registered members, chosen from the roll rather than typed in:
free text let the same person in twice under two spellings and tied their
giving to no account.

A month's fund is the donations recorded against it, and remaining is that
minus the transfers. Both are derived from the rows themselves, so neither can
drift. The fund cannot be set by hand — a figure somebody typed was a promise,
and the committee was spending against it. `PUT /api/admin/budget` answers 410
rather than 404 so an old client is told why.

A pledge is what a donor said they would give; a donation is what arrived.
Only the donation counts.

### Funds are data

The dashboard reads `fund_types`. Adding a fifth fund is an insert — name,
Urdu name, description, gradient class, icon, min/max, and whether a document is
required. No deploy needed.

---

## Bilingual

- Dictionaries: `src/lib/i18n/en.ts` and `ur.ts`. `ur.ts` is typed as
  `typeof en`, so a missing key is a compile error.
- Fund names/descriptions live in the database (`name_ur`, `description_ur`,
  `document_label_ur`).
- The language cookie (`shf_locale`) is read by the root layout, which sets
  `lang` and `dir` on `<html>`. RTL overrides are at the bottom of `globals.css`.
- Urdu renders in Noto Nastaliq Urdu; amounts, references and dates stay Latin
  and LTR inside Urdu text (`.num`, `.ref` isolate them).
- The admin portal is English only — staff-facing. The dictionaries are there if
  you want to translate it later.

---

## Loading state

Every route's `loading.tsx` on both portals renders one centred Lottie mark.
The animation is generated from the app's own brand colours rather than
downloaded:

```bash
node scripts/build-lottie.mjs
```

It writes `src/lib/loading-animation.json`, which is imported and bundled — a
loader that waits on the network shows nothing for exactly as long as it
matters. The engine itself is a lazy chunk, with a CSS ring standing in until
it arrives, and lottie-react declines to autoplay under
`prefers-reduced-motion`.

## Design previews

```bash
node preview/build-preview.mjs
```

Rebuilds two self-contained HTML pages from the app's own stylesheet and
dictionaries — no server, no network:

- `preview/design-review.html` — annotated walk-through of every screen
- `preview/prototype.html` — clickable prototype with the EN/اردو switch

---

## Before launch

- [ ] Replace the helpline and email in `src/app/(member)/help/page.tsx`
- [ ] Swap `public/img/logo.svg` for the foundation's real mark
- [ ] Add raster PWA icons (192/512 px) to `public/icons/` and list them in
      `public/manifest.webmanifest` — SVG-only icons install on Android but not iOS
- [ ] Decide the retention policy for CNIC images and set it in Supabase
- [ ] Turn on Supabase database backups
"# Foundationapp" 
