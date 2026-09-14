import 'server-only';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';

/**
 * Service-role client. Bypasses RLS entirely — only ever import this from
 * route handlers that have already verified the caller, and never from a
 * Client Component.
 *
 * Used for: creating the auth user during registration, and admin actions
 * that need to reach across every member's data.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is not set. Add it to .env.local and to your Vercel project settings.'
    );
  }

  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
