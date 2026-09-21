import { NextResponse } from 'next/server';
import { requireCapability } from '@/lib/admin-guard';
import { mailProvider, mailReady, sendEmail } from '@/lib/mailer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Is email configured on the server actually serving this request?
 *
 * Environment variables are the one part of a deploy you cannot see from the
 * outside, and "no email arrived" is the same symptom whether the key is
 * missing, the sender is unverified or the provider refused. Rather than guess
 * between them from a log nobody can find, this answers directly.
 *
 * It never returns a key or any part of one — only whether each variable is
 * present, and what the provider said when asked.
 */
export async function GET() {
  const gate = await requireCapability('view_dashboard');
  if ('refusal' in gate) return gate.refusal;

  const configured = {
    RESEND_API_KEY: Boolean(process.env.RESEND_API_KEY),
    BREVO_API_KEY: Boolean(process.env.BREVO_API_KEY),
    BREVO_FROM_EMAIL: process.env.BREVO_FROM_EMAIL ?? null,
    BREVO_FROM_NAME: process.env.BREVO_FROM_NAME ?? null,
    GEMINI_API_KEY: Boolean(process.env.GEMINI_API_KEY),
  };

  if (!mailReady())
    return NextResponse.json({
      ready: false,
      provider: null,
      configured,
      verdict:
        'This server has no email provider configured. The variables are missing from the deployment, not from the code — check they are on the project itself rather than only on Shared, and that you redeployed after adding them.',
    });

  // Ask the provider whether it accepts the key, without sending anything.
  let providerSays = 'not checked';
  try {
    if (process.env.BREVO_API_KEY) {
      const r = await fetch('https://api.brevo.com/v3/account', {
        headers: { 'api-key': process.env.BREVO_API_KEY, Accept: 'application/json' },
      });
      const j = (await r.json().catch(() => ({}))) as { email?: string; message?: string };
      providerSays = r.ok ? `key accepted (${j.email})` : `HTTP ${r.status}: ${j.message ?? ''}`;
    } else if (process.env.RESEND_API_KEY) {
      const r = await fetch('https://api.resend.com/domains', {
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
      });
      providerSays = r.ok ? 'key accepted' : `HTTP ${r.status}`;
    }
  } catch (e) {
    providerSays = `unreachable: ${(e as Error).message}`;
  }

  return NextResponse.json({
    ready: true,
    provider: mailProvider(),
    configured,
    providerSays,
    verdict:
      'Email is configured on this server. POST to this same address to send yourself a test message.',
  });
}

/** Send a test to whoever is signed in, so nobody has to guess an address. */
export async function POST() {
  const gate = await requireCapability('view_dashboard');
  if ('refusal' in gate) return gate.refusal;

  if (!mailReady())
    return NextResponse.json(
      { sent: false, reason: 'No email provider is configured on this server.' },
      { status: 400 }
    );

  // Already established by the gate above — their own row, not a fresh read.
  const me = gate.profile;

  if (!me?.email)
    return NextResponse.json({ sent: false, reason: 'Your account has no email address.' });

  // A profile is not obliged to carry a name; the test should still send.
  const name = me.full_name ?? me.email.split('@')[0];

  // Awaited rather than backgrounded: the whole point is to report the outcome.
  const result = await sendEmail({
    to: me.email,
    toName: name,
    subject: 'Test from the foundation portal',
    text: `${name.split(' ')[0]}, if you are reading this, email from the live portal is working.`,
    html: '<p>If you are reading this, email from the live portal is working.</p>',
  });

  return NextResponse.json({ to: me.email, ...result });
}
