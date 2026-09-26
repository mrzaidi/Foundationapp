import { requirePage } from '@/lib/admin-guard';
import Link from 'next/link';
import AdminSearch from '@/components/AdminSearch';
import Icon from '@/components/Icon';
import { createClient } from '@/lib/supabase/server';
import { dateLabel, initials, money } from '@/lib/format';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 30;

interface Row {
  id: string;
  head: string | null;
  city: string | null;
  total_members: number | null;
  male_count: number | null;
  female_count: number | null;
  monthly_income: number | null;
  monthly_expense: number | null;
  house_type: 'own' | 'rent' | null;
  updated_at: string | null;
  recorded: boolean;
}

/**
 * Households.
 *
 * The committee decides on a household, not on a name: how many people live on
 * that income, what the rent and the bills come to. That was only reachable by
 * opening whichever member happened to be the point of contact, so this is its
 * own place, with the whole roll in it — including the households nobody has
 * written down yet, because that gap is the thing staff need to see.
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

  const supabase = await createClient();

  const { data, error } = await supabase.rpc('families', {
    p_query: q,
    p_limit: PAGE_SIZE,
    p_offset: (wanted - 1) * PAGE_SIZE,
  });

  // The function arrives with migration 0022; until it runs, say so plainly
  // rather than showing a Postgres error on a screen staff are trying to use.
  const missing = Boolean(error && /families|schema cache|does not exist/i.test(error.message));

  const result = (data ?? null) as {
    total?: number;
    recorded?: number;
    rows?: Row[];
  } | null;

  const rows = result?.rows ?? [];
  const total = result?.total ?? 0;
  const recorded = result?.recorded ?? 0;
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
                {recorded} of {total} household{total === 1 ? '' : 's'} recorded
              </>
            )}
          </div>
        </div>
      </div>

      {missing && (
        <div className="panel">
          <div className="panel-body">
            <div className="empty">
              <div className="e-ico">
                <Icon name="home" />
              </div>
              <h3>Households need migration 0022</h3>
              <p>
                Run <code>supabase/migrations/0022_families.sql</code>, then this page picks the
                households up on its own — no redeploy.
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
                <h3>{q ? 'No household by that name' : 'No members yet'}</h3>
                <p>
                  {q
                    ? 'The search looks at the head of the family. A household nobody has written down yet can still be found by the name it was registered under.'
                    : 'Households appear here as soon as there are people to record them for.'}
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
                      <th>People</th>
                      <th>Monthly income</th>
                      <th>Home</th>
                      <th>Recorded</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} className={r.recorded ? '' : 'row-off'}>
                        <td>
                          <div className="who">
                            <div className="av">{r.head ? initials(r.head) : '—'}</div>
                            <div>
                              {r.head ? (
                                <div className="wn">{r.head}</div>
                              ) : (
                                <div className="gift-none">No head recorded yet</div>
                              )}
                              {r.city && <div className="we">{r.city}</div>}
                            </div>
                          </div>
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
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {r.recorded ? (
                            <span className="gift-top">
                              <span className="gift-count">{dateLabel(r.updated_at ?? '')}</span>
                            </span>
                          ) : (
                            <span className="gift-none">Not recorded</span>
                          )}
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
