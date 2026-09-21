import { requirePage } from '@/lib/admin-guard';
import { can } from '@/lib/permissions';
import { columnReady } from '@/lib/schema';
import FileRequestPanel from '@/components/FileRequestPanel';
import Link from 'next/link';
import Icon from '@/components/Icon';
import AdminDateFilter from '@/components/AdminDateFilter';
import AdminPageSize from '@/components/AdminPageSize';
import AdminSearch from '@/components/AdminSearch';
import StatusBadge from '@/components/StatusBadge';
import { createClient } from '@/lib/supabase/server';
import { dateLabel, initials, money } from '@/lib/format';
import { DEFAULT_PAGE_SIZE, pageSizeOf } from '@/lib/pagination';
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

/** Pakistan has no daylight saving, so one fixed offset is exact all year. */
const PK_OFFSET = '+05:00';

/** Inclusive day boundaries, read the way the person typing them means them. */
const dayStart = (d: string) => `${d}T00:00:00.000${PK_OFFSET}`;
const dayEnd = (d: string) => `${d}T23:59:59.999${PK_OFFSET}`;
const isDate = (v: string | undefined): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

export default async function AdminRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    q?: string;
    fund?: string;
    page?: string;
    size?: string;
    from?: string;
    to?: string;
  }>;
}) {
  /*
   * This page was importing the guard without ever calling it, so every other
   * admin screen checked the level and this one — the one holding every
   * member's circumstances and the money asked for — did not. An Admin 1 or
   * Admin 2 who typed the address in was let straight through, because the
   * only check left was the layout's "is an administrator at all".
   */
  const level = await requirePage('view_requests');

  const sp = await searchParams;
  const status = sp.status && sp.status !== 'all' ? sp.status : 'all';
  const q = sp.q?.trim() ?? '';
  const fund = sp.fund ?? 'all';
  const dateFrom = isDate(sp.from) ? sp.from : '';
  const dateTo = isDate(sp.to) ? sp.to : '';
  const pageSize = pageSizeOf(sp.size);
  const wanted = Math.max(1, Number(sp.page ?? 1));

  const supabase = await createClient();

  const { data: funds } = await supabase
    .from('fund_types')
    .select('id, name, min_amount, max_amount, is_active')
    .order('sort_order');

  /*
   * The button waits for its migration. 0021 adds the column that records who
   * filed on whose behalf, and the insert policy that lets a master do it at
   * all; until both are there the endpoint would only refuse. Offering a
   * button that cannot work is worse than not offering it yet, and the moment
   * the SQL runs it appears without a redeploy.
   */
  const mayFile =
    can(level, 'file_requests') && (await columnReady(supabase, 'fund_requests', 'filed_by'));

  // A query that looks like a reference (SHF-26-01001) searches the reference
  // column; anything else searches the member via the joined profiles row.
  const looksLikeRef = /^(shf|\d)/i.test(q);

  const columns =
    q && !looksLikeRef
      ? '*, fund_types(*), request_attachments(id), profiles!fund_requests_user_id_fkey!inner(id, full_name, email, mobile, city, country)'
      : '*, fund_types(*), request_attachments(id), profiles!fund_requests_user_id_fkey(id, full_name, email, mobile, city, country)';

  /** Every filter in one place, so the count and the page can never disagree. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filtered = <T extends { eq: any; gte: any; lte: any; ilike: any; or: any }>(builder: T) => {
    let b: T = builder;
    if (status !== 'all') b = b.eq('status', status);
    if (fund !== 'all') b = b.eq('fund_type_id', fund);
    if (dateFrom) b = b.gte('created_at', dayStart(dateFrom));
    if (dateTo) b = b.lte('created_at', dayEnd(dateTo));
    if (q) {
      if (looksLikeRef) b = b.ilike('reference', `%${q}%`);
      else
        b = b.or(`full_name.ilike.%${q}%,email.ilike.%${q}%,mobile.ilike.%${q}%`, {
          referencedTable: 'profiles',
        });
    }
    return b;
  };

  // Count first. Asking Postgres for rows 50–74 of a 12-row result is an error,
  // not an empty page — and a shareable URL plus a rows-per-page control makes
  // landing past the end easy: narrow a filter while on page 3 and you are
  // there. Knowing the total up front means the page can simply be clamped.
  const { count } = await filtered(
    supabase.from('fund_requests').select(columns, { count: 'exact', head: true })
  );

  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(wanted, pages);
  const offset = (page - 1) * pageSize;

  const { data, error } = total
    ? await filtered(supabase.from('fund_requests').select(columns))
        .order('created_at', { ascending: false })
        .range(offset, offset + pageSize - 1)
    : { data: [], error: null };

  const requests = (data ?? []) as unknown as FundRequest[];

  if (error) console.error('admin applications query failed:', error.message);

  const firstRow = total === 0 ? 0 : offset + 1;
  const lastRow = Math.min(offset + requests.length, total);

  const qs = (over: Record<string, string>) => {
    const p = new URLSearchParams();
    if (status !== 'all') p.set('status', status);
    if (fund !== 'all') p.set('fund', fund);
    if (q) p.set('q', q);
    if (dateFrom) p.set('from', dateFrom);
    if (dateTo) p.set('to', dateTo);
    if (pageSize !== DEFAULT_PAGE_SIZE) p.set('size', String(pageSize));
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
            {status !== 'all' && ` · ${status}`}
            {fund !== 'all' && ` · ${funds?.find((f) => f.id === fund)?.name ?? fund}`}
            {(dateFrom || dateTo) &&
              ` · ${dateFrom ? dateLabel(dateFrom) : 'the beginning'} to ${dateTo ? dateLabel(dateTo) : 'today'}`}
          </div>
        </div>
        {/* Only the level that can decide an application may file one. */}
        {mayFile && (
          <FileRequestPanel
            funds={(funds ?? [])
              .filter((f) => f.is_active)
              .map((f) => ({
                id: f.id,
                name: f.name,
                min_amount: Number(f.min_amount),
                max_amount: f.max_amount === null ? null : Number(f.max_amount),
              }))}
          />
        )}
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

        <div
          className="panel-head"
          style={{ paddingTop: 12, paddingBottom: 12, borderBottom: '1px solid var(--border)' }}
        >
          <AdminDateFilter basePath="/admin/requests" />
        </div>

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

        {/* Always on: it carries the count and the rows-per-page control, both
            useful long before there is a second page to turn to. */}
        {total > 0 && (
          <div className="pager">
            <span>
              Showing <strong className="num">{firstRow}</strong>–
              <strong className="num">{lastRow}</strong> of{' '}
              <strong className="num">{total}</strong>
              {pages > 1 && ` · page ${page} of ${pages}`}
            </span>
            <AdminPageSize basePath="/admin/requests" value={pageSize} />
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
