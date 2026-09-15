import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'Not authenticated.' }, { status: 401 }) };

  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin')
    return { error: NextResponse.json({ error: 'Administrators only.' }, { status: 403 }) };

  return { supabase };
}

/** GET /api/admin/recurring?user_id= — standing arrangements, all or for one member. */
export async function GET(request: Request) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  const userId = new URL(request.url).searchParams.get('user_id');
  let query = gate
    .supabase!.from('recurring_grants')
    .select('*, fund_types(id, name), profiles!recurring_grants_user_id_fkey(id, full_name, email)')
    .order('created_at', { ascending: false });

  if (userId) query = query.eq('user_id', userId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ grants: data ?? [] });
}

/**
 * PATCH /api/admin/recurring — stop, resume, or re-price an arrangement.
 * Body: { id, is_active?, amount? }
 *
 * Stopping is the important one. An arrangement that files an application every
 * month with nobody able to end it would be worse than no arrangement at all —
 * a family's circumstances change, and the committee needs a way to say so
 * other than rejecting the same application twelve times.
 */
export async function PATCH(request: Request) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  let body: { id?: string; is_active?: boolean; amount?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const id = (body.id ?? '').trim();
  if (!id) return NextResponse.json({ error: 'Which arrangement?' }, { status: 422 });

  const patch: Record<string, unknown> = {};
  if ('is_active' in body) patch.is_active = Boolean(body.is_active);
  if ('amount' in body) {
    const n = Number(body.amount);
    if (!Number.isFinite(n) || n <= 0)
      return NextResponse.json({ error: 'Enter a valid monthly amount.' }, { status: 422 });
    patch.amount = n;
  }

  if (!Object.keys(patch).length)
    return NextResponse.json({ error: 'Nothing to update.' }, { status: 422 });

  const { data, error } = await gate
    .supabase!.from('recurring_grants')
    .update(patch)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: 'Arrangement not found.' }, { status: 404 });

  return NextResponse.json({ grant: data });
}
