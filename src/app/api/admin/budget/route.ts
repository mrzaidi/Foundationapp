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

/** PUT /api/admin/budget — set (or change) the budget for a month. */
export async function PUT(request: Request) {
  const { supabase, user, error: authError, status } = await requireAdmin();
  if (authError) return NextResponse.json({ error: authError }, { status });

  let body: { month?: string; amount?: number | string; note?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount < 0)
    return NextResponse.json({ error: 'Enter a budget of zero or more.' }, { status: 422 });

  if (!body.month || !/^\d{4}-\d{2}-\d{2}$/.test(body.month))
    return NextResponse.json({ error: 'Pick a month.' }, { status: 422 });

  // the DB trigger snaps this to the 1st, so any day in the month is accepted
  const { data, error } = await supabase
    .from('monthly_budgets')
    .upsert(
      { month: body.month, amount, note: body.note ?? null, updated_by: user!.id },
      { onConflict: 'month' }
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ budget: data });
}
