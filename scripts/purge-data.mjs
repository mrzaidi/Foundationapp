#!/usr/bin/env node
/**
 * Empty the foundation's records, keeping the funds and the administrators.
 *
 *   node scripts/purge-data.mjs                     # shows what it would do, changes nothing
 *   node scripts/purge-data.mjs --confirm <ref>     # actually does it
 *
 * <ref> is the Supabase project reference from NEXT_PUBLIC_SUPABASE_URL — the
 * part before `.supabase.co`. Typing it out is the point: it is what stops this
 * being run against the wrong project by a stale terminal.
 *
 * KEPT
 *   fund_types            the funds themselves — Monthly, Accidental, Grocery…
 *   profiles (role=admin) every administrator, and their sign-in
 *   every table, policy, function and trigger
 *
 * REMOVED
 *   fund_requests, request_events, request_attachments
 *   donors, donations
 *   family_details
 *   recurring_grants
 *   monthly_budgets
 *   every member profile, and their sign-in
 *   every file in the `documents` bucket belonging to a member
 *
 * THERE IS NO UNDO. Take a backup first:
 *   Supabase → Database → Backups, or `supabase db dump -f before-purge.sql`
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/* ---------------------------------------------------------------------------
 * Accounts to spare beyond the administrators.
 *
 * Put an email here to keep a member account through the purge — a QA login,
 * a demo member, anything whose id other things are pinned to. The dry run
 * prints every member it is about to remove, so read that list before you
 * confirm and add anything you need back.
 * ------------------------------------------------------------------------- */
const KEEP_EMAILS = [
  // The QA login. It is a member, so a purge would take it with the rest and
  // the regression suite would have nothing to sign in as. Remove this line
  // only if you mean to lose it.
  'qa-test@shf-foundation.test',
];

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

// ---------------------------------------------------------------------- setup
function env() {
  let raw;
  try {
    raw = readFileSync(resolve(ROOT, '.env.local'), 'utf8');
  } catch {
    die('Could not read .env.local — run this from the project, with the file in place.');
  }
  const vars = Object.fromEntries(
    raw
      .split(/\r?\n/)
      .filter((l) => l && !l.startsWith('#') && l.includes('='))
      .map((l) => {
        const i = l.indexOf('=');
        return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
      })
  );
  if (!vars.NEXT_PUBLIC_SUPABASE_URL) die('NEXT_PUBLIC_SUPABASE_URL is not set in .env.local');
  if (!vars.SUPABASE_SERVICE_ROLE_KEY)
    die('SUPABASE_SERVICE_ROLE_KEY is not set in .env.local — this script needs it.');
  return vars;
}

const die = (msg) => {
  console.error(`\n  ${msg}\n`);
  process.exit(1);
};

const vars = env();
const PROJECT_REF = new URL(vars.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0];
const db = createClient(vars.NEXT_PUBLIC_SUPABASE_URL, vars.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const args = process.argv.slice(2);
const confirmAt = args.indexOf('--confirm');
const WET = confirmAt !== -1;
const GIVEN_REF = WET ? args[confirmAt + 1] : null;

/*
 * Children before parents.
 *
 * Most of these would cascade from profiles anyway, but naming each one means
 * the script says what it removed rather than reporting one deleted profile
 * and silently taking eleven other rows with it.
 */
const TABLES = [
  { name: 'request_attachments', key: 'id' },
  { name: 'request_events', key: 'id' },
  { name: 'fund_requests', key: 'id' },
  { name: 'donations', key: 'id' },
  { name: 'donors', key: 'id' },
  { name: 'recurring_grants', key: 'id' },
  { name: 'family_details', key: 'user_id' }, // keyed on the member, not an id
  { name: 'monthly_budgets', key: 'month' }, // keyed on the month
];

const count = async (table, filter) => {
  let q = db.from(table).select('*', { count: 'exact', head: true });
  if (filter) q = filter(q);
  const { count: n, error } = await q;
  if (error) return { n: 0, missing: true };
  return { n: n ?? 0, missing: false };
};

/** Every object under a prefix, walked depth-first. */
async function listFiles(prefix, found = []) {
  const { data, error } = await db.storage
    .from('documents')
    .list(prefix, { limit: 1000, sortBy: { column: 'name', order: 'asc' } });
  if (error || !data) return found;

  for (const entry of data) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    // A folder comes back with no id; a file has one.
    if (entry.id === null) await listFiles(path, found);
    else found.push(path);
  }
  return found;
}

// ----------------------------------------------------------------------- main
console.log(`\n  Foundation data purge`);
console.log(`  project   ${PROJECT_REF}`);
console.log(`  mode      ${WET ? 'DELETE — this will change the database' : 'dry run (nothing will change)'}\n`);

const { data: people, error: peopleError } = await db
  .from('profiles')
  .select('id, full_name, email, role')
  .order('role', { ascending: true });

if (peopleError) die(`Could not read profiles: ${peopleError.message}`);

const admins = people.filter((p) => p.role === 'admin');
const spared = people.filter((p) => p.role !== 'admin' && KEEP_EMAILS.includes(p.email ?? ''));
const doomed = people.filter(
  (p) => p.role !== 'admin' && !KEEP_EMAILS.includes(p.email ?? '')
);
const keepIds = new Set([...admins, ...spared].map((p) => p.id));

