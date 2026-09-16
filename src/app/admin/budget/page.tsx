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

    </>
  );
}
