#!/usr/bin/env node
/**
 * End-to-end security test — authentication, roles, and the database boundary.
 *
 *   node scripts/security-test.mjs [site]   # defaults to production
 *
 * Every check is made twice where it matters: once through the app, and once
 * straight at PostgREST with the account's own token. The second is the one
 * that counts — a page that hides a button proves nothing about whether the
 * database would have refused the write.
 *
 * Creates throwaway accounts, exercises them, and deletes everything.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
    })
);

const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const db = createClient(URL_, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const REF = new URL(URL_).hostname.split('.')[0];
const SITE = process.argv[2] ?? 'https://foundationapp-eight.vercel.app';

const made = [];
const rolesMade = [];
const famsMade = [];
const findings = [];
let pass = 0;
let fail = 0;

const ok = (label) => {
  console.log(`    ok    ${label}`);
  pass++;
};
const bad = (label, severity, detail) => {
  console.log(`    FAIL  ${label}`);
  fail++;
  findings.push({ label, severity, detail });
};

/** `expected` is what safety looks like. */
const expect = (label, condition, severity, detail) =>
  condition ? ok(label) : bad(label, severity, detail);

async function account(role, { roleName } = {}) {
  const stamp = `${Date.now()}${Math.floor(Math.random() * 10000)}`;
  const email = `system-test-${stamp}@example.invalid`;
  const password = `Sys!${stamp}`;
  const { data: created, error } = await db.auth.admin.createUser({
    email, password, email_confirm: true,
  });
  if (error) throw error;
  made.push(created.user.id);

  let roleId = null;
  if (roleName) {
    const { data: r } = await db.from('roles').select('id').eq('name', roleName).maybeSingle();
    roleId = r?.id ?? null;
  }

  await db.from('profiles').insert({
    id: created.user.id,
    full_name: `SYSTEM TEST ${roleName ?? role} — delete me`,
    gender: 'other', age: 30, country: 'Pakistan', city: 'Lahore',
    email, mobile: '03000000009', role,
    ...(roleId ? { role_id: roleId } : {}),
  });

  const anon = createClient(URL_, ANON, { auth: { persistSession: false } });
  const { data: signed, error: e2 } = await anon.auth.signInWithPassword({ email, password });
  if (e2) throw e2;

  return {
    id: created.user.id,
    email,
    roleName: roleName ?? role,
    token: signed.session.access_token,
    cookie:
      `sb-${REF}-auth-token=base64-` +
      Buffer.from(JSON.stringify(signed.session)).toString('base64'),
    // Straight at PostgREST, as them. No app in the way.
    rest: createClient(URL_, ANON, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${signed.session.access_token}` } },
    }),
  };
}

const http = (path, who, init = {}) =>
  fetch(SITE + path, {
    redirect: 'manual',
    ...init,
    headers: {
      ...(who ? { Cookie: who.cookie } : {}),
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
  });

const body = async (path, who) => (await http(path, who)).text();

console.log(`\n  Security test — ${SITE}\n`);

try {
  const master = await account('admin', { roleName: 'Master Admin' });
  const appMgr = await account('admin', { roleName: 'Application Manager' });
  const dataMgr = await account('admin', { roleName: 'Data Manager' });
  const member = await account('member');

  for (const who of [master, appMgr, dataMgr]) {
    const { data } = await db
      .from('roles')
      .select('name, role_capabilities(capability), role_statuses(status)')
      .eq('id', (await db.from('profiles').select('role_id').eq('id', who.id).single()).data.role_id)
      .maybeSingle();
    console.log(
      `  ${who.roleName}: ${(data?.role_capabilities ?? []).length} capabilities, ` +
        `sees ${(data?.role_statuses ?? []).map((s) => s.status).join('/') || 'every status'}`
    );
  }

  /* ------------------------------------------------------------------ A */
  console.log('\n  A. Nobody unauthenticated gets in');
  for (const p of ['/admin', '/admin/requests', '/admin/members', '/admin/families', '/admin/roles', '/admin/users']) {
    const r = await http(p, null);
    const html = r.status === 200 ? await r.text() : '';
    expect(
      `${p} refuses an anonymous visitor`,
      r.status === 307 || r.status === 302 || !/<h1>(Applications|Members|Families|Roles|Users)/.test(html),
      'critical',
      `${p} returned ${r.status} with page content to a signed-out visitor.`
    );
  }
  for (const p of ['/api/admin/stats', '/api/admin/roles', '/api/admin/donors', '/api/admin/accounts']) {
    const r = await http(p, null);
    expect(`${p} refuses an anonymous caller`, [401, 403].includes(r.status), 'critical',
      `${p} returned ${r.status} to a signed-out caller.`);
  }

  const forged = {
    cookie:
      `sb-${REF}-auth-token=base64-` +
      Buffer.from(JSON.stringify({ access_token: 'forged', token_type: 'bearer', user: { id: '00000000-0000-0000-0000-000000000000' } })).toString('base64'),
  };
  expect('a forged session cookie is refused', [401, 403].includes((await http('/api/admin/stats', forged)).status),
    'critical', 'A hand-written session cookie was accepted.');

  /* ------------------------------------------------------------------ B */
  console.log('\n  B. A member is not an administrator');
  for (const p of ['/api/admin/stats', '/api/admin/roles', '/api/admin/donors', '/api/admin/members', '/api/admin/family?id=x', '/api/admin/accounts']) {
    expect(`${p} refuses a member`, (await http(p, member)).status === 403, 'critical',
      `A signed-in member reached ${p}.`);
  }
  expect('a member cannot file for somebody else',
    (await http('/api/admin/requests', member, { method: 'POST', body: JSON.stringify({ user_id: master.id, fund_type_id: 'x', amount_requested: 1 }) })).status === 403,
    'critical', 'A member filed an application on another account.');

  /* ------------------------------------------------------------------ C */
  console.log('\n  C. At the database, with the app bypassed entirely');

  const promote = await member.rest.from('profiles').update({ role: 'admin' }).eq('id', member.id).select();
  const afterPromote = (await db.from('profiles').select('role').eq('id', member.id).single()).data;
  expect('a member cannot make themselves an administrator', afterPromote.role === 'member',
    'critical', 'A member escalated to admin by calling PostgREST directly.');

  const { data: masterRole } = await db.from('roles').select('id').eq('is_master', true).single();
  await appMgr.rest.from('profiles').update({ role_id: masterRole.id }).eq('id', appMgr.id).select();
  const afterGrab = (await db.from('profiles').select('role_id').eq('id', appMgr.id).single()).data;
  expect('an administrator cannot give themselves the master role', afterGrab.role_id !== masterRole.id,
    'critical', 'A non-master administrator assigned themselves the master role.');

  const capGrab = await appMgr.rest.from('role_capabilities')
    .insert({ role_id: masterRole.id, capability: 'manage_roles' }).select();
  expect('a non-master cannot write capabilities', Boolean(capGrab.error), 'critical',
    'A non-master administrator inserted a capability row.');

  const roleGrab = await appMgr.rest.from('roles').insert({ name: 'SYSTEM TEST ESCALATION' }).select();
  if (roleGrab.data?.[0]?.id) rolesMade.push(roleGrab.data[0].id);
  expect('a non-master cannot create roles', Boolean(roleGrab.error), 'critical',
    'A non-master administrator created a role.');

  const statusGrab = await appMgr.rest.from('role_statuses').delete().eq('role_id', masterRole.id).select();
  expect('a non-master cannot change what a role sees', Boolean(statusGrab.error) || (statusGrab.data ?? []).length === 0,
    'critical', 'A non-master administrator altered role_statuses.');

  console.log('\n     member reading other people');
  const others = await member.rest.from('profiles').select('id, email');
  expect('a member reads only their own profile', (others.data ?? []).every((p) => p.id === member.id),
    'critical', `A member read ${others.data?.length ?? 0} profiles.`);

  for (const [table, label] of [
    ['families', 'households'],
    ['donors', 'donors'],
    ['donations', 'donations'],
    ['roles', 'roles'],
    ['role_capabilities', 'capabilities'],
  ]) {
    const got = await member.rest.from(table).select('*');
    expect(`a member cannot read ${label}`, (got.data ?? []).length === 0, 'critical',
      `A member read ${got.data?.length} rows from ${table}.`);
  }

  const otherRequests = await member.rest.from('fund_requests').select('id, user_id');
  expect('a member reads only their own applications',
    (otherRequests.data ?? []).every((r) => r.user_id === member.id), 'critical',
    'A member read applications belonging to other households.');

  /* ------------------------------------------------------------------ D */
  console.log('\n  D. Role capabilities actually bind');

  const dataCaps = (await db.from('roles').select('role_capabilities(capability)').eq('name', 'Data Manager').maybeSingle()).data;
  const dataHas = (dataCaps?.role_capabilities ?? []).map((c) => c.capability);
  console.log(`     Data Manager holds: ${dataHas.join(', ') || '(none)'}`);

  if (!dataHas.includes('view_donors')) {
    const r = await http('/api/admin/donors', dataMgr);
    expect('Data Manager is refused donors by the API', r.status === 403, 'high',
      'A role without view_donors reached the donors endpoint.');
    const direct = await dataMgr.rest.from('donors').select('*');
    expect('Data Manager is refused donors by the database', (direct.data ?? []).length === 0, 'critical',
      `A role without view_donors read ${direct.data?.length} donor rows straight from PostgREST.`);
  }

  if (!dataHas.includes('manage_roles')) {
    expect('Data Manager is refused the roles API', (await http('/api/admin/roles', dataMgr)).status === 403,
      'critical', 'A role without manage_roles read the roles API.');
  }

  /* ------------------------------------------------------------------ E */
  console.log('\n  E. What 0028 added');

  const { data: fund } = await db.from('fund_types').select('id').eq('is_active', true).limit(1).single();
  const { data: anyMember } = await db.from('profiles').select('id').eq('role', 'member').neq('id', member.id).limit(1).maybeSingle();
  const subject = anyMember?.id ?? member.id;

  const { data: req } = await db.from('fund_requests')
    .insert({ user_id: subject, fund_type_id: fund.id, amount_requested: 1000, status: 'requested', purpose: 'SYSTEM TEST — delete me' })
    .select().single();

  // Approving with no fund named must be refused.
  const noFund = await db.from('fund_requests').update({ status: 'accepted', amount_approved: 1000 }).eq('id', req.id).select();
  expect('approving without naming a fund is refused', Boolean(noFund.error), 'high',
    'An application was approved with no fund set against it.');

  await db.from('fund_requests').update({ funded_from: 'zakat' }).eq('id', req.id);
  await db.from('fund_requests').update({ status: 'accepted', amount_approved: 1000 }).eq('id', req.id);
  const changeAfter = await db.from('fund_requests').update({ funded_from: 'khums' }).eq('id', req.id).select();
  expect('the fund cannot be changed after approval', Boolean(changeAfter.error), 'high',
    'The fund was changed on an application that had already been approved.');

  const appStatuses = (await db.from('roles').select('role_statuses(status)').eq('name', 'Application Manager').maybeSingle()).data;
  const allowed = (appStatuses?.role_statuses ?? []).map((s) => s.status);
  if (allowed.length) {
    const seen = await appMgr.rest.from('fund_requests').select('id, status');
    const leaked = (seen.data ?? []).filter((r) => !allowed.includes(r.status));
    expect(`Application Manager sees only ${allowed.join('/')}`, leaked.length === 0, 'high',
      `Saw ${leaked.length} application(s) outside its stages: ${[...new Set(leaked.map((r) => r.status))].join(', ')}.`);
  } else {
    console.log('     (Application Manager is not narrowed to any stage — nothing to check)');
  }

  const canDecide = (await db.from('roles').select('role_capabilities(capability)').eq('name', 'Application Manager').maybeSingle())
    .data?.role_capabilities?.map((c) => c.capability).includes('decide_requests');
  const decided = await appMgr.rest.from('fund_requests').update({ status: 'review' }).eq('id', req.id).select();
  if (canDecide) {
    console.log('     Application Manager holds decide_requests — can it act? ' + (decided.error ? 'NO (' + decided.error.message.slice(0, 50) + ')' : 'yes'));
  } else {
    expect('a role without decide_requests cannot decide', Boolean(decided.error) || (decided.data ?? []).length === 0,
      'high', 'A role without decide_requests changed an application status.');
  }

  await db.from('request_events').delete().eq('request_id', req.id);
  await db.from('fund_requests').delete().eq('id', req.id);

  /* ------------------------------------------------------------------ F */
  console.log('\n  F. Documents');
  const { data: anyFile } = await db.storage.from('documents').list('', { limit: 5 });
  const folder = (anyFile ?? []).find((f) => f.id === null && f.name !== member.id);
  if (folder) {
    const peek = await member.rest.storage.from('documents').list(folder.name, { limit: 5 });
    expect("a member cannot list another member's documents", (peek.data ?? []).length === 0, 'critical',
      `A member listed ${peek.data?.length} file(s) in somebody else's folder.`);
    const { data: files } = await db.storage.from('documents').list(folder.name, { limit: 1 });
    if (files?.[0]) {
      const signed = await member.rest.storage.from('documents').createSignedUrl(`${folder.name}/${files[0].name}`, 60);
      expect("a member cannot sign a URL for somebody else's document", Boolean(signed.error), 'critical',
        'A member obtained a signed URL for another household’s document.');
    }
  } else {
    console.log('     (no other folder to probe)');
  }

  /* ------------------------------------------------------------------ G */
  console.log('\n  G. Search terms are not filter syntax');
  for (const [where, q] of [
    ['/admin/families', 'Khan, Ali'],
    ['/admin/families', 'x) or (1=1'],
    ['/admin/families', '*'],
    ['/admin/members', 'Khan, Ali'],
    ['/admin/requests', 'x) or (1=1'],
  ]) {
    const r = await http(`${where}?q=${encodeURIComponent(q)}`, master);
    const html = r.status === 200 ? await r.text() : '';
    const broke = r.status >= 500 || /PGRST|syntax error|unexpected|failed to parse/i.test(html);
    expect(`${where} survives ${JSON.stringify(q)}`, !broke, 'medium',
      `${where} returned ${r.status} and looked like a query error for ${JSON.stringify(q)}.`);
  }

  // Does the families search leak everything when given a wildcard?
  const all = new Set(((await body('/admin/families', master)).match(/\/admin\/families\/[0-9a-f-]{36}/g)) ?? []).size;
  const star = new Set(((await body('/admin/families?q=' + encodeURIComponent('%'), master)).match(/\/admin\/families\/[0-9a-f-]{36}/g)) ?? []).size;
  expect('a lone % is treated as text, not a wildcard', star < all || all === 0, 'low',
    `Searching "%" returned ${star} of ${all} households — the term is reaching the LIKE pattern.`);

  /* ------------------------------------------------------------------ H */
  console.log('\n  H. The perimeter');
  const head = await fetch(SITE + '/login');
  const present = (h) => head.headers.get(h) !== null;
  for (const h of ['strict-transport-security', 'content-security-policy', 'x-frame-options', 'x-content-type-options', 'referrer-policy', 'permissions-policy']) {
    expect(`${h} is set`, present(h), h === 'strict-transport-security' ? 'low' : 'medium',
      `${h} is not sent on any response.`);
  }

  const burst = await Promise.all(
    Array.from({ length: 12 }, (_, i) =>
      fetch(SITE + '/api/auth/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: 'x', email: `probe-${Date.now()}-${i}@example.invalid` }),
      }).then((r) => r.status)
    )
  );
  const throttled = burst.filter((s) => s === 429).length;
  expect('registration is rate limited', throttled > 0, 'medium',
    `12 rapid registration attempts produced no 429 — statuses seen: ${[...new Set(burst)].join(', ')}.`);
} catch (e) {
  console.error('\n  ERROR:', e.message ?? e);
  fail++;
} finally {
  for (const id of famsMade) await db.from('families').delete().eq('id', id);
  for (const id of rolesMade) {
    await db.from('role_capabilities').delete().eq('role_id', id);
    await db.from('roles').delete().eq('id', id);
  }
  for (const id of made) {
    await db.from('families').update({ updated_by: null }).eq('updated_by', id);
    await db.from('families').update({ created_by: null }).eq('created_by', id);
    await db.from('fund_requests').update({ reviewed_by: null }).eq('reviewed_by', id);
    await db.from('request_events').delete().eq('actor_id', id);
    await db.from('profiles').delete().eq('id', id);
    await db.auth.admin.deleteUser(id);
  }
  const leftover = (await db.from('profiles').select('id').ilike('full_name', '%SYSTEM TEST%')).data?.length ?? 0;
  console.log(`\n  cleaned up ${made.length} account(s); SYSTEM TEST rows left: ${leftover}`);
  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  if (findings.length) {
    console.log('  FINDINGS');
    for (const f of findings.sort((a, b) => ['critical', 'high', 'medium', 'low'].indexOf(a.severity) - ['critical', 'high', 'medium', 'low'].indexOf(b.severity)))
      console.log(`    [${f.severity.toUpperCase()}] ${f.label}\n        ${f.detail}`);
  }
  writeFileSync('zz-findings.json', JSON.stringify(findings, null, 2));
}
