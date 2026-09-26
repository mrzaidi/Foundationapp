import { requirePage } from '@/lib/admin-guard';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import FamilyDetails from '@/components/FamilyDetails';
import Icon from '@/components/Icon';
import { createClient } from '@/lib/supabase/server';
import { initials } from '@/lib/format';

export const dynamic = 'force-dynamic';

/**
 * One household.
 *
 * The record belongs to the member it is keyed on, so the page names them and
 * links back to their own record — but the household is the subject here, and
 * it has the page to itself rather than sitting at the bottom of somebody's
 * profile.
 */
export default async function AdminFamilyPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePage('view_members');

  const { id } = await params;
  const supabase = await createClient();

  const { data: member } = await supabase
    .from('profiles')
    .select('id, full_name, email, mobile, city, country, role')
    .eq('id', id)
    .single();

  if (!member || member.role === 'admin') notFound();

  return (
    <>
      <div className="topbar">
        <div>
          <div className="crumb">
            <Link href="/admin/families">Families</Link>
          </div>
          <h1>{member.full_name}&rsquo;s household</h1>
        </div>
        <Link className="admin-btn ghost" href={`/admin/members/${member.id}`}>
          <Icon name="user" />
          The member&rsquo;s record
        </Link>
      </div>

      <div className="panel">
        <div className="panel-head">
          <div className="who">
            <div className="av">{initials(member.full_name ?? '?')}</div>
            <div>
              <div className="wn">{member.full_name}</div>
              <div className="we">
                {[member.city, member.country].filter(Boolean).join(', ') || 'No address on file'}
              </div>
            </div>
          </div>
          <div style={{ textAlign: 'right', fontSize: 12.5, color: 'var(--text-faint)' }} dir="ltr">
            {member.mobile ?? '—'}
            {member.email && <div>{member.email}</div>}
          </div>
        </div>
      </div>

      <FamilyDetails userId={member.id} memberName={member.full_name ?? 'This member'} />
    </>
  );
}
