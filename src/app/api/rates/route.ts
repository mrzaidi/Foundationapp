import { NextResponse } from 'next/server';
import { getRates } from '@/lib/rates';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/rates — what a rupee is worth in euros and dollars.
 *
 * Proxied rather than called from the browser so the provider is named in one
 * place, the hourly cache is shared across everyone looking at the portal
 * instead of per-tab, and no third party sees the foundation's visitors.
 *
 * Answers 200 with `rates: null` when the provider is unreachable: the caller
 * shows rupees and no conversion, which is a worse page but not a broken one.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

  const rates = await getRates();

  return NextResponse.json(
    { rates },
    { headers: { 'Cache-Control': 'private, max-age=1800' } }
  );
}
