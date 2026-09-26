import { requirePage } from '@/lib/admin-guard';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import FamilyDetails from '@/components/FamilyDetails';
import Icon from '@/components/Icon';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * One household.
 *
 * Families and Members are separate sections and this page says nothing about
 * the member: no name, no contact details, no way through to their record. The
 * household is the subject, and the head of the family is who it is called
 * after — the member row underneath is only how the record is keyed.
 */
export default async function AdminFamilyPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePage('view_members');

  const { id } = await params;
  const supabase = await createClient();

  // Only enough to know the household exists and is not an administrator's.
  // The name on the row is deliberately not read: this page shows what the
  // foundation has recorded about the household, and nothing about the member.
  const { data: owner } = await supabase
    .from('profiles')
    .select('id, city, role')
    .eq('id', id)
    .single();

  if (!owner || owner.role === 'admin') notFound();

  const { data: family } = await supabase
    .from('family_details')
    .select('head_name')
    .eq('user_id', id)
    .maybeSingle();

  const head = family?.head_name?.trim() ?? '';

  return (
    <>
      <div className="topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Link href="/admin/families" className="admin-btn ghost" aria-label="Back to families">
            <Icon name="chevronLeft" />
          </Link>
          <div>
            <h1>{head || 'Household'}</h1>
            <div className="crumb">
              {head ? 'Head of the family' : 'No head recorded yet'}
              {owner.city ? ` · ${owner.city}` : ''}
            </div>
          </div>
        </div>
      </div>

      <FamilyDetails userId={id} headName={head} />
    </>
  );
}
