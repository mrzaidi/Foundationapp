import Icon from './Icon';

/**
 * Whether the optional integrations are switched on, on the server that just
 * rendered this.
 *
 * Environment variables are the one part of a deployment nobody can see from
 * the outside, and both of these fail silently: no email arrives, the
 * assistant answers in fixed phrasing, and neither says why. Reading them here
 * — in a server component, where process.env is the real thing — turns "it is
 * not working" into a fact somebody can act on.
 *
 * Never prints a key. Presence, and the from-address, which is not a secret.
 */
export default function SystemStatus() {
  const email = Boolean(process.env.BREVO_API_KEY && process.env.BREVO_FROM_EMAIL)
    ? { on: true, detail: `sending as ${process.env.BREVO_FROM_EMAIL}` }
    : process.env.RESEND_API_KEY
      ? { on: true, detail: 'sending through Resend' }
      : {
          on: false,
          detail: process.env.BREVO_API_KEY
            ? 'a key is set but BREVO_FROM_EMAIL is missing'
            : 'no key on this deployment',
        };

  const wording = process.env.GEMINI_API_KEY
    ? { on: true, detail: 'answers are worded by the model' }
    : { on: false, detail: 'answers use the built-in wording' };

  const rows = [
    { label: 'Member emails', ...email },
    { label: 'Assistant wording', ...wording },
  ];

  const allOn = rows.every((r) => r.on);

  return (
    <div className="panel mt-24">
      <div className="panel-head">
        <div>
          <h2>Integrations</h2>
          <div className="ph-sub">
            {allOn
              ? 'Both are switched on for this deployment'
              : 'Set in Vercel, then redeploy — they are read only when the site is built'}
          </div>
        </div>
        <Icon name={allOn ? 'checkCircle' : 'alert'} />
      </div>
      <div className="panel-body">
        {rows.map((r) => (
          <div className="kv" key={r.label}>
            <span className="k">{r.label}</span>
            <span className="v" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <span className={`badge ${r.on ? 'b-accepted' : 'b-review'}`}>
                {r.on ? 'On' : 'Off'}
              </span>
              <span style={{ color: 'var(--text-faint)', fontSize: 12.5, fontWeight: 500 }}>
                {r.detail}
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
