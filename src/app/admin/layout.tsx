import { redirect } from 'next/navigation';
import { RatesProvider } from '@/components/Fx';
import AdminAssistant from '@/components/AdminAssistant';
import AdminSidebar from '@/components/AdminSidebar';
import { levelOf } from '@/lib/permissions';
import { columnReady } from '@/lib/schema';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/admin');

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  // Middleware already guards this, but a direct render should never leak.
  if (profile?.role !== 'admin') redirect('/');

  /*
   * Which kind of administrator. Absent until migration 0015 lands, in which
   * case everyone is a master — exactly what they were before levels existed,
   * so a deploy that outruns the SQL changes nobody's access.
   */
  const levelled = await columnReady(supabase, 'profiles', 'admin_level');
  const level = levelOf('admin', levelled ? (profile.admin_level as string | null) : null);

  const { count: pending } = await supabase
    .from('fund_requests')
    .select('*', { count: 'exact', head: true })
    .in('status', ['requested', 'review']);

  return (
    // One rate lookup per admin screen, shared by every amount on it.
    <RatesProvider>
      <div className="admin-body">
        <div className="admin-shell">
          <AdminSidebar
            name={profile.full_name}
            email={profile.email}
            pending={pending ?? 0}
            level={level}
          />
          <main className="main">{children}</main>
        </div>
        <AdminAssistant />
      </div>
    </RatesProvider>
  );
}
