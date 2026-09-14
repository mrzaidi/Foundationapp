import Icon from '@/components/Icon';
import { createClient } from '@/lib/supabase/server';
import { money } from '@/lib/format';
import type { FundType } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function AdminFundsPage() {
  const supabase = await createClient();

  const [{ data: fundsData }, { data: reqRows }] = await Promise.all([
    supabase.from('fund_types').select('*').order('sort_order'),
    supabase.from('fund_requests').select('fund_type_id, status, amount_requested, amount_approved'),
  ]);

  const funds = (fundsData ?? []) as FundType[];
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
              <div className="kv">
                <span className="k">Visible to members</span>
                <span className={`badge ${f.is_active ? 'b-accepted' : 'b-rejected'}`}>
                  {f.is_active ? 'Active' : 'Hidden'}
                </span>
              </div>
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
            Adding a fifth fund, renaming one, changing its limits or hiding it from the dashboard is
            an edit to the <code>fund_types</code> table in Supabase — no deploy needed. Each row
            carries its own gradient class, icon name, Urdu copy and whether a document is required.
          </p>
          <div className="note">
            Gradients available: <code>g-brand</code>, <code>g-rose</code>, <code>g-amber</code>,{' '}
            <code>g-blue</code>, <code>g-plum</code>, <code>g-gold</code>. Icons:{' '}
            <code>calendar</code>, <code>health</code>, <code>basket</code>, <code>bolt</code>,{' '}
            <code>heart</code>, <code>wallet</code>, <code>building</code>.
          </div>
        </div>
      </div>
    </>
  );
}
