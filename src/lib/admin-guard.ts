import { redirect } from 'next/navigation';
import { levelOf, can, firstAllowed, type AdminLevel, type Capability } from './permissions';
import { columnReady } from './schema';
import { createClient } from './supabase/server';

/**
 * Who is asking, and may they.
 *
 * Every admin page and every admin write calls this. Hiding a link in the
 * sidebar decides what is offered; this decides what is allowed, and typing
 * the address in directly meets the same answer.
 */
export async function adminLevel(): Promise<AdminLevel | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  if (profile?.role !== 'admin') return null;

  // Absent until 0015 is applied, and then everyone is master — which is what
  // every administrator already was.
  const levelled = await columnReady(supabase, 'profiles', 'admin_level');
  return levelOf('admin', levelled ? ((profile as { admin_level?: string | null }).admin_level ?? null) : null);
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

/** Guard an API route. Returns null when allowed, or the refusal to return. */
export async function requireCapability(
  capability: Capability
): Promise<{ level: AdminLevel } | { refusal: Response }> {
  const level = await adminLevel();

  if (!level)
    return {
      refusal: Response.json({ error: 'Administrators only.' }, { status: 403 }),
    };

  if (!can(level, capability))
    return {
      refusal: Response.json(
        { error: 'Your administrator account does not have access to this.' },
        { status: 403 }
      ),
    };

  return { level };
}
