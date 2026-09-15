import { redirect } from 'next/navigation';
import ApplyProvider from '@/components/ApplyProvider';
import BottomNav from '@/components/BottomNav';
import PhoneShell from '@/components/PhoneShell';
import { createClient } from '@/lib/supabase/server';
import type { FundType, Profile } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function MemberLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
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
      <ApplyProvider profile={profile as Profile} funds={(funds ?? []) as FundType[]}>
        {children}
        <BottomNav />
      </ApplyProvider>
    </PhoneShell>
  );
}
