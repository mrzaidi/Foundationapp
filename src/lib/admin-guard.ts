import { redirect } from 'next/navigation';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import {
  can,
  firstAllowed,
  grantFromLevel,
  type Capability,
  type Grant,
} from './permissions';
import { currentSession, forgetSessions, type Session, type SessionProfile } from './session';

export type AdminProfile = SessionProfile;

export interface AdminIdentity {
  user: User;
  profile: AdminProfile;
  grant: Grant;
}

/** Forget every established session — called when a role or grant changes. */
export const forgetIdentities = forgetSessions;

/** The role as PostgREST embeds it, when 0025 has run. */
interface EmbeddedRole {
  id: string;
  name: string;
  is_master: boolean;
  role_capabilities: { capability: string }[] | null;
}

/**
 * What this administrator may do.
 *
 * Read from the role on their profile, which arrived with the session in one
 * query. An administrator with no role yet — which 0025 should leave none of —
 * falls back to the level they had, so a deploy landing before its migration
 * does not lock the office out.
 */
function grantOf(profile: AdminProfile | null): Grant | null {
  if (!profile || profile.role !== 'admin') return null;

  const role = (profile as { roles?: EmbeddedRole | null }).roles;
  if (role) {
    return {
      roleId: role.id,
      roleName: role.name,
      isMaster: Boolean(role.is_master),
      capabilities: (role.role_capabilities ?? []).map((c) => c.capability as Capability),
    };
  }

  return grantFromLevel(profile.role, profile.admin_level);
}

/**
 * Who is asking, and may they.
 *
 * Every admin page and every admin write passes through here. The session is
 * established once per request and shared (see lib/session), so this costs
 * nothing beyond reading what is already in hand.
 */
export async function adminIdentity(): Promise<
  { supabase: SupabaseClient; identity: AdminIdentity | null } & Session
> {
  const { supabase, signedIn, user, profile } = await currentSession();

  const grant = grantOf(profile);
  const identity = user && profile && grant ? { user, profile, grant } : null;

  return { supabase, signedIn, user, profile, identity };
}

/** What the asker may do, or null if they are not an administrator. */
export async function adminGrant(): Promise<Grant | null> {
  const { identity } = await adminIdentity();
  return identity?.grant ?? null;
}

/**
 * Guard a page. Somebody who may not open it is sent to the first module they
 * can, rather than to an error — they have not done anything wrong, the link
 * simply was not theirs.
 */
export async function requirePage(capability: Capability): Promise<Grant> {
  const grant = await adminGrant();
  if (!grant) redirect('/');
  if (!can(grant, capability)) redirect(firstAllowed(grant));
  return grant;
}

/** Guard an API route. Returns the refusal to send, or what the route needs. */
export async function requireCapability(
  capability: Capability
): Promise<
  | { grant: Grant; level: Grant; supabase: SupabaseClient; user: User; profile: AdminProfile }
  | { refusal: Response }
> {
  const { supabase, identity } = await adminIdentity();

  if (!identity)
    return {
      refusal: Response.json({ error: 'Administrators only.' }, { status: 403 }),
    };

  if (!can(identity.grant, capability))
    return {
      refusal: Response.json(
        { error: 'Your administrator account does not have access to this.' },
        { status: 403 }
      ),
    };

  return {
    grant: identity.grant,
    // Kept under its old name too: routes written against the level API read
    // `gate.level`, and a grant answers the same questions.
    level: identity.grant,
    supabase,
    user: identity.user,
    profile: identity.profile,
  };
}
