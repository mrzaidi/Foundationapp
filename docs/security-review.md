# Security review — Mohammad Husnain Foundation

**Target:** https://foundationapp-eight.vercel.app (production)
**Date:** 4 October 2026
**Method:** two automated suites, re-runnable, run against the live site and the live database

```bash
node scripts/security-test.mjs https://foundationapp-eight.vercel.app
```

```bash
node scripts/security-test-members.mjs https://foundationapp-eight.vercel.app
```

**Result: 59 checks, 53 passed, 6 failed.** Every failure is on the perimeter —
hardening that is missing. **No access-control defect was found**, including
when the application is bypassed entirely and the database is called directly
as each kind of user.

---

## How this was tested

The suites create throwaway accounts — a member, an Application Manager, a Data
Manager, a Master Admin — exercise the system as each of them, and delete
everything they made. Each run ends by confirming no test rows were left behind.

Two angles were used for every question that mattered:

1. **Through the application** — real HTTP against production with a real
   signed-in session cookie, the way a logged-in user would be refused.
2. **Around the application** — PostgREST called directly with that user's own
   token. This is what an attacker does: the browser code is theirs to edit, so
   anything enforced only in the UI is not enforced at all. Here the answer has
   to come from the database's own row-level security.

An item below passed only if it was refused from **both** directions.

---

## What held

### Nobody unauthenticated gets in (11 checks)

Every admin page and every admin API refuses an anonymous visitor: `/admin`,
`/admin/requests`, `/admin/members`, `/admin/families`, `/admin/roles`,
`/admin/users`, and the stats, roles, donors and accounts endpoints. A forged
session cookie is rejected rather than trusted.

### A member is not an administrator (7 checks)

A signed-in member is refused by every admin endpoint, and cannot file an
application in somebody else's name.

### The database holds the line on its own (12 checks)

With the application bypassed and PostgREST called directly:

- a member cannot promote themselves to administrator
- an administrator cannot give themselves the master role
- a non-master cannot write capabilities, create roles, or change which stages
  a role sees
- a member reads **only their own** profile and **only their own** applications
- a member cannot read households, donors, donations, roles or capabilities at all

### Role capabilities actually bind (3 checks)

The Data Manager role holds `view_members`, `edit_members` and
`use_assistant_writes`. It is refused donors by the API, refused donors by the
database, and refused the roles API. Capabilities are not decoration.

### One member against another (3 checks)

A member cannot read, cannot approve, and cannot alter another member's
application — through the app or at the database.

### Documents (4 checks)

A member cannot list another member's document folder, cannot obtain a signed
URL for a document that is not theirs, cannot attach a file to somebody else's
application, and cannot write into another member's folder. A path that climbs
out of the folder (`../`) is refused.

### Money cannot be forged (2 checks)

A member cannot file a transfer receipt. An application cannot be approved
without naming the fund it comes from, and once approved the fund cannot be
changed — the rule you asked for at review time is enforced in the database,
not only in the screen.

### Creating administrators (2 checks)

A role without `create_admins` cannot create an administrator through the API,
and cannot insert one straight into `profiles` either.

### The assistant (1 check)

The assistant refuses donor questions when asked by a role that lacks
`view_donors`. It does not leak through the chat what the screens withhold.

### The monthly job (2 checks)

The cron endpoint refuses an unauthenticated call and refuses a wrong secret.

### Search terms are treated as text (6 checks)

`Khan, Ali`, `x) or (1=1`, `*` and a lone `%` are all searched for as written
and change nothing about the query. See the fixed issue below.

---

## Findings

All six are **medium**. None of them lets anybody see or change data they should
not; each one removes a layer of defence that should be there.

### 1–5. Five security headers are not sent

| Header | Missing | What it would prevent |
| --- | --- | --- |
| `content-security-policy` | yes | a script injected into a page running freely |
| `x-frame-options` | yes | the site being framed by another site to trick a click |
| `x-content-type-options` | yes | a browser guessing a file is script when it is not |
| `referrer-policy` | yes | member and application IDs leaking in the Referer header |
| `permissions-policy` | yes | an embedded page reaching for camera, microphone or location |

`strict-transport-security` **is** set, so traffic is already pinned to HTTPS.

**Fix:** a `headers()` block in `next.config.ts`. Roughly twenty lines, no
database change, no redeploy risk beyond the usual. CSP needs care — too strict
and the app's own scripts stop loading — so it is worth setting the other four
immediately and introducing CSP in report-only mode first.

### 6. Registration is not rate limited

Twelve rapid registration attempts against `/api/auth/register` produced no
`429`. Every one was rejected on its merits (`422`), so nothing invalid got in,
but there is no limit on how fast somebody may try.

**What this allows:** an automated script hammering the endpoint — filling the
table with junk signups, or testing whether a given email is already registered
by watching which error comes back.

**Fix:** a short per-IP limit on that route. Vercel's own rate limiting, or a
small in-memory window, is enough. This is the one finding I would do first, as
it is the only endpoint an anonymous stranger can call repeatedly.

---

## Two real defects found during this work — both fixed

These are recorded because they are the kind of thing the testing existed to
catch, and because both were live on production when found.

### `/admin/requests` had no authorization check at all (was: critical)

The page never called `requirePage`. Any signed-in administrator — including
Application Manager and Data Manager roles meant to see a narrow slice — could
read **every** fund application in the system. Confirmed against production
before the fix and confirmed closed after it. Fixed in commit `cc0f355`.

### Search boxes passed user text straight into PostgREST filter syntax (was: high)

A comma, a bracket or a quote typed into a search box ended the filter clause
early and the rest was read as more filter. `%` and `_` were live wildcards, so
a single `%` returned every row. Terms are now stripped of the characters that
are syntax and escaped where they are wildcards (`src/lib/search.ts`). The six
checks in section G cover this. Fixed in commit `084c58e`.

---

## One thing to decide, not a defect

The **Application Manager** role currently sees five stages — requested,
accepted, rejected, transferred and review — and holds `decide_requests`.

You asked for Application Manager 1 to see requested/review/approved and
Application Manager 2 to see approved only. The machinery is there and
enforced; the stages simply have not been ticked yet on the Roles screen. Until
they are, both managers see everything their capability allows. This is a
configuration step for you, not a code change.

---

## Summary

| Area | Checks | Result |
| --- | --- | --- |
| Unauthenticated access | 11 | pass |
| Member vs administrator | 7 | pass |
| Database-level access control | 12 | pass |
| Role capabilities | 3 | pass |
| Member vs member | 3 | pass |
| Documents | 4 | pass |
| Money and approvals | 2 | pass |
| Creating administrators | 2 | pass |
| Assistant | 1 | pass |
| Monthly job | 2 | pass |
| Search handling | 6 | pass |
| **Perimeter** | **7** | **1 pass, 6 fail** |
| **Total** | **59** | **53 pass, 6 fail** |

The access control is sound. What is missing is the outer layer: headers that
tell the browser what to refuse, and a limit on how fast a stranger may knock.
