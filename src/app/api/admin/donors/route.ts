import { requireCapability } from '@/lib/admin-guard';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { asDonationType } from '@/lib/donation-types';

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

/**
 * GET /api/admin/donors?month=YYYY-MM-01 — donors and what each gave.
 * GET /api/admin/donors?candidates=1&q= — members not yet added, for the picker.
 */
export async function GET(request: Request) {
  const level = await requireCapability('view_donors');
  if ('refusal' in level) return level.refusal;

  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  const url = new URL(request.url);

  if (url.searchParams.get('candidates')) {
    const { data, error } = await gate.supabase!.rpc('donor_candidates', {
      p_query: url.searchParams.get('q') ?? '',
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ candidates: data ?? [] });
  }

  const month = url.searchParams.get('month');
  const { data, error } = await gate.supabase!.rpc('donor_month', {
    p_month: isMonth(month) ? month : new Date().toISOString().slice(0, 10),
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ donors: data ?? [] });
}

/**
 * POST /api/admin/donors — add a member as a donor.
 *
 * A donor is an account, not a typed name: free text let the same person in
 * twice under two spellings and tied their giving to nothing.
 */
export async function POST(request: Request) {
  const level = await requireCapability('view_donors');
  if ('refusal' in level) return level.refusal;

  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  let body: { user_id?: string; monthly_pledge?: number; note?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const userId = (body.user_id ?? '').trim();
  if (!userId) return NextResponse.json({ error: 'Choose a member.' }, { status: 422 });

  const { data: member } = await gate
    .supabase!.from('profiles')
    .select('id, full_name, mobile')
    .eq('id', userId)
    .maybeSingle();
  if (!member) return NextResponse.json({ error: 'Member not found.' }, { status: 404 });

  const pledge = body.monthly_pledge === undefined ? 0 : Number(body.monthly_pledge);
  if (!Number.isFinite(pledge) || pledge < 0)
    return NextResponse.json({ error: 'Enter a valid monthly pledge.' }, { status: 422 });

  const { data, error } = await gate
    .supabase!.from('donors')
    .insert({
      user_id: member.id,
      // Kept as a display fallback if the account is ever removed.
      name: member.full_name,
      contact: member.mobile,
      monthly_pledge: pledge,
      note: (body.note ?? '').trim() || null,
    })
    .select()
    .single();

  if (error) {
    const duplicate = /duplicate|unique/i.test(error.message);
    return NextResponse.json(
      { error: duplicate ? 'That member is already a donor.' : error.message },
      { status: duplicate ? 409 : 400 }
    );
  }
  return NextResponse.json({ donor: data }, { status: 201 });
}

/** PATCH /api/admin/donors — edit a donor, or record what they gave in a month. */
export async function PATCH(request: Request) {
  const level = await requireCapability('view_donors');
  if ('refusal' in level) return level.refusal;

  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  const supabase = gate.supabase!;

  let body: {
    id?: string;
    monthly_pledge?: number;
    is_active?: boolean;
    note?: string;
    /* recording a donation */
    month?: string;
    amount?: number | null;
    received_on?: string;
    /* Khums, Zakat, Sadaqah… — see lib/donation-types */
    donation_type?: string;
    /* removing one gift rather than the whole month */
    donation_id?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const id = (body.id ?? '').trim();
  if (!id) return NextResponse.json({ error: 'Which donor?' }, { status: 422 });

  /* ---- removing one gift ---- */
  // Scoped to the donor as well as the row: an id is enough to identify a
  // donation, but checking both means a stale id from another donor's row
  // cannot delete somebody else's gift.
  if (body.donation_id) {
    const { data, error } = await supabase
      .from('donations')
      .delete()
      .eq('id', body.donation_id)
      .eq('donor_id', id)
      .select('id');

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    if (!data?.length)
      return NextResponse.json({ error: 'That donation is no longer there.' }, { status: 404 });
    return NextResponse.json({ ok: true, removed: body.donation_id });
  }

  /* ---- recording (or clearing) a month's donation ---- */
  if (body.month !== undefined) {
    if (!isMonth(body.month))
      return NextResponse.json({ error: 'Invalid month.' }, { status: 422 });

    // An amount of null or 0 means "they did not give this month" — every row
    // for the month goes, rather than a zero being stored, so a missing
    // donation stays visibly missing instead of looking like a gift of nothing.
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

    // Inserted, not upserted. A donor can give more than once in a month, and
    // overwriting was how a second gift used to erase the first.
    const { data, error } = await supabase
      .from('donations')
      .insert({
        donor_id: id,
        month: body.month,
        amount,
        // Anything unrecognised becomes a general donation rather than being
        // refused: a guess here would be a guess about somebody's religious
        // obligation, and "not captured" is the honest answer.
        donation_type: asDonationType(body.donation_type),
        received_on: isMonth(body.received_on)
          ? body.received_on
          : new Date().toISOString().slice(0, 10),
        recorded_by: gate.userId,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ donation: data });
  }

  /* ---- editing the donor themselves ---- */
  // Name and contact belong to the member’s profile, not to the donor row.
  const patch: Record<string, unknown> = {};
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
