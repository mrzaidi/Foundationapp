import { requirePage } from '@/lib/admin-guard';
import AccountsLedger from '@/components/AccountsLedger';
import CategoryBalances from '@/components/CategoryBalances';

export const dynamic = 'force-dynamic';

/**
 * The account book.
 *
 * Budget answers "what may we spend this month". This answers the question a
 * treasurer is actually asked at a committee meeting: what did we start with,
 * what came in, what went out, and what is left — line by line, with a running
 * balance, so any figure on the screen can be traced to the movement that
 * produced it.
 *
 * The balance carries from month to month by construction rather than by a
 * job that moves it: see migration 0017.
 */
export default async function AdminAccountsPage() {
  await requirePage('view_accounts');

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Accounts</h1>
          <div className="crumb">Money in, money out, and what carries forward</div>
        </div>
      </div>

      <AccountsLedger />

      <CategoryBalances />
    </>
  );
}
