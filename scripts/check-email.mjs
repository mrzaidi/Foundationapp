/**
 * Is email actually configured, and does it actually send?
 *
 *   npm run email:check                 — report what is configured
 *   npm run email:check you@example.com — and send a real message there
 *
 * Written because the failures here are quiet and look alike: a key from the
 * wrong tab, a sender nobody verified, a variable named almost right. Each of
 * those produces "no email arrived", and guessing between them wastes an
 * afternoon. This asks the provider and prints what it says.
 */
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

const mask = (v) => (v ? `${v.slice(0, 8)}… (${v.length} chars)` : 'not set');

console.log('Configured in .env.local');
console.log('  RESEND_API_KEY   :', mask(env.RESEND_API_KEY));
console.log('  RESEND_FROM_EMAIL:', env.RESEND_FROM_EMAIL ?? 'not set (will use onboarding@resend.dev)');
console.log('  BREVO_API_KEY    :', mask(env.BREVO_API_KEY));
console.log('  BREVO_FROM_EMAIL :', env.BREVO_FROM_EMAIL ?? 'not set');
console.log('');

const to = process.argv[2];

/* ---------------------------------------------------------------- */
if (env.RESEND_API_KEY) {
  console.log('Provider: Resend');

  if (!env.RESEND_API_KEY.startsWith('re_'))
    console.log('  ! A Resend API key starts with "re_". This one does not.');

  const who = await fetch('https://api.resend.com/domains', {
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}` },
  });
  const body = await who.text();
  console.log('  key check : HTTP', who.status, who.ok ? '— accepted' : '— ' + body.slice(0, 160));

  if (who.ok) {
    const domains = JSON.parse(body).data ?? [];
    console.log(
      '  domains   :',
      domains.length
        ? domains.map((d) => `${d.name} (${d.status})`).join(', ')
        : 'none verified — you can only email the address that owns this Resend account'
    );
  }

  if (to && who.ok) {
    const from = env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev';
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `Mohammad Husnain Foundation <${from}>`,
        to: [to],
        subject: 'Test from the foundation portal',
        text: 'If you are reading this, email from the portal is working.',
      }),
    });
    const t = await r.text();
    console.log(`\n  send to ${to}: HTTP ${r.status} ${r.ok ? '— SENT' : '— ' + t.slice(0, 220)}`);
  }
}

/* ---------------------------------------------------------------- */
if (env.BREVO_API_KEY) {
  console.log('Provider: Brevo');

  if (!env.BREVO_API_KEY.startsWith('xkeysib-')) {
    console.log('  ! A Brevo API key starts with "xkeysib-". This one does not —');
    console.log('    check you copied from the "API keys" tab, not the SMTP tab.');
  }

  const a = await fetch('https://api.brevo.com/v3/account', {
    headers: { 'api-key': env.BREVO_API_KEY, Accept: 'application/json' },
  });
  const aj = await a.json().catch(() => ({}));
  console.log('  key check :', 'HTTP ' + a.status, a.ok ? '— ' + aj.email : '— ' + (aj.message ?? ''));

  if (a.ok) {
    const s = await fetch('https://api.brevo.com/v3/senders', {
      headers: { 'api-key': env.BREVO_API_KEY, Accept: 'application/json' },
    });
    const sj = await s.json().catch(() => ({}));
    const senders = sj.senders ?? [];
    console.log('  senders   :', senders.length ? '' : 'none — nothing can be sent until one is verified');
    for (const x of senders) console.log(`     ${x.active ? 'VERIFIED' : 'PENDING '}  ${x.email}`);

    if (env.BREVO_FROM_EMAIL && !senders.some((x) => x.email === env.BREVO_FROM_EMAIL && x.active))
      console.log(`  ! BREVO_FROM_EMAIL (${env.BREVO_FROM_EMAIL}) is not a verified sender.`);
  }

  if (to && a.ok && env.BREVO_FROM_EMAIL) {
    const r = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': env.BREVO_API_KEY,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        sender: { email: env.BREVO_FROM_EMAIL, name: 'Mohammad Husnain Foundation' },
        to: [{ email: to }],
        subject: 'Test from the foundation portal',
        textContent: 'If you are reading this, email from the portal is working.',
      }),
    });
    const t = await r.text();
    console.log(`\n  send to ${to}: HTTP ${r.status} ${r.ok ? '— SENT' : '— ' + t.slice(0, 220)}`);
  }
}

if (!env.RESEND_API_KEY && !env.BREVO_API_KEY) {
  console.log('No email provider is configured, so the portal sends nothing.');
  console.log('');
  console.log('Easiest: resend.com → sign up → API Keys → create one, then add to .env.local:');
  console.log('  RESEND_API_KEY=re_...');
  console.log('Nothing else is needed. Resend ships a verified sender, so it works immediately —');
  console.log('though until you verify a domain it can only deliver to your own Resend address.');
}
