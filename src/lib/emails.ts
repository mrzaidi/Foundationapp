import type { Mail } from './mailer';

/**
 * What the foundation says to a member, and when.
 *
 * Three moments, chosen because each is one a member would otherwise have to
 * keep checking the portal to learn: their account exists, a decision was
 * made, the money was sent.
 *
 * Written plainly and kept short. These are read on cheap phones over poor
 * connections, often by somebody anxious about money, so every one of them
 * leads with the answer rather than with the foundation's name.
 */

const BRAND = '#0e7a52';
const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://foundationapp-eight.vercel.app';

const money = (n: number) => `PKR ${Math.round(n).toLocaleString('en-GB')}`;

/** Inline styles only: an email client will strip anything else. */
function wrap(heading: string, body: string, cta?: { href: string; label: string }) {
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#eef4f1;padding:24px">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #dbe7e1">
    <div style="background:${BRAND};color:#fff;padding:18px 24px;font-size:15px;font-weight:700">
      Mohammad Husnain Foundation
    </div>
    <div style="padding:24px">
      <h1 style="margin:0 0 12px;font-size:19px;line-height:1.3;color:#10201a">${heading}</h1>
      <div style="font-size:14.5px;line-height:1.65;color:#31423b">${body}</div>
      ${
        cta
          ? `<p style="margin:22px 0 0">
               <a href="${cta.href}" style="display:inline-block;background:${BRAND};color:#fff;text-decoration:none;padding:11px 20px;border-radius:9px;font-size:14px;font-weight:600">${cta.label}</a>
             </p>`
          : ''
      }
    </div>
    <div style="padding:14px 24px;border-top:1px solid #edf3f0;font-size:11.5px;color:#7d8d86">
      You are receiving this because you have an account with the foundation.
    </div>
  </div>
</div>`;
}

/**
 * A new account, made for somebody at the office.
 *
 * Deliberately without the password. The administrator hands that over in
 * person, which is the whole reason this path exists — and a password that can
 * request money should not sit in an inbox for the rest of its life. The email
 * exists to confirm the address works and to say where to sign in.
 */
export function welcomeEmail(to: string, name: string): Mail {
  const first = name.split(' ')[0];
  return {
    to,
    toName: name,
    subject: 'Your foundation account is ready',
    text: `${first}, an account has been created for you at the Mohammad Husnain Foundation.

Sign in at ${SITE}/login using this email address. The password was given to you at the office — if you do not have it, please ask.

Once you are signed in, add your bank details. The foundation cannot transfer anything to you until they are on file.`,
    html: wrap(
      `Your account is ready, ${first}`,
      `<p style="margin:0 0 12px">An account has been created for you at the Mohammad Husnain Foundation.</p>
       <p style="margin:0 0 12px">Sign in with this email address. Your password was given to you at the office — if you do not have it, please ask.</p>
       <p style="margin:0"><strong>Once you are signed in, add your bank details.</strong> The foundation cannot transfer anything to you until they are on file.</p>`,
      { href: `${SITE}/login`, label: 'Sign in' }
    ),
  };
}

/** A decision the member would otherwise have to keep checking the portal for. */
export function decisionEmail(
  to: string,
  name: string,
  opts: { reference: string; fund: string; status: string; amount?: number | null; note?: string | null }
): Mail | null {
  const first = name.split(' ')[0];
  const { reference, fund, status, amount, note } = opts;

  if (status === 'accepted') {
    const figure = amount ? money(Number(amount)) : 'the approved amount';
    return {
      to,
      toName: name,
      subject: `Your ${fund} application was approved`,
      text: `${first}, your application ${reference} for ${fund} has been approved for ${figure}.

The transfer is being arranged. You will hear from us again when the money has been sent.${note ? `\n\nNote from the committee: ${note}` : ''}`,
      html: wrap(
        'Your application was approved',
        `<p style="margin:0 0 12px">Your application <strong>${reference}</strong> for ${fund} has been approved for <strong>${figure}</strong>.</p>
         <p style="margin:0 0 12px">The transfer is being arranged. You will hear from us again when the money has been sent.</p>
         ${note ? `<p style="margin:0;padding:12px;background:#f4f8f6;border-radius:8px">Note from the committee: ${note}</p>` : ''}`,
        { href: `${SITE}/requests`, label: 'Track your application' }
      ),
    };
  }

  if (status === 'rejected') {
    return {
      to,
      toName: name,
      subject: `About your ${fund} application`,
      text: `${first}, your application ${reference} for ${fund} could not be approved this time.

${note ? `Reason: ${note}\n\n` : ''}You are welcome to apply again. If anything is unclear, please contact the foundation office.`,
      html: wrap(
        'Your application could not be approved',
        `<p style="margin:0 0 12px">Your application <strong>${reference}</strong> for ${fund} could not be approved this time.</p>
         ${note ? `<p style="margin:0 0 12px;padding:12px;background:#f4f8f6;border-radius:8px">Reason: ${note}</p>` : ''}
         <p style="margin:0">You are welcome to apply again. If anything is unclear, please contact the foundation office.</p>`,
        { href: `${SITE}/requests`, label: 'Open the portal' }
      ),
    };
  }

  // Only the three moments worth an email. Moving to review is not one.
  return null;
}

/** The money has gone. The receipt travels with it. */
export function transferEmail(
  to: string,
  name: string,
  opts: { reference: string; fund: string; amount: number; method?: string | null },
  receipt?: { content: string; name: string }
): Mail {
  const first = name.split(' ')[0];
  const how =
    opts.method === 'cash' ? ' in cash' : opts.method === 'bank' ? ' by bank transfer' : '';

  return {
    to,
    toName: name,
    subject: `${money(opts.amount)} has been sent to you`,
    text: `${first}, the foundation has sent you ${money(opts.amount)}${how} for your ${opts.fund} application (${opts.reference}).

Your receipt is attached. Please keep it for your records.

If the money has not reached you within a few days, contact the foundation office and quote ${opts.reference}.`,
    html: wrap(
      `${money(opts.amount)} has been sent to you`,
      `<p style="margin:0 0 12px">The foundation has sent you <strong>${money(opts.amount)}</strong>${how} for your ${opts.fund} application (<strong>${opts.reference}</strong>).</p>
       <p style="margin:0 0 12px">Your receipt is attached. Please keep it for your records.</p>
       <p style="margin:0">If the money has not reached you within a few days, contact the foundation office and quote ${opts.reference}.</p>`
      // No button. This email is the end of the matter: the money has gone and
      // the receipt is attached to the message itself. Sending somebody to the
      // portal to look at an application that is finished asks them to sign in
      // for nothing.
    ),
    ...(receipt ? { attachments: [receipt] } : {}),
  };
}
