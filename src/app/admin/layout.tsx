import { redirect } from 'next/navigation';
import AdminSidebar from '@/components/AdminSidebar';
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
    .select('full_name, email, role')
    .eq('id', user.id)
    .single();

  // Middleware already guards this, but a direct render should never leak.
  if (profile?.role !== 'admin') redirect('/');

  const { count: pending } = await supabase
    .from('fund_requests')
    .select('*', { count: 'exact', head: true })
    .in('status', ['requested', 'review']);

  return (
    <div className="admin-body">
      <div className="admin-shell">
        <AdminSidebar
          name={profile.full_name}
          email={profile.email}
          pending={pending ?? 0}
        />
        <main className="main">{children}</main>
      </div>
    </div>
  );
}
