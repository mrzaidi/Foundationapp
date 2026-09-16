import { requirePage } from '@/lib/admin-guard';
import Link from 'next/link';
import AdminCharts from '@/components/charts/AdminCharts';
import MonthlyTrends from '@/components/charts/MonthlyTrends';
import BudgetPanel from '@/components/BudgetPanel';
import Icon from '@/components/Icon';
import StatusBadge from '@/components/StatusBadge';
import { createClient } from '@/lib/supabase/server';
import { initials, money, shortMoney, timeAgo } from '@/lib/format';
import type { AdminStats, FundRequest } from '@/lib/types';

export const dynamic = 'force-dynamic';

const KPIS = [
  { key: 'requested', label: 'Awaiting first look', icon: 'send', grad: 'g-blue' },
  { key: 'review', label: 'Under review', icon: 'search', grad: 'g-amber' },
  { key: 'accepted', label: 'Approved, awaiting transfer', icon: 'checkCircle', grad: 'g-brand' },
  { key: 'transferred', label: 'Transferred', icon: 'wallet', grad: 'g-deep' },
] as const;

const FUND_GRAD: Record<string, string> = {
  monthly: 'var(--grad-brand)',
  accidental: 'var(--grad-rose)',
  grocery: 'var(--grad-amber)',
  electricity: 'var(--grad-blue)',
};

export default async function AdminDashboard() {
  const level = await requirePage('view_dashboard');

  const supabase = await createClient();

  // The monthly fund and the monthly arrivals are fetched by MonthlyTrends,
  // which needs the whole series rather than just this month's figure.
  const [{ data: statsData }, { data: recentData, error: recentError }] = await Promise.all([
    supabase.rpc('admin_stats'),
    supabase
      .from('fund_requests')
      .select('*, fund_types(*), profiles!fund_requests_user_id_fkey(id, full_name, email, mobile, city, country)')
      .order('created_at', { ascending: false })
      .limit(8),
  ]);

  const stats = (statsData ?? {
    members: 0,
    admins: 0,
    requested: 0,
    review: 0,
    accepted: 0,
    transferred: 0,
    rejected: 0,
    total_requested: 0,
    total_disbursed: 0,
    by_fund: [],
  }) as AdminStats;

  const recent = (recentData ?? []) as FundRequest[];

  // A failed query used to render as "no applications yet", which is
  // indistinguishable from an empty database. Say what actually happened.
  if (recentError) console.error('admin dashboard query failed:', recentError.message);
  const maxFund = Math.max(1, ...stats.by_fund.map((f) => Number(f.count)));

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Dashboard</h1>
          <div className="crumb">
            {stats.members} registered account{stats.members === 1 ? '' : 's'} ·{' '}
            {money(Number(stats.total_disbursed))} disbursed to date
          </div>
        </div>
        <Link href="/admin/requests" className="admin-btn">
          <Icon name="inbox" />
          Review applications
        </Link>
      </div>

      {/* ---------- KPI row ---------- */}
      <div className="kpis">
        {KPIS.map((k) => (
          <Link className="kpi" key={k.key} href={`/admin/requests?status=${k.key}`}>
            <div className={`kico ${k.grad}`}>
              <Icon name={k.icon} />
            </div>
            <div className="kn">{stats[k.key]}</div>
            <div className="kl">{k.label}</div>
            <div className={`kedge ${k.grad}`} />
          </Link>
        ))}
      </div>

      {/* ---------- money row ---------- */}
      <div className="kpis mt-16">
        <div className="kpi">
          <div className="kico g-gold" style={{ color: '#6b4a06' }}>
            <Icon name="trend" />
          </div>
          <div className="kn">{shortMoney(Number(stats.total_requested))}</div>
          <div className="kl">PKR requested, all time</div>
        </div>
        <div className="kpi">
          <div className="kico g-brand">
            <Icon name="wallet" />
          </div>
          <div className="kn">{shortMoney(Number(stats.total_disbursed))}</div>
          <div className="kl">PKR actually transferred</div>
        </div>
        <div className="kpi">
          <div className="kico g-rose">
            <Icon name="xCircle" />
          </div>
          <div className="kn">{stats.rejected}</div>
          <div className="kl">Not approved</div>
        </div>
        <Link className="kpi" href="/admin/members">
          <div className="kico g-plum">
            <Icon name="users" />
          </div>
          <div className="kn">{stats.members}</div>
          <div className="kl">Registered accounts</div>
        </Link>
      </div>

      {/* The two monthly figures, as trends rather than as two numbers. */}
      <MonthlyTrends />

      <div className="mt-24">
        <BudgetPanel compact />
      </div>

      <div className="mt-24">
        <AdminCharts />
      </div>

      <div className="two-col mt-24">
        {/* ---------- recent applications ---------- */}
        <div className="panel">
          <div className="panel-head">
            <div>
              <h2>Latest applications</h2>
              <div className="ph-sub">Newest submissions across every fund</div>
            </div>
            <Link href="/admin/requests" className="admin-btn ghost">
              View all
              <Icon name="chevronRight" />
            </Link>
          </div>

          {recent.length === 0 ? (
            <div className="panel-body">
              <div className="empty">
                <div className="e-ico">
                  <Icon name="inbox" />
                </div>
                <h3>{recentError ? 'Could not load applications' : 'No applications yet'}</h3>
                <p>
                  {recentError
                    ? recentError.message
                    : 'Submissions from the member app will appear here.'}
                </p>
              </div>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="grid">
                <thead>
                  <tr>
                    <th>Member</th>
                    <th>Fund</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Submitted</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {recent.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <div className="who">
                          <div className="av">{initials(r.profiles?.full_name ?? '?')}</div>
                          <div>
                            <div className="wn">{r.profiles?.full_name}</div>
                            <div className="we">{r.profiles?.city}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="fundtag">
                          <span className={`fdot ${r.fund_types?.gradient ?? 'g-brand'}`}>
                            <Icon name={r.fund_types?.icon ?? 'heart'} />
                          </span>
                          {r.fund_types?.name}
                        </span>
                      </td>
                      <td className="num">{money(Number(r.amount_requested), false)}</td>
                      <td>
                        <StatusBadge status={r.status} />
                      </td>
                      <td style={{ color: 'var(--text-faint)', fontSize: 12.5 }}>
                        {timeAgo(r.created_at)}
                      </td>
                      <td>
                        <Link className="rowlink" href={`/admin/requests/${r.id}`}>
                          Open
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ---------- by fund ---------- */}
        <div className="panel">
          <div className="panel-head">
            <div>
              <h2>Demand by fund</h2>
              <div className="ph-sub">Applications received per fund type</div>
            </div>
          </div>
          <div className="panel-body">
            {stats.by_fund.length === 0 ? (
              <p className="muted mb-0">No funds configured yet.</p>
            ) : (
              stats.by_fund.map((f) => (
                <div className="bar-row" key={f.id}>
                  <div className="bl">{f.name}</div>
                  <div className="btrack">
                    <span
                      style={{
                        width: `${(Number(f.count) / maxFund) * 100}%`,
                        background: FUND_GRAD[f.id] ?? 'var(--grad-brand)',
                      }}
                    />
                  </div>
                  <div className="bv">{f.count}</div>
                </div>
              ))
            )}

            <div className="note mt-16">
              Totals are computed live from <code>fund_requests</code> by the{' '}
              <code>admin_stats()</code> function in Postgres, so they always match the database.
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
