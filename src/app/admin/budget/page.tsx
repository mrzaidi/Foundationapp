import BudgetPanel from '@/components/BudgetPanel';

export const dynamic = 'force-dynamic';

export default function AdminBudgetPage() {
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

      <div className="panel mt-24">
        <div className="panel-head">
          <div>
            <h2>How the balance is worked out</h2>
            <div className="ph-sub">Derived, never stored</div>
          </div>
        </div>
        <div className="panel-body">
          <p className="muted" style={{ marginTop: 0 }}>
            Remaining is always <strong>budget − everything transferred in that month</strong>,
            computed from the transfers themselves. There is no running total to fall out of step:
            correct a transfer and the balance corrects with it.
          </p>
          <div className="note">
            A transfer that would take the month over budget is still allowed — the portal warns,
            it does not block. Say the word if you would rather it refused.
          </div>
        </div>
      </div>
    </>
  );
}
