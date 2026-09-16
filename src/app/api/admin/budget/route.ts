import { requireCapability } from '@/lib/admin-guard';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, error: 'Not authenticated.', status: 401 as const };

  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin')
    return { supabase, user: null, error: 'Administrators only.', status: 403 as const };

  return { supabase, user, error: null, status: 200 as const };
}

/** GET /api/admin/budget?month=YYYY-MM-01 — position for a month plus history. */
export async function GET(request: Request) {
  // Aggregates for the shared dashboard; the Budget module itself stays gated.
  const gate = await requireCapability('view_dashboard');
  if ('refusal' in gate) return gate.refusal;

  const { supabase, error: authError, status } = await requireAdmin();
  if (authError) return NextResponse.json({ error: authError }, { status });

  const month = new URL(request.url).searchParams.get('month') ?? undefined;

  const [{ data: statusData, error: e1 }, { data: history, error: e2 }] = await Promise.all([
    supabase.rpc('budget_status', month ? { p_month: month } : {}),
    supabase.rpc('budget_history', { p_months: 12 }),
  ]);

  if (e1 || e2) return NextResponse.json({ error: (e1 ?? e2)!.message }, { status: 400 });

  return NextResponse.json({ status: statusData, history: history ?? [] });
}

/**
 * PUT /api/admin/budget — gone.
 *
 * A month's fund is the donations received in it. A figure somebody typed was
 * a promise, and the committee was spending against it; the only way the fund
 * goes up now is a donor actually giving. Answers rather than 404s so an old
 * client gets told why.
 */
export async function PUT() {
  return NextResponse.json(
    {
      error:
        'The budget is no longer set by hand — a month’s fund is the donations recorded in it.',
    },
    { status: 410 }
  );
}
