import { NextResponse } from 'next/server';
import { requireCapability } from '@/lib/admin-guard';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const isMonth = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

/**
 * GET /api/admin/accounts?month=YYYY-MM-01
 *
 * The month's book: what was brought forward, every movement in and out with
 * a running balance, and what carries into the next month. Both figures are
 * derived in Postgres rather than assembled here, so the arithmetic that
 * matters happens in one place and the screen cannot disagree with the
 * dashboard.
 *
 * ?months=N returns the month-by-month summary instead.
 */
export async function GET(request: Request) {
  const gate = await requireCapability('view_accounts');
  if ('refusal' in gate) return gate.refusal;

  const supabase = await createClient();
  const url = new URL(request.url);

  if (url.searchParams.has('months')) {
    const months = Math.min(Math.max(Number(url.searchParams.get('months') ?? 12), 3), 24);
    const { data, error } = await supabase.rpc('account_months', { p_months: months });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ months: data ?? [] });
  }

  const month = url.searchParams.get('month');
  const { data, error } = await supabase.rpc('account_ledger', {
    p_month: isMonth(month) ? month : new Date().toISOString().slice(0, 10),
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: 'Administrators only.' }, { status: 403 });

  return NextResponse.json(data);
}
