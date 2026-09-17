import { NextResponse } from 'next/server';
import { requireCapability } from '@/lib/admin-guard';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/donors/types?months=N — giving split by kind.
 *
 * Khums, Zakat and the rest are distinct obligations with different rules
 * about what they may be spent on, so a committee needs them apart as well as
 * together. The total is unchanged: every type still sums into the month's
 * fund exactly as it did before there were types.
 *
 * Behind view_donors rather than view_budget. The amounts themselves are
 * harmless, but which obligations a foundation receives is donor information,
 * and the level trusted with the budget but not the donor list should not be
 * able to read it here instead.
 */
export async function GET(request: Request) {
  const gate = await requireCapability('view_donors');
  if ('refusal' in gate) return gate.refusal;

  const supabase = await createClient();
  const asked = Number(new URL(request.url).searchParams.get('months') ?? 6);
  const months = Math.min(Math.max(Number.isFinite(asked) ? asked : 6, 3), 24);

  const { data, error } = await supabase.rpc('donation_types', { p_months: months });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: 'Administrators only.' }, { status: 403 });

  return NextResponse.json(data);
}
