/**
 * What each kind of administrator may do.
 *
 * One table, read by the sidebar, by every admin page and by every write
 * endpoint, so the menu and the rules cannot drift apart — a hidden link that
 * still answers when typed into the address bar is not access control.
 *
 * The database enforces the same thing again in migration 0015. That is not
 * duplication for its own sake: this layer decides what to render and gives a
 * readable refusal, and the policies underneath hold even if something calls
 * PostgREST directly.
 */

export type AdminLevel = 'master' | 'reports' | 'intake';

/** Null means master — every administrator predating levels had full access. */
export const levelOf = (
  role: string | null | undefined,
  adminLevel: string | null | undefined
): AdminLevel | null => {
  if (role !== 'admin') return null;
  return (adminLevel as AdminLevel) ?? 'master';
};

export const LEVEL_LABEL: Record<AdminLevel, string> = {
  master: 'Master Admin',
  reports: 'Admin 1',
  intake: 'Admin 2',
};

export const LEVEL_BLURB: Record<AdminLevel, string> = {
  master: 'Every module, and the only level that can approve, transfer or change who is who.',
  reports: 'Member records and report exports only. No budget, no donors, no applications.',
  intake: 'Member records and the month’s budget totals. No donor details, no applications.',
};

/** Every capability the admin portal gates on. */
export type Capability =
  | 'view_dashboard'
  | 'view_members'
  | 'edit_members'
  | 'create_members'
  | 'create_admins'
  | 'view_requests'
  | 'decide_requests'
  | 'view_budget'
  | 'view_accounts'
  | 'view_donors'
  | 'edit_donors'
  | 'view_funds'
  | 'edit_funds'
  | 'export_reports'
  | 'use_assistant_writes';

const MASTER: Capability[] = [
  'view_dashboard',
  'view_members',
  'edit_members',
  'create_members',
  'create_admins',
  'view_requests',
  'decide_requests',
  'view_budget',
  'view_accounts',
  'view_donors',
  'edit_donors',
  'view_funds',
  'edit_funds',
  'export_reports',
  'use_assistant_writes',
];

/*
 * Admin 1: "add members info, or extract reports — that's it. No budget
 * related task, no request status change."
 *
 * So member records and exports, and nothing that touches money. No budget,
 * no donors, no applications — not even to look at, because the line drawn
 * was around the job rather than around the buttons.
 */
const REPORTS: Capability[] = [
  'view_dashboard',
  'view_members',
  'edit_members',
  'create_members',
  'export_reports',
];

/*
 * Admin 2: "the budget section without the donor details, and can add the
 * user details."
 *
 * The same member work, plus the month's balance — but never who paid it, and
 * no exports. Applications were not mentioned, so they are not granted: on a
 * system that moves money, silence in a specification means no.
 */
const INTAKE: Capability[] = [
  'view_dashboard',
  'view_members',
  'edit_members',
  'create_members',
  'view_budget',
  // The account book is the budget seen properly — what came in, what went
  // out, what is left. The donor names inside it are hidden by the ledger
  // itself, so this level reads the money without reading the donor list.
  'view_accounts',
];

const BY_LEVEL: Record<AdminLevel, Capability[]> = {
  master: MASTER,
  reports: REPORTS,
  intake: INTAKE,
};

export function can(level: AdminLevel | null, capability: Capability): boolean {
  if (!level) return false;
  return BY_LEVEL[level].includes(capability);
}

/** The sidebar, in order, filtered to what this administrator may open. */
export const MODULES: {
  href: string;
  label: string;
  icon: string;
  needs: Capability;
  group: 'Overview' | 'Manage';
}[] = [
  { href: '/admin', label: 'Dashboard', icon: 'grid', needs: 'view_dashboard', group: 'Overview' },
  { href: '/admin/requests', label: 'Applications', icon: 'inbox', needs: 'view_requests', group: 'Manage' },
  { href: '/admin/members', label: 'Members', icon: 'users', needs: 'view_members', group: 'Manage' },
  { href: '/admin/funds', label: 'Funds', icon: 'wallet', needs: 'view_funds', group: 'Manage' },
  { href: '/admin/donors', label: 'Donors', icon: 'heart', needs: 'view_donors', group: 'Manage' },
  { href: '/admin/budget', label: 'Budget', icon: 'budget', needs: 'view_budget', group: 'Manage' },
  { href: '/admin/accounts', label: 'Accounts', icon: 'book', needs: 'view_accounts', group: 'Manage' },
];

/** Where to send someone who has no business on the page they asked for. */
export const firstAllowed = (level: AdminLevel | null): string =>
  MODULES.find((m) => can(level, m.needs))?.href ?? '/';
