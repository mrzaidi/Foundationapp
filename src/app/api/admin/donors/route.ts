import { adminIdentity, requireCapability } from '@/lib/admin-guard';
import { NextResponse } from 'next/server';
import { asDonationType } from '@/lib/donation-types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The answer the capability gate above already reached, in the shape these
 * handlers expect. It costs nothing — the identity is established once for the
 * request and simply read again here.
 */
async function requireAdmin() {
  const { supabase, signedIn, identity } = await adminIdentity();
  if (!signedIn)
    return { error: NextResponse.json({ error: 'Not authenticated.' }, { status: 401 }) };
  if (!identity)
    return { error: NextResponse.json({ error: 'Administrators only.' }, { status: 403 }) };

  return { supabase, userId: identity.user.id };
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
 * POST /api/admin/donors — add a donor.
 *
 * A donor is their own record, not a member who happens to give. The people
 * who fund this foundation are largely not the people it helps: a benefactor
 * abroad, a shopkeeper down the road, a family trust. None of them want a
 * member account and none of them should need one, so the office writes down
 * what it knows and that is the donor.
 *
 * The name is the only requirement. Everything else is whatever was to hand
 * when they gave.
 */
export async function POST(request: Request) {
  const gate = await requireCapability('view_donors');
  if ('refusal' in gate) return gate.refusal;

  let body: {
    name?: string;
    contact?: string;
    email?: string;
    city?: string;
    address?: string;
    monthly_pledge?: number | string;
    note?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const clean = (v: unknown) => (typeof v === 'string' ? v.trim() : '') || null;

  const name = (body.name ?? '').trim();
  if (name.length < 2)
    return NextResponse.json({ error: 'Enter the donor’s name.' }, { status: 422 });

  const email = clean(body.email);
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 422 });

  const pledge =
    body.monthly_pledge === undefined || body.monthly_pledge === '' ? 0 : Number(body.monthly_pledge);
  if (!Number.isFinite(pledge) || pledge < 0)
    return NextResponse.json({ error: 'Enter a valid monthly pledge.' }, { status: 422 });

  const { data, error } = await gate.supabase
    .from('donors')
    .insert({
      name,
      contact: clean(body.contact),
      email,
      city: clean(body.city),
      address: clean(body.address),
      monthly_pledge: pledge,
      note: clean(body.note),
    })
    .select()
    .single();

  // The email, city and address columns arrive with 0024; until it runs the
  // insert is rejected for naming them, which is a migration problem and
  // should say so rather than reading as a bad form.
  if (error) {
    const missing = /column .* does not exist|schema cache/i.test(error.message);
    return NextResponse.json(
      {
        error: missing
          ? 'Adding a donor needs migration 0024. Run it, then try again.'
          : error.message,
        ...(missing ? { code: 'migration_required' } : {}),
      },
      { status: missing ? 503 : 400 }
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
