import { NextResponse } from 'next/server';
import { requireCapability } from '@/lib/admin-guard';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/admin/donors/:id — one donor, with their whole giving history. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const gate = await requireCapability('view_donors');
  if ('refusal' in gate) return gate.refusal;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('donor_detail', { p_donor: id });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: 'Donor not found.' }, { status: 404 });

  return NextResponse.json(data);
}
