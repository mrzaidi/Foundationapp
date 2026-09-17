import { NextResponse } from 'next/server';
import { requireCapability } from '@/lib/admin-guard';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/categories — what is left of each kind of giving.
 *
 * A foundation holding 60,000 of Zakat and 20,000 of Khums does not have
 * 80,000 to spend on anything, so the transfer dialog needs the balances apart
 * before it asks which one a grant comes out of.
 *
 * Behind view_budget rather than view_donors: these are balances, not donors.
 * No name appears in the answer.
 */
export async function GET() {
  const gate = await requireCapability('view_budget');
  if ('refusal' in gate) return gate.refusal;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('category_balances');

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: 'Administrators only.' }, { status: 403 });

  return NextResponse.json(data);
}
