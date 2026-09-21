import { redirect } from 'next/navigation';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { levelOf, can, firstAllowed, type AdminLevel, type Capability } from './permissions';
import { rowHasColumn } from './schema';
import { currentSession, forgetSessions, type Session, type SessionProfile } from './session';

export type AdminProfile = SessionProfile;

export interface AdminIdentity {
  user: User;
  profile: AdminProfile;
  level: AdminLevel;
}

/** Forget every established session — called when a role or level changes. */
export const forgetIdentities = forgetSessions;

/**
 * Who is asking, and may they.
 *
 * Every admin page and every admin write passes through here. It used to cost
 * three round trips to Supabase — verify the token, read the profile, then ask
 * the database whether a column existed — and most routes then asked the same
 * two questions again on their own.
 *
 * All three are gone. The session is established once per request and shared
 * (see lib/session), and the column probe was never needed: the profile row is
 * already in hand and `select *` omits a column that does not exist, so its
 * presence answers the question for nothing.
 */
export async function adminIdentity(): Promise<
  { supabase: SupabaseClient; identity: AdminIdentity | null } & Session
> {
  const { supabase, signedIn, user, profile } = await currentSession();

  // Which kind of administrator. Absent until migration 0015 lands, in which
  // case everyone is a master — exactly what they were before levels existed,
  // so a deploy that outruns the SQL changes nobody's access.
  const levelled = rowHasColumn(profile, 'admin_level');
  const level = levelOf(profile?.role, levelled ? (profile?.admin_level ?? null) : null);
  const identity = user && profile && level ? { user, profile, level } : null;

  return { supabase, signedIn, user, profile, identity };
}

/** The asker's level, or null if they are not an administrator. */
export async function adminLevel(): Promise<AdminLevel | null> {
  const { identity } = await adminIdentity();
  return identity?.level ?? null;
}

/**
 * Guard a page. Somebody who may not open it is sent to the first module they
 * can, rather than to an error — they have not done anything wrong, the link
 * simply was not theirs.
 */
export async function requirePage(capability: Capability): Promise<AdminLevel> {
  const level = await adminLevel();
  if (!level) redirect('/');
  if (!can(level, capability)) redirect(firstAllowed(level));
  return level;
}

/** Guard an API route. Returns the refusal to send, or what the route needs. */
export async function requireCapability(
  capability: Capability
): Promise<
  | { level: AdminLevel; supabase: SupabaseClient; user: User; profile: AdminProfile }
  | { refusal: Response }
> {
  const { supabase, identity } = await adminIdentity();

  if (!identity)
    return {
      refusal: Response.json({ error: 'Administrators only.' }, { status: 403 }),
    };

  if (!can(identity.level, capability))
    return {
      refusal: Response.json(
        { error: 'Your administrator account does not have access to this.' },
        { status: 403 }
      ),
    };

  return { level: identity.level, supabase, user: identity.user, profile: identity.profile };
}
