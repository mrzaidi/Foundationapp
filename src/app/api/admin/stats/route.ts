import { NextResponse } from 'next/server';
import { adminIdentity } from '@/lib/admin-guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/admin/stats — dashboard aggregates. Admins only (enforced in SQL). */
export async function GET() {
  const { supabase, signedIn } = await adminIdentity();
  if (!signedIn) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

  const { data, error } = await supabase.rpc('admin_stats');
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: 'Administrators only.' }, { status: 403 });

  return NextResponse.json({ stats: data });
}
