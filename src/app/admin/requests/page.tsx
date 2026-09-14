import Link from 'next/link';
import Icon from '@/components/Icon';
import AdminSearch from '@/components/AdminSearch';
import StatusBadge from '@/components/StatusBadge';
import { createClient } from '@/lib/supabase/server';
import { dateLabel, initials, money } from '@/lib/format';
import type { FundRequest } from '@/lib/types';

export const dynamic = 'force-dynamic';

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'requested', label: 'Requested' },
  { key: 'review', label: 'Review' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'transferred', label: 'Transferred' },
  { key: 'rejected', label: 'Rejected' },
];

const PAGE_SIZE = 25;

export default async function AdminRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; fund?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const status = sp.status && sp.status !== 'all' ? sp.status : 'all';
  const q = sp.q?.trim() ?? '';
  const fund = sp.fund ?? 'all';
  const page = Math.max(1, Number(sp.page ?? 1));
  const from = (page - 1) * PAGE_SIZE;

  const supabase = await createClient();

  const { data: funds } = await supabase.from('fund_types').select('id, name').order('sort_order');

  // A query that looks like a reference (SHF-26-01001) searches the reference
  // column; anything else searches the member via the joined profiles row.
  const looksLikeRef = /^(shf|\d)/i.test(q);

  let query = supabase
    .from('fund_requests')
    .select(
      q && !looksLikeRef
        ? '*, fund_types(*), request_attachments(id), profiles!fund_requests_user_id_fkey!inner(id, full_name, email, mobile, city, country)'
        : '*, fund_types(*), request_attachments(id), profiles!fund_requests_user_id_fkey(id, full_name, email, mobile, city, country)',
      { count: 'exact' }
    )
    .order('created_at', { ascending: false })
    .range(from, from + PAGE_SIZE - 1);

  if (status !== 'all') query = query.eq('status', status);
  if (fund !== 'all') query = query.eq('fund_type_id', fund);
  if (q) {
    if (looksLikeRef) query = query.ilike('reference', `%${q}%`);
    else
      query = query.or(`full_name.ilike.%${q}%,email.ilike.%${q}%,mobile.ilike.%${q}%`, {
        referencedTable: 'profiles',
      });
  }

  const { data, count, error } = await query;
  const requests = (data ?? []) as unknown as FundRequest[];

  if (error) console.error('admin applications query failed:', error.message);

  const total = count ?? requests.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const qs = (over: Record<string, string>) => {
    const p = new URLSearchParams();
    if (status !== 'all') p.set('status', status);
    if (fund !== 'all') p.set('fund', fund);
    if (q) p.set('q', q);
    Object.entries(over).forEach(([k, v]) => (v ? p.set(k, v) : p.delete(k)));
    const s = p.toString();
    return `/admin/requests${s ? `?${s}` : ''}`;
  };

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Applications</h1>
          <div className="crumb">
            {total} application{total === 1 ? '' : 's'}
            {status !== 'all' && ` · filtered by "${status}"`}
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <div className="toolbar" style={{ flex: 1 }}>
            <AdminSearch placeholder="Search reference, name or email…" basePath="/admin/requests" />
            <div className="chips">
              {TABS.map((t) => (
                <Link
                  key={t.key}
                  href={qs({ status: t.key === 'all' ? '' : t.key, page: '' })}
                  className={`chip ${status === t.key ? 'active' : ''}`}
                >
                  {t.label}
                </Link>
              ))}
            </div>
          </div>
        </div>

        {funds && funds.length > 0 && (
          <div
            className="panel-head"
            style={{ paddingTop: 12, paddingBottom: 12, borderBottom: '1px solid var(--border)' }}
          >
            <div className="chips">
              <Link href={qs({ fund: '', page: '' })} className={`chip ${fund === 'all' ? 'active' : ''}`}>
                All funds
              </Link>
              {funds.map((f) => (
                <Link
                  key={f.id}
                  href={qs({ fund: f.id, page: '' })}
                  className={`chip ${fund === f.id ? 'active' : ''}`}
                >
                  {f.name}
                </Link>
              ))}
            </div>
          </div>
        )}

        {requests.length === 0 ? (
          <div className="panel-body">
            <div className="empty">
              <div className="e-ico">
                <Icon name="search" />
              </div>
              <h3>{error ? 'Could not load applications' : 'No applications match'}</h3>
              <p>{error ? error.message : 'Try a different status, fund or search term.'}</p>
            </div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="grid">
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Member</th>
                  <th>Fund</th>
                  <th>Requested</th>
                  <th>Approved</th>
                  <th>Docs</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => (
                  <tr key={r.id}>
                    <td className="ref">{r.reference}</td>
                    <td>
                      <div className="who">
                        <div className="av">{initials(r.profiles?.full_name ?? '?')}</div>
                        <div>
                          <div className="wn">{r.profiles?.full_name}</div>
                          <div className="we">{r.profiles?.mobile}</div>
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
                    <td className="num" style={{ color: r.amount_approved ? 'var(--brand-2)' : 'var(--text-faint)' }}>
                      {r.amount_approved != null ? money(Number(r.amount_approved), false) : '—'}
                    </td>
                    <td style={{ color: 'var(--text-faint)' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        <Icon name="file" style={{ width: 14, height: 14 }} />
                        {r.request_attachments?.length ?? '·'}
                      </span>
                    </td>
                    <td>
                      <StatusBadge status={r.status} />
                    </td>
                    <td style={{ color: 'var(--text-faint)', fontSize: 12.5, whiteSpace: 'nowrap' }}>
                      {dateLabel(r.created_at)}
                    </td>
                    <td>
                      <Link className="rowlink" href={`/admin/requests/${r.id}`}>
                        Review
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pages > 1 && (
          <div className="pager">
            <span>
              Page {page} of {pages}
            </span>
            <div className="pbtns">
              {page > 1 ? (
                <Link href={qs({ page: String(page - 1) })} className="admin-btn ghost">
                  <Icon name="chevronLeft" />
                  Previous
                </Link>
              ) : (
                <button disabled>Previous</button>
              )}
              {page < pages ? (
                <Link href={qs({ page: String(page + 1) })} className="admin-btn ghost">
                  Next
                  <Icon name="chevronRight" />
                </Link>
              ) : (
                <button disabled>Next</button>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
