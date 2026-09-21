import { redirect } from 'next/navigation';
import ProfileView from '@/components/ProfileView';
import { currentSession } from '@/lib/session';
import { rowHasBankColumns } from '@/lib/bank-schema';
import type { Profile } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const { supabase, user } = await currentSession();
  if (!user) redirect('/login');

  const [{ data: profile }, { count: total }, { data: transferred }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase
      .from('fund_requests')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id),
    supabase
      .from('fund_requests')
      .select('amount_approved, amount_requested')
      .eq('user_id', user.id)
      .eq('status', 'transferred'),
  ]);

  if (!profile) redirect('/login');

  const received = (transferred ?? []).reduce(
    (sum, r) => sum + Number(r.amount_approved ?? r.amount_requested),
    0
  );

  return (
    <ProfileView
      profile={profile as Profile}
      totalRequests={total ?? 0}
      totalReceived={received}
      bankEnabled={rowHasBankColumns(profile)}
    />
  );
}
