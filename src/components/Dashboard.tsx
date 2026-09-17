'use client';

import Link from 'next/link';
import { useApply } from './ApplyProvider';
import Icon from './Icon';
import LanguageToggle from './LanguageToggle';
import { useI18n } from './LocaleProvider';
import StatusBadge from './StatusBadge';
import { fundText } from '@/lib/funds';
import { initials, money, timeAgo } from '@/lib/format';
import type { FundRequest, FundType, Profile } from '@/lib/types';

const STAT_KEYS = ['requested', 'review', 'accepted', 'transferred'] as const;
const STAT_COLORS: Record<string, string> = {
  requested: 'var(--st-requested)',
  review: 'var(--st-review)',
  accepted: 'var(--st-accepted)',
  transferred: 'var(--st-transfer)',
};

export default function Dashboard({
  profile,
  funds,
  requests,
}: {
  profile: Profile;
  funds: FundType[];
  requests: FundRequest[];
}) {
  const { d, locale } = useI18n();
  // The sheets themselves live in the member layout, so the same flow is one
  // tap away from every screen and survives navigation between them.
  const { startFund } = useApply();

  const counts = STAT_KEYS.map((key) => ({
    key,
    label: d.status[key],
    color: STAT_COLORS[key],
    n: requests.filter((r) => r.status === key).length,
  }));

  const disbursed = requests
    .filter((r) => r.status === 'transferred')
    .reduce((sum, r) => sum + Number(r.amount_approved ?? r.amount_requested), 0);

  const transferredCount = counts.find((c) => c.key === 'transferred')?.n ?? 0;
  const recent = requests.slice(0, 4);

  return (
    <div className="screen">
      {/* ---------- welcome band ---------- */}
      <div className="hero welcome">

        <div className="welcome-row">
          <div className="greet">
            <div className="avatar">{initials(profile.full_name)}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="hi">{d.dashboard.greeting}</div>
              <div className="name">{profile.full_name}</div>
            </div>
            <div className="greet-actions">
              <LanguageToggle />
              <Link href="/profile" className="icon-btn" aria-label={d.nav.profile}>
                <Icon name="user" />
              </Link>
            </div>
          </div>

          <div className="hero-total">
            <div className="ht-label">{d.dashboard.totalReceived}</div>
            <div className="ht-value num">{money(disbursed)}</div>
            <div className="ht-sub">{d.dashboard.across(requests.length, transferredCount)}</div>
          </div>
        </div>
      </div>

      {/* ---------- body: one column on a phone, two on a desktop ---------- */}
      <div className="portal-body">
        <div className="portal-main">
          {/* progress — a band on mobile, a rail in the sidebar on desktop */}
          <div className="pad overlap portal-stats">
            <div className="stat-row">
              {counts.map((c) => (
                <Link className="stat" key={c.key} href={`/requests?status=${c.key}`}>
                  <div className="n num" style={{ color: c.color }}>
                    {c.n}
                  </div>
                  <div className="l">{c.label}</div>
                  <div className="bar" style={{ background: c.color, opacity: c.n ? 0.9 : 0.2 }} />
                </Link>
              ))}
            </div>
          </div>

          <div className="pad">
            <div className="section-head">
              <h2>{d.dashboard.applyHeading}</h2>
              <span className="section-meta">{d.dashboard.available(funds.length)}</span>
            </div>

            {funds.length === 0 ? (
              <div className="card center">
                <p className="muted mb-0">{d.dashboard.noFunds}</p>
              </div>
            ) : (
              <div className="fund-grid">
                {funds.map((f, i) => {
                  const text = fundText(f, locale);
                  return (
                    <button
                      key={f.id}
                      className={`fund ${f.gradient} rise rise-${Math.min(i + 1, 4)}`}
                      onClick={() => startFund(f)}
                    >
                      <div className="ico">
                        <Icon name={f.icon} />
                      </div>
                      <div>
                        <div className="t">{text.name}</div>
                        <div className="d">{text.description}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="pad">
            <div className="section-head">
              <h2>{d.dashboard.yourApplications}</h2>
              {requests.length > 0 && <Link href="/requests">{d.common.viewAll}</Link>}
            </div>

            {recent.length === 0 ? (
              <div className="card">
                <div className="empty" style={{ padding: '22px 10px' }}>
                  <div className="e-ico">
                    <Icon name="inbox" />
                  </div>
                  <h3>{d.dashboard.noApplications}</h3>
                  <p>{d.dashboard.noApplicationsBody}</p>
                </div>
              </div>
            ) : (
              <div className="req-list">
                {recent.map((r) => (
                  <Link className="req" key={r.id} href={`/requests/${r.id}`}>
                    <div className={`ico ${r.fund_types?.gradient ?? 'g-brand'}`}>
                      <Icon name={r.fund_types?.icon ?? 'heart'} />
                    </div>
                    <div className="mid">
                      <div className="ttl">{fundText(r.fund_types, locale).name}</div>
                      <div className="meta">
                        <StatusBadge status={r.status} />
                        <span>{timeAgo(r.created_at)}</span>
                      </div>
                    </div>
                    <div className="amt">
                      {money(Number(r.amount_requested), false)}
                      <small>{d.common.currency}</small>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ---------- aside: context, not actions ---------- */}
        <aside className="portal-aside">
          <div className="pad">
            <div className="info-card info-card--brand">
              <div className="ic-ico g-gold">
                <Icon name="shield" />
              </div>
              <div>
                <div className="ic-title">{d.dashboard.privateTitle}</div>
                <p className="ic-body">{d.dashboard.privateBody}</p>
              </div>
            </div>

            <Link href="/help" className="info-card info-card--link">
              <div className="ic-ico g-brand">
                <Icon name="info" />
              </div>
              <div>
                <div className="ic-title">{d.profile.helpContact}</div>
                <p className="ic-body">{d.profile.helpContactSub}</p>
              </div>
              <span className="ic-chev">
                <Icon name="chevronRight" />
              </span>
            </Link>

          </div>
        </aside>
      </div>
    </div>
  );
}
