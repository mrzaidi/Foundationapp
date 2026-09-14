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
Run. That one file is all four sources concatenated in order, and it is
idempotent — safe to re-run after any change:

1. `supabase/migrations/0001_init.sql` — tables, triggers, row-level security
2. `supabase/migrations/0002_storage.sql` — the private `documents` bucket + policies
3. `supabase/seed.sql` — the four funds
4. `supabase/migrations/0003_urdu.sql` — Urdu fund copy

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

The CLI must be logged in on this machine (a logged-in browser is not enough):

```bash
npx vercel login
```

Then, from the `shf-foundation` folder:

```bash
npx vercel link --yes --scope team_AvF6vaz9eiFEb9K60ycS3VI5 --project shf-foundation
```

Add the three environment variables to the Vercel project (do the secret one
yourself so the key never lands in a shell history you share):

```bash
npx vercel env add NEXT_PUBLIC_SUPABASE_URL production
npx vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
npx vercel env add SUPABASE_SERVICE_ROLE_KEY production
```

Values:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://tkpgccgmpkmbynjwxgyw.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `sb_publishable_zTEHyIRoEiqZzM8xxmNf1g_Ba5Y7hrM` |
| `SUPABASE_SERVICE_ROLE_KEY` | your secret key — paste it at the prompt |

Repeat for `preview` and `development` if you want branch deploys to work.

Then ship it:

```bash
npx vercel deploy --prod
```

Finally, add the deployed URL to Supabase → **Authentication → URL
Configuration → Site URL / Redirect URLs**.

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
