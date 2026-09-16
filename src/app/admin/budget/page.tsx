import { requirePage } from '@/lib/admin-guard';
import BudgetPanel from '@/components/BudgetPanel';
import MonthlyStatement from '@/components/MonthlyStatement';

export const dynamic = 'force-dynamic';

export default async function AdminBudgetPage() {
  const level = await requirePage('view_budget');

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Budget</h1>
          <div className="crumb">
            What the foundation can give away each month, and what is left after transfers
          </div>
        </div>
      </div>

      <BudgetPanel />

      <MonthlyStatement />

      <div className="panel mt-24">
        <div className="panel-head">
          <div>
            <h2>How the balance is worked out</h2>
            <div className="ph-sub">Derived, never stored</div>
          </div>
        </div>
        <div className="panel-body">
          <p className="muted" style={{ marginTop: 0 }}>
            The month&rsquo;s fund is <strong>the donations recorded against that month</strong>, and
            remaining is that <strong>minus everything transferred in it</strong>. Both are computed
            from the rows themselves, so there is no running total to fall out of step: correct a
            donation or a transfer and the balance corrects with it.
          </p>
          <div className="note">
            The fund cannot be typed in. A figure somebody set was a promise, and the committee was
            spending against it — the only way it goes up is a donor actually giving. A transfer that would take the month past the fund is refused outright — by the database
            itself, not just by this screen.
          </div>
        </div>
      </div>
    </>
  );
}
