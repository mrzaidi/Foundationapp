import { redirect } from 'next/navigation';
import Dashboard from '@/components/Dashboard';
import { createClient } from '@/lib/supabase/server';
import type { FundRequest, FundType, Profile } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ apply?: string }>;
}) {
  const { apply } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [{ data: profile }, { data: funds }, { data: requests }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase.from('fund_types').select('*').eq('is_active', true).order('sort_order'),
    supabase
      .from('fund_requests')
      .select('*, fund_types(*)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),
  ]);

  // Profile row missing (e.g. user created straight in Supabase) — send them
  // back through registration rather than rendering a broken dashboard.
  if (!profile) redirect('/login?next=/');

  return (
    <Dashboard
      profile={profile as Profile}
      funds={(funds ?? []) as FundType[]}
      requests={(requests ?? []) as FundRequest[]}
      autoOpen={apply === '1'}
    />
  );
}
