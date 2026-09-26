import { adminIdentity } from '@/lib/admin-guard';
import { requirePage } from '@/lib/admin-guard';
import UsersManager from '@/components/UsersManager';

export const dynamic = 'force-dynamic';

/**
 * Users.
 *
 * Master-only, like Roles: between them these two screens decide what everyone
 * else can reach, and that is not a thing to leave lying around.
 */
export default async function AdminUsersPage() {
  await requirePage('manage_roles');
  const { identity } = await adminIdentity();

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Users</h1>
          <div className="crumb">
            Who can sign in to this portal, and what each of them can reach.
          </div>
        </div>
      </div>

      <UsersManager selfId={identity?.user.id ?? ''} />
    </>
  );
}
