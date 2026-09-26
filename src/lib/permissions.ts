/**
 * What each administrator may do.
 *
 * Until 0025 this was a table written in code: three levels, each with a fixed
 * list. That was right while there were three jobs, and wrong the moment the
 * foundation needed a fourth — every new shape of work meant an engineer.
 *
 * Now a role is a row, its capabilities are rows beside it, and this file is
 * only the catalogue: the names of the things that can be granted, and the
 * modules they open. The answer to "may they" comes from the database, out of
 * the same query that establishes who they are, and arrives here as a Grant.
 *
 * The database enforces the same thing again — see has_capability() and the
 * policies in 0015 and 0025. That is not duplication for its own sake: this
 * layer decides what to render and gives a readable refusal, and the policies
 * underneath hold even if something calls PostgREST directly.
 */

/** Everything that can be granted. The strings match role_capabilities. */
export type Capability =
  | 'view_dashboard'
  | 'view_members'
  | 'edit_members'
  | 'create_members'
  | 'create_admins'
  | 'view_requests'
  | 'file_requests'
  | 'decide_requests'
  | 'view_budget'
  | 'view_accounts'
  | 'view_donors'
  | 'edit_donors'
  | 'view_funds'
  | 'edit_funds'
  | 'export_reports'
  | 'use_assistant_writes'
  | 'manage_roles';

export const ALL_CAPABILITIES: Capability[] = [
  'view_dashboard',
  'view_members',
  'edit_members',
  'create_members',
  'create_admins',
  'view_requests',
  'file_requests',
  'decide_requests',
  'view_budget',
  'view_accounts',
  'view_donors',
  'edit_donors',
  'view_funds',
  'edit_funds',
  'export_reports',
  'use_assistant_writes',
  'manage_roles',
];

/** What each one means, in the words somebody ticking a box would use. */
export const CAPABILITY_LABEL: Record<Capability, string> = {
  view_dashboard: 'See the dashboard',
  view_members: 'See members and households',
  edit_members: 'Edit member details',
  create_members: 'Add members',
  create_admins: 'Add administrators',
  view_requests: 'See applications',
  file_requests: 'File an application for somebody',
  decide_requests: 'Approve, reject and transfer',
  view_budget: 'See the month’s fund',
  view_accounts: 'See the account book',
  view_donors: 'See donors and what they gave',
  edit_donors: 'Add donors and record donations',
  view_funds: 'See the funds',
  edit_funds: 'Change the funds and their limits',
  export_reports: 'Export reports',
  use_assistant_writes: 'Let the assistant make changes',
  manage_roles: 'Manage users and roles',
};

/**
 * A role as it applies to one person, with everything it grants.
 *
 * `isMaster` is not a capability, it is the answer to "who may hand out
 * capabilities" — and it short-circuits every check, so the master role cannot
 * be locked out of anything by a mis-ticked box.
 */
export interface Grant {
  roleId: string | null;
  roleName: string;
  isMaster: boolean;
  capabilities: Capability[];
}

export function can(grant: Grant | null | undefined, capability: Capability): boolean {
  if (!grant) return false;
  return grant.isMaster || grant.capabilities.includes(capability);
}

/* ---------------------------------------------------------------------------
 * The levels from 0015, kept for administrators not yet moved onto a role.
 *
 * 0025 moves everybody across, so this should never be reached in practice. It
 * exists so a deploy that lands before its migration does not take the admin
 * portal down — the same reason every other feature here waits for its SQL.
 * ------------------------------------------------------------------------- */
export type LegacyLevel = 'master' | 'reports' | 'intake';

const LEGACY: Record<LegacyLevel, Capability[]> = {
  master: ALL_CAPABILITIES,
  reports: ['view_dashboard', 'view_members', 'edit_members', 'create_members', 'export_reports'],
  intake: [
    'view_dashboard',
    'view_members',
    'edit_members',
    'create_members',
    'view_budget',
    'view_accounts',
  ],
};

export const LEGACY_LABEL: Record<LegacyLevel, string> = {
  master: 'Master Admin',
  reports: 'Admin 1',
  intake: 'Admin 2',
};

/** The grant an administrator gets from their old level alone. */
export function grantFromLevel(
  role: string | null | undefined,
  adminLevel: string | null | undefined
): Grant | null {
  if (role !== 'admin') return null;
  const level = (adminLevel as LegacyLevel) ?? 'master';
  const capabilities = LEGACY[level] ?? LEGACY.master;
  return {
    roleId: null,
    roleName: LEGACY_LABEL[level] ?? 'Master Admin',
    isMaster: level === 'master',
    capabilities,
  };
}

/** The sidebar, in order, filtered to what this administrator may open. */
export const MODULES: {
  href: string;
  label: string;
  icon: string;
  needs: Capability;
  group: 'Overview' | 'Manage' | 'Settings';
}[] = [
  { href: '/admin', label: 'Dashboard', icon: 'grid', needs: 'view_dashboard', group: 'Overview' },
  { href: '/admin/requests', label: 'Applications', icon: 'inbox', needs: 'view_requests', group: 'Manage' },
  { href: '/admin/members', label: 'Members', icon: 'users', needs: 'view_members', group: 'Manage' },
  { href: '/admin/families', label: 'Families', icon: 'home', needs: 'view_members', group: 'Manage' },
  { href: '/admin/funds', label: 'Funds', icon: 'wallet', needs: 'view_funds', group: 'Manage' },
  { href: '/admin/donors', label: 'Donors', icon: 'heart', needs: 'view_donors', group: 'Manage' },
  { href: '/admin/budget', label: 'Budget', icon: 'budget', needs: 'view_budget', group: 'Manage' },
  { href: '/admin/accounts', label: 'Accounts', icon: 'book', needs: 'view_accounts', group: 'Manage' },
  { href: '/admin/users', label: 'Users', icon: 'shield', needs: 'manage_roles', group: 'Settings' },
  { href: '/admin/roles', label: 'Roles', icon: 'lock', needs: 'manage_roles', group: 'Settings' },
];

/**
 * Which modules a capability opens, for the roles screen.
 *
 * Ticking "See applications" should visibly turn Applications on in the
 * sidebar, and this is what lets the screen say so.
 */
export const MODULES_FOR: Partial<Record<Capability, string[]>> = MODULES.reduce(
  (acc, m) => {
    (acc[m.needs] ??= []).push(m.label);
    return acc;
  },
  {} as Record<string, string[]>
);

/** Where to send someone who has no business on the page they asked for. */
export const firstAllowed = (grant: Grant | null): string =>
  MODULES.find((m) => can(grant, m.needs))?.href ?? '/';
