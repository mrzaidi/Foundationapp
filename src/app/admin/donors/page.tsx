import DonorCharts from '@/components/charts/DonorCharts';
import DonorPanel from '@/components/DonorPanel';

export const dynamic = 'force-dynamic';

/**
 * Donors, on their own.
 *
 * They used to sit inside Budget, which made two different jobs share one
 * screen: what the committee may spend, and who paid for it. Separating them
 * also draws the line that access control needs — somebody can be trusted with
 * the month's balance without being handed a list of named givers and what
 * each of them gave.
 */
export default function AdminDonorsPage() {
  return (
    <>
      <div className="topbar">
        <div>
          <h1>Donors</h1>
          <div className="crumb">Who gives, how much, and where it goes</div>
        </div>
      </div>

      <DonorPanel />

      <DonorCharts />
    </>
  );
}
