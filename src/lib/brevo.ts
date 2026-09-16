/**
 * Transactional email, through Brevo.
 *
 * Off unless BREVO_API_KEY and BREVO_FROM_EMAIL are both set, so the
 * foundation runs exactly as it does today until somebody turns it on.
 *
 * Nothing here ever throws, and no caller ever waits on the outcome to decide
 * whether its own work succeeded. A transfer that has happened has happened;
 * if the notification about it does not go out, the money has still moved and
 * the record must still say so. An email provider having a bad afternoon is
 * not a reason to fail a payment.
 */

const ENDPOINT = 'https://api.brevo.com/v3/smtp/email';

/** Long enough for a normal send, short enough that nobody waits on it. */
const TIMEOUT_MS = 8000;

export const brevoReady = () =>
  Boolean(process.env.BREVO_API_KEY && process.env.BREVO_FROM_EMAIL);

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
  const key = process.env.BREVO_API_KEY;
  const from = process.env.BREVO_FROM_EMAIL;
  if (!key || !from) return { sent: false, reason: 'not configured' };

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail.to))
    return { sent: false, reason: 'no usable address' };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'api-key': key,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        sender: { email: from, name: process.env.BREVO_FROM_NAME ?? 'Mohammad Husnain Foundation' },
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
      console.warn(`[brevo] ${res.status}: ${detail}`);
      return { sent: false, reason: `Brevo ${res.status}` };
    }

    return { sent: true };
  } catch (e) {
    console.warn(`[brevo] unreachable: ${(e as Error).message}`);
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
  if (!brevoReady()) return;
  void sendEmail(mail).then((r) => {
    if (!r.sent) console.warn(`[brevo] not sent to ${mail.to}: ${r.reason}`);
  });
}
