import Link from 'next/link';
import { requirePage } from '@/lib/admin-guard';
import DonorDetail from '@/components/DonorDetail';
import Icon from '@/components/Icon';

export const dynamic = 'force-dynamic';

/**
 * One donor's own page.
 *
 * The list used to carry a donor's whole giving history inside a table cell —
 * every gift, its kind, its receipt and a remove button — which made a page of
 * records try to be a page of detail at the same time. This is the detail; the
 * list is a list again.
 */
export default async function DonorPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePage('view_donors');
  const { id } = await params;

  return (
    <>
      <div className="topbar">
        <div>
          <Link className="rowlink" href="/admin/donors">
            <Icon name="chevronLeft" />
            All donors
          </Link>
          <h1>Donor</h1>
          <div className="crumb">Everything this donor has given, and when</div>
        </div>
      </div>

      <DonorDetail id={id} />
    </>
  );
}
