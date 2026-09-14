/**
 * One-command deploy to Vercel.
 *
 *   node scripts/deploy.mjs           → production
 *   node scripts/deploy.mjs --preview → preview build
 *
 * Reads everything it needs from .env.local, so no secret is ever typed on a
 * command line or left in shell history:
 *
 *   VERCEL_TOKEN                    vercel.com/account/tokens
 *   NEXT_PUBLIC_SUPABASE_URL
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * It links the project, syncs the three environment variables to Vercel, then
 * deploys. Safe to re-run — linking and env sync are both idempotent.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCOPE = 'team_AvF6vaz9eiFEb9K60ycS3VI5';
const PROJECT = 'shf-foundation';
const TARGETS = ['production', 'preview', 'development'];

const prod = !process.argv.includes('--preview');

/* ---------- config ---------- */
const envPath = resolve(root, '.env.local');
if (!existsSync(envPath)) {
  console.error('✗ .env.local not found. Copy .env.example and fill it in.');
  process.exit(1);
}

const env = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

const missing = [
  'VERCEL_TOKEN',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
].filter((k) => !env[k]);

if (missing.length) {
  console.error(`✗ Missing from .env.local: ${missing.join(', ')}`);
  if (missing.includes('VERCEL_TOKEN')) {
    console.error('  Create a token at https://vercel.com/account/tokens and add:');
    console.error('  VERCEL_TOKEN=...');
  }
  process.exit(1);
}

const TOKEN = env.VERCEL_TOKEN;
const base = ['--yes', '--token', TOKEN, '--scope', SCOPE];

/** Runs vercel, never echoing the token. */
function vercel(args, { input, quiet } = {}) {
  const shown = args.filter((a) => a !== TOKEN && a !== '--token');
  if (!quiet) console.log(`  vercel ${shown.join(' ')}`);

  const res = spawnSync('npx', ['--yes', 'vercel@latest', ...args], {
    cwd: root,
    input,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });

  return { code: res.status, out: (res.stdout ?? '') + (res.stderr ?? '') };
}

/* ---------- 1. link ---------- */
console.log('\n1. Linking the project…');
const link = vercel(['link', ...base, '--project', PROJECT]);
if (link.code !== 0) {
  console.error(link.out.replace(new RegExp(TOKEN, 'g'), '***'));
  console.error('✗ Could not link. Is the token valid and scoped to that team?');
  process.exit(1);
}
console.log('   linked.');

/* ---------- 2. environment variables ---------- */
console.log('\n2. Syncing environment variables…');
const vars = {
  NEXT_PUBLIC_SUPABASE_URL: env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY,
};

for (const [key, value] of Object.entries(vars)) {
  for (const target of TARGETS) {
    // remove first so a changed value actually replaces the old one
    vercel(['env', 'rm', key, target, ...base], { quiet: true });
    const add = vercel(['env', 'add', key, target, ...base], { input: `${value}\n`, quiet: true });
    const ok = add.code === 0 ? 'ok' : 'FAILED';
    console.log(`   ${key} → ${target}: ${ok}`);
  }
}

/* ---------- 3. deploy ---------- */
console.log(`\n3. Deploying (${prod ? 'production' : 'preview'})…`);
const args = ['deploy', ...base, ...(prod ? ['--prod'] : [])];
const out = vercel(args).out;
console.log(out.replace(new RegExp(TOKEN, 'g'), '***'));

const url = out.match(/https:\/\/[\w.-]+\.vercel\.app/g)?.pop();
if (url) {
  console.log(`\n✓ Live at ${url}`);
  console.log('\nLast step — in Supabase → Authentication → URL Configuration,');
  console.log(`add ${url} to Site URL and Redirect URLs, or sign-in redirects will fail.`);
} else {
  console.error('\n✗ No deployment URL in the output — check the log above.');
  process.exit(1);
}
