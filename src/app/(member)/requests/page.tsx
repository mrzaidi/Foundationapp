import Link from 'next/link';
import { redirect } from 'next/navigation';
import Icon from '@/components/Icon';
import NewRequestButton from '@/components/NewRequestButton';
import StatusBadge from '@/components/StatusBadge';
import { currentSession } from '@/lib/session';
import { money, progressPercent, timeAgo } from '@/lib/format';
import { fundText } from '@/lib/funds';
import { getI18n } from '@/lib/i18n/server';
import type { FundRequest, RequestStatus } from '@/lib/types';

export const dynamic = 'force-dynamic';

const FILTERS = ['all', 'requested', 'review', 'accepted', 'transferred', 'rejected'] as const;

export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const active = status && status !== 'all' ? status : 'all';

  const { d, locale } = await getI18n();
  const { supabase, user } = await currentSession();
  if (!user) redirect('/login');

  let query = supabase
    .from('fund_requests')
    .select('*, fund_types(*)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (active !== 'all') query = query.eq('status', active as RequestStatus);

  const { data } = await query;
  const requests = (data ?? []) as FundRequest[];

  return (
    <div className="screen">
      <div className="hero tight">
        <div className="appbar">
          <Link href="/" className="icon-btn" aria-label={d.common.back}>
            <Icon name="chevronLeft" className="flip" />
          </Link>
          <div style={{ flex: 1 }}>
            <h1>{d.requests.title}</h1>
            <div className="sub">{d.requests.subtitle}</div>
          </div>
        </div>
      </div>

      <div className="pad mt-16">
        <NewRequestButton />
      </div>

      <div className="pad mt-16">
        <div className="chips">
          {FILTERS.map((key) => (
            <Link
              key={key}
              href={key === 'all' ? '/requests' : `/requests?status=${key}`}
              className={`chip ${active === key ? 'active' : ''}`}
            >
              {key === 'all' ? d.requests.all : d.status[key]}
            </Link>
          ))}
        </div>
      </div>

      <div className="pad mt-16">
        {requests.length === 0 ? (
          <div className="empty">
            <div className="e-ico">
              <Icon name="inbox" />
            </div>
            <h3>{d.requests.emptyTitle}</h3>
            <p>
              {active === 'all'
                ? d.requests.emptyAll
                : d.requests.emptyFiltered(d.status[active as RequestStatus])}
            </p>
            <Link href="/" className="btn" style={{ maxWidth: 240, margin: '20px auto 0' }}>
              <Icon name="plus" />
              <span>{d.requests.applyCta}</span>
            </Link>
          </div>
        ) : (
          <div className="req-grid">
            {requests.map((r) => (
            <Link
              className="card"
              key={r.id}
              href={`/requests/${r.id}`}
              style={{ display: 'block', marginBottom: 12, textDecoration: 'none' }}
            >
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <div
                  className={r.fund_types?.gradient ?? 'g-brand'}
                  style={{
                    width: 42,
                    height: 42,
                    flex: '0 0 42px',
                    borderRadius: 14,
                    display: 'grid',
                    placeItems: 'center',
                    color: '#fff',
                  }}
                >
                  <Icon name={r.fund_types?.icon ?? 'heart'} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 650 }}>
                    {fundText(r.fund_types, locale).name}
                  </div>
                  <div
                    className="ref"
                    style={{ fontSize: 11.5, color: 'var(--text-faint)', marginTop: 3 }}
                  >
                    {r.reference}
                  </div>
                </div>
                <div className="amt" style={{ textAlign: 'end' }}>
                  <div style={{ fontSize: 14, fontWeight: 750, letterSpacing: '-.3px' }}>
                    {money(Number(r.amount_requested), false)}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 2 }}>
                    {d.common.currency}
                  </div>
                </div>
              </div>

              <div className="mt-12 pbar">
                <span
                  style={{
                    width: `${progressPercent(r.status)}%`,
                    background: r.status === 'rejected' ? 'var(--danger)' : undefined,
                  }}
                />
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginTop: 10,
                }}
              >
                <StatusBadge status={r.status} />
                <span style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>
                  {timeAgo(r.created_at)}
                </span>
              </div>
            </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
