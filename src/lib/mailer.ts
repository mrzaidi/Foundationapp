/**
 * Transactional email, through whichever provider is configured.
 *
 * Two are supported because they differ in exactly the way that matters when
 * you are trying to get started:
 *
 *   Resend  — RESEND_API_KEY alone is enough. It ships a pre-verified sender,
 *             onboarding@resend.dev, so mail goes out the minute you have a
 *             key. No domain, no confirmation link, nothing to verify.
 *   Brevo   — BREVO_API_KEY plus a sender address you have verified with them
 *             first. More generous free tier, more setup before it will send.
 *
 * Resend wins if both are set, because if somebody has gone to the trouble of
 * adding it they are probably using it.
 *
 * Off unless one of them is configured, so the foundation runs exactly as it
 * does today until somebody turns it on. Nothing here throws, and no caller
 * waits on the outcome: money that has moved has moved, and a provider having
 * a bad afternoon must never turn a recorded transfer into a failed request.
 */

/** Long enough for a normal send, short enough that nobody waits on it. */
const TIMEOUT_MS = 8000;

type Provider = 'resend' | 'brevo';

function provider(): Provider | null {
  if (process.env.RESEND_API_KEY) return 'resend';
  if (process.env.BREVO_API_KEY && process.env.BREVO_FROM_EMAIL) return 'brevo';
  return null;
}

export const mailReady = () => provider() !== null;

/** Which one is in use, for the setup page to report honestly. */
export const mailProvider = provider;

const fromName = () => process.env.MAIL_FROM_NAME ?? 'Mohammad Husnain Foundation';

/**
 * Resend's shared sender works with no setup at all, which is the whole point
 * of offering it — but it can only deliver to the address that owns the Resend
 * account until a domain is verified. Fine for testing, and the setup check
 * says so plainly rather than letting it look like a silent failure.
 */
const resendFrom = () =>
  process.env.RESEND_FROM_EMAIL
    ? `${fromName()} <${process.env.RESEND_FROM_EMAIL}>`
    : `${fromName()} <onboarding@resend.dev>`;

export interface Attachment {
  /** Base64, without a data: prefix. */
  content: string;
  name: string;
}

export interface Mail {
  to: string;
  toName?: string;
  subject: string;
  /** Plain text is not optional: some of these go to phones on poor lines. */
  text: string;
  html: string;
  attachments?: Attachment[];
}

export async function sendEmail(mail: Mail): Promise<{ sent: boolean; reason?: string }> {
  const which = provider();
  if (!which) return { sent: false, reason: 'no email provider configured' };

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail.to))
    return { sent: false, reason: 'no usable address' };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

  try {
    const res =
      which === 'resend'
        ? await fetch('https://api.resend.com/emails', {
            method: 'POST',
            signal: ctrl.signal,
            headers: {
              Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              from: resendFrom(),
              to: [mail.to],
              subject: mail.subject,
              text: mail.text,
              html: mail.html,
              ...(mail.attachments?.length
                ? {
                    attachments: mail.attachments.map((a) => ({
                      filename: a.name,
                      content: a.content,
                    })),
                  }
                : {}),
            }),
          })
        : await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            signal: ctrl.signal,
            headers: {
              'api-key': process.env.BREVO_API_KEY!,
              'Content-Type': 'application/json',
              Accept: 'application/json',
            },
            body: JSON.stringify({
              sender: { email: process.env.BREVO_FROM_EMAIL, name: fromName() },
              to: [{ email: mail.to, ...(mail.toName ? { name: mail.toName } : {}) }],
              subject: mail.subject,
              textContent: mail.text,
              htmlContent: mail.html,
              ...(mail.attachments?.length ? { attachment: mail.attachments } : {}),
            }),
          });

    if (!res.ok) {
      // The body names the cause — an unverified sender, a bad key, a blocked
      // recipient — and none of it is secret.
      const detail = (await res.text()).slice(0, 300);
      console.warn(`[mail:${which}] ${res.status}: ${detail}`);
      return { sent: false, reason: `${which} ${res.status}: ${detail.slice(0, 120)}` };
    }

    return { sent: true };
  } catch (e) {
    console.warn(`[mail:${which}] unreachable: ${(e as Error).message}`);
    return { sent: false, reason: 'unreachable' };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Send without making the caller wait or care.
 *
 * For the places where the work is already done and committed — the status has
 * moved, the account exists — and the email is a courtesy on top of it.
 */
export function sendInBackground(mail: Mail): void {
  if (!mailReady()) return;
  void sendEmail(mail).then((r) => {
    if (!r.sent) console.warn(`[mail] not sent to ${mail.to}: ${r.reason}`);
  });
}