console.log('  KEPT');
const { n: fundCount } = await count('fund_types');
console.log(`    fund_types                  ${String(fundCount).padStart(5)}  (the lookup)`);
console.log(`    administrators              ${String(admins.length).padStart(5)}`);
for (const a of admins) console.log(`        ${a.email}  —  ${a.full_name}`);
if (spared.length) {
  console.log(`    members spared by KEEP_EMAILS ${String(spared.length).padStart(3)}`);
  for (const s of spared) console.log(`        ${s.email}  —  ${s.full_name}`);
}

console.log('\n  REMOVED');
let rowTotal = 0;
for (const { name } of TABLES) {
  const { n, missing } = await count(name);
  if (missing) {
    console.log(`    ${name.padEnd(28)}    —  (no such table here)`);
    continue;
  }
  rowTotal += n;
  console.log(`    ${name.padEnd(28)}${String(n).padStart(5)}`);
}
console.log(`    member profiles             ${String(doomed.length).padStart(5)}`);
rowTotal += doomed.length;

const files = await listFiles('');
const doomedFiles = files.filter((p) => !keepIds.has(p.split('/')[0]));
console.log(`    files in documents bucket   ${String(doomedFiles.length).padStart(5)}`);

if (doomed.length) {
  console.log('\n  These member accounts and their sign-ins will be removed:');
  for (const p of doomed) console.log(`        ${(p.email ?? '(no email)').padEnd(38)} ${p.full_name ?? ''}`);
  console.log('\n  Anything on that list you need to keep goes in KEEP_EMAILS at the top');
  console.log('  of this script. Re-run the dry run until the list is right.');
}

if (!WET) {
  console.log(`\n  Nothing was changed. ${rowTotal} row(s) and ${doomedFiles.length} file(s) would go.`);
  console.log(`\n  To do it:  node scripts/purge-data.mjs --confirm ${PROJECT_REF}\n`);
  process.exit(0);
}

// ------------------------------------------------------------------ safeguards
if (GIVEN_REF !== PROJECT_REF) {
  die(
    `Project reference does not match.\n` +
      `  .env.local points at:  ${PROJECT_REF}\n` +
      `  you typed:             ${GIVEN_REF ?? '(nothing)'}\n\n` +
      `  Run:  node scripts/purge-data.mjs --confirm ${PROJECT_REF}`
  );
}

if (!admins.length) {
  die('There are no administrator profiles. Purging now would lock you out of the portal.');
}

const rl = createInterface({ input: process.stdin, output: process.stdout });
const typed = await rl.question(
  `\n  This deletes ${rowTotal} row(s) and ${doomedFiles.length} file(s) from ${PROJECT_REF}.\n` +
    `  There is no undo. Type DELETE to go ahead: `
);
rl.close();
if (typed.trim() !== 'DELETE') die('Not confirmed. Nothing was changed.');

// ---------------------------------------------------------------------- do it
console.log('');
let failed = 0;

for (const { name, key } of TABLES) {
  // PostgREST refuses an unfiltered delete, so "every row" is spelled as
  // "every row whose primary key is not null".
  const { error } = await db.from(name).delete().not(key, 'is', null);
  if (error) {
    console.log(`    ${name.padEnd(28)} FAILED  ${error.message}`);
    failed++;
    continue;
  }
  const { n } = await count(name);
  console.log(`    ${name.padEnd(28)} cleared   ${n === 0 ? '' : `(${n} still there)`}`);
}

// Files next, while the folder names still mean something.
if (doomedFiles.length) {
  for (let i = 0; i < doomedFiles.length; i += 100) {
    const batch = doomedFiles.slice(i, i + 100);
    const { error } = await db.storage.from('documents').remove(batch);
    if (error) {
      console.log(`    documents bucket             FAILED  ${error.message}`);
      failed++;
      break;
    }
  }
  console.log(`    documents bucket             cleared   (${doomedFiles.length} file(s))`);
}

// Members last: their profile rows cascade, so anything above that survived
// would go here silently, and this way the counts above stayed honest.
let removedPeople = 0;
for (const p of doomed) {
  const { error: profileError } = await db.from('profiles').delete().eq('id', p.id);
  if (profileError) {
    console.log(`    ${(p.email ?? p.id).padEnd(28)} FAILED  ${profileError.message}`);
    failed++;
    continue;
  }
  const { error: authError } = await db.auth.admin.deleteUser(p.id);
  // A profile with no matching sign-in is not an error worth stopping for.
  if (authError && !/not found/i.test(authError.message)) {
    console.log(`    ${(p.email ?? p.id).padEnd(28)} sign-in not removed: ${authError.message}`);
    failed++;
    continue;
  }
  removedPeople++;
}
console.log(`    member accounts              removed   (${removedPeople} of ${doomed.length})`);

// ------------------------------------------------------------------- the check
console.log('\n  AFTER');
for (const name of [...TABLES.map((t) => t.name), 'fund_types', 'profiles']) {
  const { n, missing } = await count(name);
  if (!missing) console.log(`    ${name.padEnd(28)}${String(n).padStart(5)}`);
}

console.log(
  failed
    ? `\n  Finished with ${failed} problem(s) — read the lines above before running it again.\n`
    : '\n  Done. The funds and the administrators are untouched.\n'
);

console.log('  Application references carry on from where they stopped. To start them');
console.log('  again at SHF-26-01001, run this in the Supabase SQL editor:\n');
console.log("    alter sequence public.request_ref_seq restart with 1001;\n");
