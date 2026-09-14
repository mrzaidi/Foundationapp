import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/me — the signed-in member's profile. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

  const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ profile: data });
}

/** PATCH /api/me — update editable profile fields. */
export async function PATCH(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  // role / is_blocked are deliberately absent — the DB trigger also guards them.
  const EDITABLE = ['full_name', 'gender', 'age', 'country', 'city', 'mobile', 'nic_path'];
  const patch: Record<string, unknown> = {};
  for (const key of EDITABLE) if (key in body) patch[key] = body[key];

  if (!Object.keys(patch).length)
    return NextResponse.json({ error: 'Nothing to update.' }, { status: 422 });

  if ('age' in patch) {
    const n = Number(patch.age);
    if (!Number.isFinite(n) || n < 12 || n > 120)
      return NextResponse.json({ error: 'Enter a valid age.' }, { status: 422 });
    patch.age = n;
  }

  const { data, error } = await supabase
    .from('profiles')
    .update(patch)
    .eq('id', user.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ profile: data });
}
