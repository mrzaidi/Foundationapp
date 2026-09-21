import { redirect } from 'next/navigation';
import ApplyProvider from '@/components/ApplyProvider';
import BottomNav from '@/components/BottomNav';
import MemberAssistant from '@/components/MemberAssistant';
import PhoneShell from '@/components/PhoneShell';
import { currentSession } from '@/lib/session';
import { rowHasBankColumns } from '@/lib/bank-schema';
import type { FundType, Profile } from '@/lib/types';

// Deliberately NOT force-dynamic. Reading cookies already makes this dynamic,
// and forcing it made Next re-run both queries on every navigation *before*
// loading.tsx could paint — the tab bar responded, then nothing happened for a
// beat, then the loader appeared. The layout is the same on every member
// screen, so it should be rendered once and kept.

export default async function MemberLayout({ children }: { children: React.ReactNode }) {
  const { supabase, user } = await currentSession();
  if (!user) redirect('/login');

  // The apply flow lives beside the navigation rather than inside a page, so
  // the "+" button opens it instantly from Requests, Help and Profile too.
  const [{ data: profile }, { data: funds }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase.from('fund_types').select('*').eq('is_active', true).order('sort_order'),
  ]);

  if (!profile) redirect('/login?next=/');

  return (
    <PhoneShell>
      <ApplyProvider
        profile={profile as Profile}
        funds={(funds ?? []) as FundType[]}
        bankEnabled={rowHasBankColumns(profile)}
      >
        {children}
        {/* Beside the navigation rather than on a page, so it can be asked a
            question from wherever the member happens to be. */}
        <MemberAssistant profile={profile as Profile} />
        <BottomNav />
      </ApplyProvider>
    </PhoneShell>
  );
}
