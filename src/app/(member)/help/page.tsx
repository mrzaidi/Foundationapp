import Link from 'next/link';
import Icon from '@/components/Icon';
import { getI18n } from '@/lib/i18n/server';

export const dynamic = 'force-dynamic';

const STAGE_ICONS = ['send', 'search', 'checkCircle', 'wallet'];

/** Replace with the foundation's real helpline and inbox before launch. */
const HELPLINE = '+920000000000';
const OFFICE_EMAIL = 'info@shfoundation.org';

export default async function HelpPage() {
  const { d } = await getI18n();

  return (
    <div className="screen">
      <div className="hero tight">
        <div className="appbar">
          <Link href="/" className="icon-btn" aria-label={d.common.back}>
            <Icon name="chevronLeft" className="flip" />
          </Link>
          <div style={{ flex: 1 }}>
            <h1>{d.help.title}</h1>
            <div className="sub">{d.help.subtitle}</div>
          </div>
        </div>
      </div>

      <div className="pad mt-20">
        <div className="section-head" style={{ marginTop: 0 }}>
          <h2>{d.help.howItWorks}</h2>
        </div>
        <div className="card">
          <div className="timeline">
            {d.help.stages.map((s, i) => (
              <div className="ev on" key={s.title}>
                <div className="mark">
                  <Icon name={STAGE_ICONS[i]} strokeWidth={2.3} />
                </div>
                <div className="t">{s.title}</div>
                <div className="d">{s.body}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="pad">
        <div className="section-head">
          <h2>{d.help.beforeYouApply}</h2>
        </div>
        <div className="card">
          <p className="muted" style={{ marginTop: 0 }}>
            {d.help.beforeLede}
          </p>
          <ul className="muted" style={{ margin: 0, paddingInlineStart: 18, lineHeight: 1.9 }}>
            {d.help.tips.map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="pad">
        <div className="section-head">
          <h2>{d.help.contact}</h2>
        </div>
        <a className="list-row" href={`tel:${HELPLINE}`}>
          <span className="li">
            <Icon name="phone" />
          </span>
          <span className="lmid">
            <span className="lt" style={{ display: 'block' }}>
              {d.help.helpline}
            </span>
            <span className="ld" style={{ display: 'block' }}>
              {d.help.helplineHours}
            </span>
          </span>
          <span className="chev">
            <Icon name="chevronRight" />
          </span>
        </a>
        <a className="list-row" href={`mailto:${OFFICE_EMAIL}`}>
          <span className="li">
            <Icon name="mail" />
          </span>
          <span className="lmid">
            <span className="lt" style={{ display: 'block' }}>
              {d.help.emailOffice}
            </span>
            <span className="ld" style={{ display: 'block' }} dir="ltr">
              {OFFICE_EMAIL}
            </span>
          </span>
          <span className="chev">
            <Icon name="chevronRight" />
          </span>
        </a>
      </div>
    </div>
  );
}
