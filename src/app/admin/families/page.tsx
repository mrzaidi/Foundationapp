import { requirePage } from '@/lib/admin-guard';
import Link from 'next/link';
import AdminSearch from '@/components/AdminSearch';
import NewFamilyButton from '@/components/NewFamilyButton';
import Icon from '@/components/Icon';
import { createClient } from '@/lib/supabase/server';
import { dateLabel, initials, money } from '@/lib/format';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 30;

interface Row {
  id: string;
  head_name: string;
  city: string | null;
  contact: string | null;
  total_members: number | null;
  male_count: number | null;
  female_count: number | null;
  monthly_income: number | null;
  monthly_expense: number | null;
  house_type: 'own' | 'rent' | null;
  updated_at: string | null;
}

/**
 * Households.
 *
 * Each one stands on its own, identified by the head of the family rather than
 * by a registered member — see migration 0023. One can be started here at any
 * time, for a family the office has met but who has never signed up.
 */
export default async function AdminFamiliesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  await requirePage('view_members');

  const sp = await searchParams;
  const q = sp.q?.trim() ?? '';
  const wanted = Math.max(1, Number(sp.page ?? 1));
  const from = (wanted - 1) * PAGE_SIZE;

  const supabase = await createClient();

  let query = supabase
    .from('families')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, from + PAGE_SIZE - 1);

  // One column, matched by the client rather than pasted into a filter string,
  // so a name with a comma or a bracket in it searches for itself.
  if (q) query = query.ilike('head_name', `%${q}%`);

  const { data, count, error } = await query;

  // The table arrives with migration 0023; until it runs, say so plainly
  // rather than showing a Postgres error on a screen staff are trying to use.
  const missing = Boolean(error && /families|schema cache|does not exist/i.test(error.message));

  const rows = (data ?? []) as Row[];
  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(wanted, pages);

  const qs = (over: Record<string, string>) => {
    const p = new URLSearchParams();
    if (q) p.set('q', q);
    if (page > 1) p.set('page', String(page));
    Object.entries(over).forEach(([k, v]) => (v ? p.set(k, v) : p.delete(k)));
    const s = p.toString();
    return `/admin/families${s ? `?${s}` : ''}`;
  };

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Families</h1>
          <div className="crumb">
            {q ? (
              <>
                {total} household{total === 1 ? '' : 's'} matching &ldquo;{q}&rdquo;
              </>
            ) : (
              <>
                {total} household{total === 1 ? '' : 's'} on file
              </>
            )}
          </div>
        </div>
        {!missing && <NewFamilyButton />}
      </div>

      {missing && (
        <div className="panel">
          <div className="panel-body">
            <div className="empty">
              <div className="e-ico">
                <Icon name="home" />
              </div>
              <h3>Households need migration 0023</h3>
              <p>
                Run <code>supabase/migrations/0023_standalone_families.sql</code>, then this page
                picks the households up on its own — no redeploy.
              </p>
            </div>
          </div>
        </div>
      )}

      {!missing && (
        <div className="panel">
          <div className="panel-head">
            <div className="toolbar" style={{ flex: 1 }}>
              <AdminSearch
                placeholder="Search by head of the family…"
                basePath="/admin/families"
              />
            </div>
          </div>

          {rows.length === 0 && (
            <div className="panel-body">
              <div className="empty">
                <div className="e-ico">
                  <Icon name="home" />
                </div>
                <h3>{q ? 'No household by that name' : 'No households yet'}</h3>
                <p>
                  {q
                    ? 'The search looks at the head of the family.'
                    : 'Add the first one — a household does not need a registered member behind it.'}
                </p>
              </div>
            </div>
          )}

          {rows.length > 0 && (
            <>
              <div style={{ overflowX: 'auto' }}>
                <table className="grid">
                  <thead>
                    <tr>
                      <th>Head of the family</th>
                      <th>Contact</th>
                      <th>People</th>
                      <th>Monthly income</th>
                      <th>Home</th>
                      <th>Updated</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id}>
                        <td>
                          <div className="who">
                            <div className="av">{initials(r.head_name)}</div>
                            <div>
                              <div className="wn">{r.head_name}</div>
                              {r.city && <div className="we">{r.city}</div>}
                            </div>
                          </div>
                        </td>
                        <td style={{ color: 'var(--text-faint)', fontSize: 12.5 }} dir="ltr">
                          {r.contact || '—'}
                        </td>
                        <td className="num">
                          {r.total_members ?? '—'}
                          {(r.male_count !== null || r.female_count !== null) && (
                            <div style={{ color: 'var(--text-faint)', fontSize: 11.5 }}>
                              {r.male_count ?? 0}m · {r.female_count ?? 0}f
                            </div>
                          )}
                        </td>
                        <td className="num">
                          {r.monthly_income === null ? '—' : money(Number(r.monthly_income), false)}
                          {r.monthly_expense !== null && (
                            <div style={{ color: 'var(--text-faint)', fontSize: 11.5 }}>
                              out {money(Number(r.monthly_expense), false)}
                            </div>
                          )}
                        </td>
                        <td style={{ fontSize: 13, color: 'var(--text-dim)' }}>
                          {r.house_type === 'own'
                            ? 'Own'
                            : r.house_type === 'rent'
                              ? 'Rented'
                              : '—'}
                        </td>
                        <td
                          style={{ color: 'var(--text-faint)', fontSize: 12.5, whiteSpace: 'nowrap' }}
                        >
                          {r.updated_at ? dateLabel(r.updated_at) : '—'}
                        </td>
                        <td>
                          <Link className="admin-btn ghost small" href={`/admin/families/${r.id}`}>
                            View
                            <Icon name="chevronRight" />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="pager">
                <span>
                  Page <strong className="num">{page}</strong> of{' '}
                  <strong className="num">{pages}</strong> · {total} household
                  {total === 1 ? '' : 's'}
                </span>
                <span style={{ display: 'flex', gap: 10 }}>
                  {page > 1 && (
                    <Link href={qs({ page: String(page - 1) })} className="admin-btn ghost">
                      <Icon name="chevronLeft" />
                      Previous
                    </Link>
                  )}
                  {page < pages && (
                    <Link href={qs({ page: String(page + 1) })} className="admin-btn ghost">
                      Next
                      <Icon name="chevronRight" />
                    </Link>
                  )}
                </span>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
