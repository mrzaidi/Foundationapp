import { requirePage } from '@/lib/admin-guard';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import FamilyDetails from '@/components/FamilyDetails';
import DeleteFamilyButton from '@/components/DeleteFamilyButton';
import Icon from '@/components/Icon';
import { createClient } from '@/lib/supabase/server';
import { dateLabel } from '@/lib/format';

export const dynamic = 'force-dynamic';

/**
 * One household.
 *
 * It stands on its own: no member behind it, nothing here about one. The head
 * of the family is who the record is called after, and the rest is whatever
 * the office has managed to write down so far.
 */
export default async function AdminFamilyPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePage('view_members');

  const { id } = await params;
  const supabase = await createClient();

  const { data: family } = await supabase
    .from('families')
    .select('id, head_name, city, contact, created_at')
    .eq('id', id)
    .maybeSingle();

  if (!family) notFound();

  return (
    <>
      <div className="topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Link href="/admin/families" className="admin-btn ghost" aria-label="Back to families">
            <Icon name="chevronLeft" />
          </Link>
          <div>
            <h1>{family.head_name}</h1>
            <div className="crumb">
              Head of the family
              {family.city ? ` · ${family.city}` : ''}
              {family.contact ? ` · ${family.contact}` : ''}
              {family.created_at ? ` · added ${dateLabel(family.created_at)}` : ''}
            </div>
          </div>
        </div>
        <DeleteFamilyButton familyId={family.id} headName={family.head_name} />
      </div>

      <FamilyDetails familyId={family.id} headName={family.head_name} />
    </>
  );
}
