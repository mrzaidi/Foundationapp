import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated.', status: 401 as const, supabase, user: null };

  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin')
    return { error: 'Administrators only.', status: 403 as const, supabase, user: null };

  return { error: null, status: 200 as const, supabase, user };
}

/** GET /api/admin/members?q=&limit=&offset= */
export async function GET(request: Request) {
  const { error: authError, status, supabase } = await requireAdmin();
  if (authError) return NextResponse.json({ error: authError }, { status });

  const url = new URL(request.url);
  const q = url.searchParams.get('q')?.trim();
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), 200);
  const offset = Number(url.searchParams.get('offset') ?? 0);

  let query = supabase
    .from('profiles')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (q) query = query.or(`full_name.ilike.%${q}%,email.ilike.%${q}%,mobile.ilike.%${q}%`);

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ members: data ?? [], total: count ?? 0 });
}

/** PATCH /api/admin/members — { id, role?, is_blocked? } */
export async function PATCH(request: Request) {
  const { error: authError, status, supabase } = await requireAdmin();
  if (authError) return NextResponse.json({ error: authError }, { status });

  let body: { id?: string; role?: string; is_blocked?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  if (!body.id) return NextResponse.json({ error: 'Missing member id.' }, { status: 422 });

  const patch: Record<string, unknown> = {};
  if (body.role !== undefined) {
    if (!['member', 'admin'].includes(body.role))
      return NextResponse.json({ error: 'Unknown role.' }, { status: 422 });
    patch.role = body.role;
  }
  if (body.is_blocked !== undefined) patch.is_blocked = Boolean(body.is_blocked);

  if (!Object.keys(patch).length)
    return NextResponse.json({ error: 'Nothing to update.' }, { status: 422 });

  const { data, error } = await supabase
    .from('profiles')
    .update(patch)
    .eq('id', body.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ member: data });
}
