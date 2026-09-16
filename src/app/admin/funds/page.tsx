import { requirePage } from '@/lib/admin-guard';
import { can } from '@/lib/permissions';
import FundEditor from '@/components/FundEditor';
import Icon from '@/components/Icon';
import { rowHasColumn } from '@/lib/schema';
import { createClient } from '@/lib/supabase/server';
import { money } from '@/lib/format';
import type { FundType } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function AdminFundsPage() {
  const level = await requirePage('view_funds');

  const supabase = await createClient();

  const [{ data: fundsData }, { data: reqRows }] = await Promise.all([
    supabase.from('fund_types').select('*').order('sort_order'),
    supabase.from('fund_requests').select('fund_type_id, status, amount_requested, amount_approved'),
  ]);

  const funds = (fundsData ?? []) as FundType[];
  // False until 0009 has run; the editor hides the toggle rather than
  // offering a switch that silently does not save.
  const recurringReady = rowHasColumn(fundsData?.[0], 'is_recurring');
  const rows = reqRows ?? [];

  const stats = new Map<string, { count: number; open: number; paid: number }>();
  for (const r of rows) {
    const e = stats.get(r.fund_type_id) ?? { count: 0, open: 0, paid: 0 };
    e.count += 1;
    if (r.status === 'requested' || r.status === 'review') e.open += 1;
    if (r.status === 'transferred') e.paid += Number(r.amount_approved ?? r.amount_requested);
    stats.set(r.fund_type_id, e);
  }

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Funds</h1>
          <div className="crumb">
            The options members see on their dashboard, and how each one is performing
          </div>
        </div>
      </div>

      <div className="kpis" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
        {funds.map((f) => {
          const s = stats.get(f.id) ?? { count: 0, open: 0, paid: 0 };
          return (
            <div className="kpi" key={f.id}>
              <div className={`kico ${f.gradient}`}>
                <Icon name={f.icon} />
              </div>
              <div style={{ fontSize: 16, fontWeight: 750, letterSpacing: '-.2px' }}>{f.name}</div>
              <div
                style={{ fontSize: 13, color: 'var(--text-dim)', marginTop: 4, lineHeight: 1.5 }}
                lang="ur"
                dir="rtl"
              >
                {f.name_ur}
              </div>
              <p style={{ fontSize: 12.5, color: 'var(--text-dim)', margin: '10px 0 14px', lineHeight: 1.55 }}>
                {f.description}
              </p>

              <div className="kv">
                <span className="k">Applications</span>
                <span className="v num">{s.count}</span>
              </div>
              <div className="kv">
                <span className="k">Awaiting decision</span>
                <span className="v num" style={{ color: s.open ? 'var(--st-review)' : undefined }}>
                  {s.open}
                </span>
              </div>
              <div className="kv">
                <span className="k">Disbursed</span>
                <span className="v num">{money(s.paid)}</span>
              </div>
              <div className="kv">
                <span className="k">Range</span>
                <span className="v num">
                  {money(Number(f.min_amount), false)} –{' '}
                  {f.max_amount ? money(Number(f.max_amount), false) : '∞'}
                </span>
              </div>
              <div className="kv">
                <span className="k">Document</span>
                <span className="v">{f.document_required ? 'Required' : 'Optional'}</span>
              </div>
              {recurringReady && (
                <div className="kv">
                  <span className="k">Recurs monthly</span>
                  <span className="v">
                    {f.is_recurring ? 'Yes — approval enrols the member' : 'No'}
                  </span>
                </div>
              )}
              <div className="kv">
                <span className="k">Visible to members</span>
                <span className={`badge ${f.is_active ? 'b-accepted' : 'b-rejected'}`}>
                  {f.is_active ? 'Active' : 'Hidden'}
                </span>
              </div>
              {can(level, 'edit_funds') && (
                <FundEditor fund={f} recurringReady={recurringReady} />
              )}
              <div className="kedge" />
            </div>
          );
        })}
      </div>

      <div className="panel mt-24">
        <div className="panel-head">
          <div>
            <h2>Editing funds</h2>
            <div className="ph-sub">Funds are rows, not code</div>
          </div>
        </div>
        <div className="panel-body">
          <p className="muted" style={{ marginTop: 0 }}>
            <strong>Edit</strong> on any card changes its name, description, amount range, colour,
            icon, whether a document is required and whether members can see it at all — in both
            English and Urdu. Changes are live on the member dashboard immediately; nothing is
            deployed and nothing is cached.
          </p>
          <div className="note">
            A fund&apos;s id cannot be changed here — every application ever filed points at it.
            <em> Adding</em> a whole new fund is still an insert into <code>fund_types</code>: give
            it an id, a name, a gradient class and an icon name, and it appears on the dashboard.
          </div>
        </div>
      </div>
    </>
  );
}
