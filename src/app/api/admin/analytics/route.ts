import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/analytics?days=365
 *
 * Returns the raw rows the dashboard charts need — the bucketing into
 * days/weeks/months happens in the browser so switching granularity is instant
 * and does not cost a round trip. Only the columns the charts read are sent.
 */
export async function GET(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin')
    return NextResponse.json({ error: 'Administrators only.' }, { status: 403 });

  const days = Math.min(Math.max(Number(new URL(request.url).searchParams.get('days') ?? 365), 1), 1095);
  const since = new Date(Date.now() - days * 86400000).toISOString();

  const [{ data: rows, error }, { data: funds }] = await Promise.all([
    supabase
      .from('fund_requests')
      .select('created_at, status, fund_type_id, amount_requested, amount_approved, transferred_at')
      .gte('created_at', since)
      .order('created_at', { ascending: true })
      .limit(5000),
    supabase.from('fund_types').select('id, name, name_ur').order('sort_order'),
  ]);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ rows: rows ?? [], funds: funds ?? [], days });
}
