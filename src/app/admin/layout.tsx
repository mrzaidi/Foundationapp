import { redirect } from 'next/navigation';
import { RatesProvider } from '@/components/Fx';
import AdminAssistant from '@/components/AdminAssistant';
import AdminSidebar from '@/components/AdminSidebar';
import { adminIdentity } from '@/lib/admin-guard';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  /*
   * The same lookup the page inside this layout is about to make, so it is
   * made once and shared. Middleware already guards the area, but a direct
   * render should never leak, and which kind of administrator somebody is
   * comes back with it — including the case where migration 0015 has not
   * landed and everyone is a master, exactly as they were before levels
   * existed.
   */
  const { supabase, signedIn, identity } = await adminIdentity();
  if (!signedIn) redirect('/login?next=/admin');
  if (!identity) redirect('/');

  const { profile, grant } = identity;

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
            name={profile.full_name ?? 'Administrator'}
            email={profile.email ?? ''}
            pending={pending ?? 0}
            grant={grant}
          />
          <main className="main">{children}</main>
        </div>
        <AdminAssistant />
      </div>
    </RatesProvider>
  );
}
