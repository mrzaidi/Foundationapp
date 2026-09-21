import { requireCapability } from '@/lib/admin-guard';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/admin/budget?month=YYYY-MM-01 — position for a month plus history. */
export async function GET(request: Request) {
  // Aggregates for the shared dashboard; the Budget module itself stays gated.
  const gate = await requireCapability('view_dashboard');
  if ('refusal' in gate) return gate.refusal;

  const { supabase } = gate;

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
