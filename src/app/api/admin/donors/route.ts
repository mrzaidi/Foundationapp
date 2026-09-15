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

  return { supabase, userId: user.id };
}

const isMonth = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** GET /api/admin/donors?month=YYYY-MM-01 — donors and what each gave that month. */
export async function GET(request: Request) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  const month = new URL(request.url).searchParams.get('month');
  const { data, error } = await gate.supabase!.rpc('donor_month', {
    p_month: isMonth(month) ? month : new Date().toISOString().slice(0, 10),
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ donors: data ?? [] });
}

/** POST /api/admin/donors — add a donor. */
export async function POST(request: Request) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  let body: { name?: string; contact?: string; monthly_pledge?: number; note?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const name = (body.name ?? '').trim();
  if (name.length < 2) return NextResponse.json({ error: 'Enter the donor’s name.' }, { status: 422 });

  const pledge = body.monthly_pledge === undefined ? 0 : Number(body.monthly_pledge);
  if (!Number.isFinite(pledge) || pledge < 0)
    return NextResponse.json({ error: 'Enter a valid monthly pledge.' }, { status: 422 });

  const { data, error } = await gate
    .supabase!.from('donors')
    .insert({
      name,
      contact: (body.contact ?? '').trim() || null,
      monthly_pledge: pledge,
      note: (body.note ?? '').trim() || null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ donor: data }, { status: 201 });
}

/** PATCH /api/admin/donors — edit a donor, or record what they gave in a month. */
export async function PATCH(request: Request) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  const supabase = gate.supabase!;

  let body: {
    id?: string;
    name?: string;
    contact?: string;
    monthly_pledge?: number;
    is_active?: boolean;
    note?: string;
    /* recording a donation */
    month?: string;
    amount?: number | null;
    received_on?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const id = (body.id ?? '').trim();
  if (!id) return NextResponse.json({ error: 'Which donor?' }, { status: 422 });

  /* ---- recording (or clearing) a month's donation ---- */
  if (body.month !== undefined) {
    if (!isMonth(body.month))
      return NextResponse.json({ error: 'Invalid month.' }, { status: 422 });

    // An amount of null or 0 means "they did not give this month" — the row is
    // removed rather than stored as a zero, so a missing donation stays visibly
    // missing instead of looking like a recorded gift of nothing.
    if (body.amount === null || body.amount === undefined || Number(body.amount) === 0) {
      const { error } = await supabase
        .from('donations')
        .delete()
        .eq('donor_id', id)
        .eq('month', body.month);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ ok: true, cleared: true });
    }

    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0)
      return NextResponse.json({ error: 'Enter a valid amount.' }, { status: 422 });

    const { data, error } = await supabase
      .from('donations')
      .upsert(
        {
          donor_id: id,
          month: body.month,
          amount,
          received_on: isMonth(body.received_on)
            ? body.received_on
            : new Date().toISOString().slice(0, 10),
          recorded_by: gate.userId,
        },
        { onConflict: 'donor_id,month' }
      )
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ donation: data });
  }

  /* ---- editing the donor themselves ---- */
  const patch: Record<string, unknown> = {};
  if ('name' in body) {
    const name = (body.name ?? '').trim();
    if (name.length < 2)
      return NextResponse.json({ error: 'Enter the donor’s name.' }, { status: 422 });
    patch.name = name;
  }
  if ('contact' in body) patch.contact = (body.contact ?? '').trim() || null;
  if ('note' in body) patch.note = (body.note ?? '').trim() || null;
  if ('is_active' in body) patch.is_active = Boolean(body.is_active);
  if ('monthly_pledge' in body) {
    const n = Number(body.monthly_pledge);
    if (!Number.isFinite(n) || n < 0)
      return NextResponse.json({ error: 'Enter a valid monthly pledge.' }, { status: 422 });
    patch.monthly_pledge = n;
  }

  if (!Object.keys(patch).length)
    return NextResponse.json({ error: 'Nothing to update.' }, { status: 422 });

  const { data, error } = await supabase
    .from('donors')
    .update(patch)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ donor: data });
}
