/**
 * Read-only inspector for the live Supabase project — used to verify the
 * end-to-end flow. Prints counts and the most recent rows, never keys.
 *
 *   node scripts/inspect.mjs
 *   node scripts/inspect.mjs cleanup <email>   # deletes a test member + files
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const env = Object.fromEntries(
  readFileSync(resolve(root, '.env.local'), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

const rest = async (path, init = {}) => {
  const r = await fetch(`${URL_}/rest/v1/${path}`, { ...init, headers: { ...H, ...init.headers } });
  const text = await r.text();
  return { status: r.status, ok: r.ok, body: text ? JSON.parse(text) : null };
};

async function report() {
  const [profiles, requests, attachments, events] = await Promise.all([
    rest('profiles?select=id,full_name,email,role,nic_path,city&order=created_at.desc'),
    rest(
      'fund_requests?select=id,reference,fund_type_id,amount_requested,amount_approved,status,transfer_ref,transferred_at&order=created_at.desc'
    ),
    rest('request_attachments?select=id,request_id,file_name,kind,path,size_bytes'),
    rest('request_events?select=request_id,status,note,created_at&order=created_at.asc'),
  ]);

  console.log(`profiles            (${profiles.body.length})`);
  for (const p of profiles.body)
    console.log(`   ${p.full_name} · ${p.email} · ${p.role} · CNIC:${p.nic_path ? 'yes' : 'no'}`);

  console.log(`fund_requests       (${requests.body.length})`);
  for (const r of requests.body)
    console.log(
      `   ${r.reference} · ${r.fund_type_id} · req ${r.amount_requested}` +
        (r.amount_approved ? ` · appr ${r.amount_approved}` : '') +
        ` · ${r.status}` +
        (r.transfer_ref ? ` · ref ${r.transfer_ref}` : '')
    );

  console.log(`request_attachments (${attachments.body.length})`);
  for (const a of attachments.body)
    console.log(`   ${a.file_name} · ${a.kind} · ${a.size_bytes ?? '?'} bytes`);

  console.log(`request_events      (${events.body.length})`);
  for (const e of events.body)
    console.log(`   ${e.status.padEnd(12)} ${new Date(e.created_at).toLocaleString('en-GB')}`);

  const objs = await fetch(`${URL_}/storage/v1/object/list/documents`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ prefix: '', limit: 100 }),
  });
  const list = objs.ok ? await objs.json() : [];
  console.log(`storage objects     (${list.length})`);
}

async function cleanup(email) {
  const users = await fetch(`${URL_}/auth/v1/admin/users?per_page=200`, { headers: H }).then((r) =>
    r.json()
  );
  const user = (users.users ?? []).find((u) => u.email === email);
  if (!user) return console.log(`no user with email ${email}`);

  // storage objects are not cascaded by the FK — remove them explicitly
  const listed = await fetch(`${URL_}/storage/v1/object/list/documents`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ prefix: user.id, limit: 100 }),
  });
  const walk = async (prefix) => {
    const r = await fetch(`${URL_}/storage/v1/object/list/documents`, {
      method: 'POST',
      headers: H,
      body: JSON.stringify({ prefix, limit: 100 }),
    });
    const items = r.ok ? await r.json() : [];
    let paths = [];
    for (const it of items) {
      const full = prefix ? `${prefix}/${it.name}` : it.name;
      if (it.id === null) paths = paths.concat(await walk(full));
      else paths.push(full);
    }
    return paths;
  };
  void listed;
  const paths = await walk(user.id);
  if (paths.length) {
    await fetch(`${URL_}/storage/v1/object/documents`, {
      method: 'DELETE',
      headers: H,
      body: JSON.stringify({ prefixes: paths }),
    });
  }

  const del = await fetch(`${URL_}/auth/v1/admin/users/${user.id}`, { method: 'DELETE', headers: H });
  console.log(`deleted ${email}: auth ${del.status}, ${paths.length} storage object(s) removed`);
}

const [cmd, arg] = process.argv.slice(2);
if (cmd === 'cleanup') await cleanup(arg);
else await report();
