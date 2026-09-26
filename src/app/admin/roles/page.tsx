import { requirePage } from '@/lib/admin-guard';
import RolesManager from '@/components/RolesManager';

export const dynamic = 'force-dynamic';

/**
 * Roles.
 *
 * Only the master administrator reaches this: it is the screen that decides
 * what every other screen shows, so the capability that opens it is the one
 * capability the master role alone holds.
 */
export default async function AdminRolesPage() {
  await requirePage('manage_roles');

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Roles</h1>
          <div className="crumb">
            What each job in the foundation can open. Assign them to people under Users.
          </div>
        </div>
      </div>

      <RolesManager />
    </>
  );
}
