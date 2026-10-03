/** Recording a gift against a month that has already passed. */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

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
const SITE = process.argv[2] ?? 'http://localhost:5196';

let adminId = null;
let donorId = null;
let pass = 0;
let fail = 0;
const check = (l, a, e) => {
  const ok = Array.isArray(e) ? e.includes(a) : a === e;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${l.padEnd(56)} ${a}`);
  ok ? pass++ : fail++;
};

const monthsAgo = (n) => {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - n);
  return d.toISOString().slice(0, 7);
};

try {
  const stamp = Date.now();
  const email = `system-test-${stamp}@example.invalid`;
  const password = `Sys!${stamp}`;
  const { data: c } = await db.auth.admin.createUser({ email, password, email_confirm: true });
  adminId = c.user.id;
  const { data: mr } = await db.from('roles').select('id').eq('is_master', true).maybeSingle();
  await db.from('profiles').insert({
    id: adminId, full_name: 'SYSTEM TEST ADMIN — delete me', gender: 'other', age: 30,
    country: 'Pakistan', city: 'Lahore', email, mobile: '03000000009', role: 'admin', role_id: mr.id,
  });
  const anon = createClient(URL_, ANON, { auth: { persistSession: false } });
  const { data: s } = await anon.auth.signInWithPassword({ email, password });
  const token = s.session.access_token;
  const cookie =
    `sb-${REF}-auth-token=base64-` + Buffer.from(JSON.stringify(s.session)).toString('base64');

  // The fund is read as a signed-in admin: budget_status returns null to
  // anybody else, and the service role is nobody.
  const asAdmin = createClient(URL_, ANON, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const fundOf = async (month) => {
    const { data, error } = await asAdmin.rpc('budget_status', { p_month: `${month}-01` });
    if (error) throw new Error(`budget_status ${month}: ${error.message}`);
    if (!data) throw new Error(`budget_status ${month} returned null — not seen as an admin`);
    return { donated: Number(data.donated), fund: Number(data.fund) };
  };

  const twoBack = monthsAgo(2);
  const oneBack = monthsAgo(1);
  const now = monthsAgo(0);

  // Everybody else's giving, before this donor exists. The months hold other
  // people's gifts, so only the change caused here can be asserted on.
  const before = {
    [twoBack]: await fundOf(twoBack),
    [oneBack]: await fundOf(oneBack),
    [now]: await fundOf(now),
  };

  const made = await fetch(`${SITE}/api/admin/donors`, {
    method: 'POST',
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'SYSTEM TEST DONOR — delete me', monthly_pledge: 1000 }),
  });
  donorId = (await made.json()).donor?.id;
  check('donor created', made.status, [201]);

  const give = (month, amount, received_on) =>
    fetch(`${SITE}/api/admin/donors`, {
      method: 'PATCH',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: donorId, month: `${month}-01`, amount, donation_type: 'zakat', received_on }),
    });

  console.log('\n  recording against earlier months');
  check(`two months back (${twoBack})`, (await give(twoBack, 5000, `${twoBack}-15`)).status, [200]);
  check(`one month back (${oneBack})`, (await give(oneBack, 7000, `${oneBack}-20`)).status, [200]);
  check(`this month (${now})`, (await give(now, 3000, new Date().toISOString().slice(0, 10))).status, [200]);

  console.log('\n  a month that has not happened is refused');
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() + 1);
  const future = d.toISOString().slice(0, 7);
  check(`next month (${future})`, (await give(future, 1000, new Date().toISOString().slice(0, 10))).status, [422]);

  console.log('\n  what the database holds');
  const { data: rows } = await db
    .from('donations')
    .select('month, amount, received_on, donation_type')
    .eq('donor_id', donorId)
    .order('month');
  console.table(rows);
  check('three gifts stored', rows.length, 3);
  check('each in its own month', new Set(rows.map((r) => r.month)).size, 3);
  check('the backdated receipt date was kept', rows[0].received_on.slice(0, 7), twoBack);

  console.log("\n  each month's giving went up by what was recorded");
  for (const [m, expected] of [[twoBack, 5000], [oneBack, 7000], [now, 3000]]) {
    const after = await fundOf(m);
    check(`${m} giving +${expected}`, after.donated - before[m].donated, expected);
  }

  console.log('\n  and a backdated gift carries forward');
  // 5000 + 7000 recorded against earlier months must appear in this month's
  // opening balance, otherwise money the committee holds is invisible to it.
  const nowAfter = await fundOf(now);
  check('this month’s fund +15000', nowAfter.fund - before[now].fund, 15000);
} catch (e) {
  console.error('ERROR:', e.message ?? e);
  fail++;
} finally {
  if (donorId) {
    await db.from('donations').delete().eq('donor_id', donorId);
    await db.from('donors').delete().eq('id', donorId);
  }
  if (adminId) {
    await db.from('profiles').delete().eq('id', adminId);
    await db.auth.admin.deleteUser(adminId);
  }
  console.log(`\n  cleaned up`);
  console.log(`\n  ${pass} passed, ${fail} failed\n`);
}
