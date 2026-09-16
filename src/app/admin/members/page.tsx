import { Suspense } from 'react';
import Link from 'next/link';
import AdminSearch from '@/components/AdminSearch';
import NewMemberButton from '@/components/NewMemberButton';
import Icon from '@/components/Icon';
import { createClient } from '@/lib/supabase/server';
import { dateLabel, initials } from '@/lib/format';
import type { Profile } from '@/lib/types';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 30;

export default async function AdminMembersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; role?: string }>;
}) {
  const sp = await searchParams;
  const q = sp.q?.trim() ?? '';
  const role = sp.role ?? 'all';
  const page = Math.max(1, Number(sp.page ?? 1));
  const from = (page - 1) * PAGE_SIZE;

  const supabase = await createClient();

  let query = supabase
    .from('profiles')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, from + PAGE_SIZE - 1);

  if (role !== 'all') query = query.eq('role', role);
  if (q) query = query.or(`full_name.ilike.%${q}%,email.ilike.%${q}%,mobile.ilike.%${q}%`);

  const { data, count } = await query;
  const members = (data ?? []) as Profile[];
  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Request counts per member, for the list.
  const ids = members.map((m) => m.id);
  const { data: reqRows } = ids.length
    ? await supabase.from('fund_requests').select('user_id, status').in('user_id', ids)
    : { data: [] as { user_id: string; status: string }[] };

  const byMember = new Map<string, { total: number; open: number }>();
  for (const row of reqRows ?? []) {
    const e = byMember.get(row.user_id) ?? { total: 0, open: 0 };
    e.total += 1;
    if (row.status === 'requested' || row.status === 'review') e.open += 1;
    byMember.set(row.user_id, e);
  }

  const qs = (over: Record<string, string>) => {
    const p = new URLSearchParams();
    if (q) p.set('q', q);
    if (role !== 'all') p.set('role', role);
    Object.entries(over).forEach(([k, v]) => (v ? p.set(k, v) : p.delete(k)));
    const s = p.toString();
    return `/admin/members${s ? `?${s}` : ''}`;
  };

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Members</h1>
          <div className="crumb">
            {total} registered {total === 1 ? 'account' : 'accounts'}
            {q && ` · matching “${q}”`}
            {role !== 'all' && ` · ${role}s only`}
          </div>
        </div>

        <div className="toolbar" style={{ gap: 8 }}>
        <NewMemberButton />

        {/* Exports whatever the filters currently show, not just this page. */}
        <a
          className="admin-btn"
          href={`/api/admin/members/export${
            q || role !== 'all'
              ? `?${new URLSearchParams({
                  ...(q ? { q } : {}),
                  ...(role !== 'all' ? { role } : {}),
                }).toString()}`
              : ''
          }`}
          download
        >
          <Icon name="download" />
          Export to Excel
        </a>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <div className="toolbar" style={{ flex: 1 }}>
            <Suspense fallback={<div className="search" />}>
              <AdminSearch placeholder="Search name, email or mobile…" basePath="/admin/members" />
            </Suspense>
            <div className="chips">
              {[
                { k: 'all', l: 'Everyone' },
                { k: 'member', l: 'Members' },
                { k: 'admin', l: 'Administrators' },
              ].map((t) => (
                <Link
                  key={t.k}
                  href={qs({ role: t.k === 'all' ? '' : t.k, page: '' })}
                  className={`chip ${role === t.k ? 'active' : ''}`}
                >
                  {t.l}
                </Link>
              ))}
            </div>
          </div>
        </div>

        {members.length === 0 ? (
          <div className="panel-body">
            <div className="empty">
              <div className="e-ico">
                <Icon name="users" />
              </div>
              <h3>No members found</h3>
              <p>Accounts created through the app&apos;s registration flow appear here.</p>
            </div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="grid">
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Contact</th>
                  <th>Location</th>
                  <th>Age / Gender</th>
                  <th>CNIC</th>
                  <th>Applications</th>
                  <th>Joined</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {members.map((m) => {
                  const counts = byMember.get(m.id) ?? { total: 0, open: 0 };
                  return (
                    <tr key={m.id}>
                      <td>
                        <div className="who">
                          <div className="av">{initials(m.full_name)}</div>
                          <div>
                            <div className="wn">
                              {m.full_name}
                              {m.role === 'admin' && (
                                <span className="badge b-transferred" style={{ marginLeft: 8 }}>
                                  Admin
                                </span>
                              )}
                              {m.is_blocked && (
                                <span className="badge b-rejected" style={{ marginLeft: 8 }}>
                                  Blocked
                                </span>
                              )}
                            </div>
                            <div className="we">{m.email}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ fontSize: 12.5 }}>{m.mobile}</td>
                      <td style={{ fontSize: 12.5 }}>
                        {m.city}, {m.country}
                      </td>
                      <td style={{ fontSize: 12.5, textTransform: 'capitalize' }}>
                        {m.age} · {m.gender}
                      </td>
                      <td>
                        {m.nic_path ? (
                          <span className="badge b-accepted">On file</span>
                        ) : (
                          <span className="badge b-review">Missing</span>
                        )}
                      </td>
                      <td className="num">
                        {counts.total}
                        {counts.open > 0 && (
                          <span
                            style={{
                              marginLeft: 6,
                              fontSize: 11,
                              color: 'var(--st-review)',
                              fontWeight: 700,
                            }}
                          >
                            ({counts.open} open)
                          </span>
                        )}
                      </td>
                      <td style={{ color: 'var(--text-faint)', fontSize: 12.5, whiteSpace: 'nowrap' }}>
                        {dateLabel(m.created_at)}
                      </td>
                      <td>
                        <Link className="rowlink" href={`/admin/members/${m.id}`}>
                          Open
                        </Link>
                      </td>
                    </tr>
                  );
                })}
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
