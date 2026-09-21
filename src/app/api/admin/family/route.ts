import { currentSession } from '@/lib/session';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const INCOME_SOURCES = ['labour', 'business', 'job', 'pension', 'other'];
const MAX_MEMBERS = 60;

async function requireAdmin() {
  const { supabase, user } = await currentSession();
  if (!user) return { error: NextResponse.json({ error: 'Not authenticated.' }, { status: 401 }) };

  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin')
    return { error: NextResponse.json({ error: 'Administrators only.' }, { status: 403 }) };

  return { supabase, userId: user.id };
}

/** Money and counts arrive as strings from a form; blank means "not recorded". */
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
};
const int = (v: unknown, max: number): number | null => {
  const n = num(v);
  return n === null ? null : Math.min(Math.round(n), max);
};
const text = (v: unknown): string | null => {
  const s = typeof v === 'string' ? v.trim() : '';
  return s || null;
};

/** GET /api/admin/family?user_id= */
export async function GET(request: Request) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  const userId = new URL(request.url).searchParams.get('user_id');
  if (!userId) return NextResponse.json({ error: 'Which member?' }, { status: 422 });

  const { data, error } = await gate
    .supabase!.from('family_details')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ family: data });
}

/**
 * PUT /api/admin/family — save a household.
 *
 * The whole form in one write. Anything left blank is stored as null rather
 * than zero: a household that has not been asked about its rent is not a
 * household paying no rent, and the committee should be able to tell those
 * apart.
 */
export async function PUT(request: Request) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const userId = text(body.user_id);
  if (!userId) return NextResponse.json({ error: 'Which member?' }, { status: 422 });

  // The member has to exist — a household with no one to attach it to is a typo.
  const { data: member } = await gate
    .supabase!.from('profiles')
    .select('id')
    .eq('id', userId)
    .maybeSingle();
  if (!member) return NextResponse.json({ error: 'Member not found.' }, { status: 404 });

  const status = text(body.father_status);
  if (status && !['alive', 'deceased'].includes(status))
    return NextResponse.json({ error: 'Father status must be alive or deceased.' }, { status: 422 });

  const house = text(body.house_type);
  if (house && !['own', 'rent'].includes(house))
    return NextResponse.json({ error: 'House type must be own or rent.' }, { status: 422 });

  const sources = Array.isArray(body.income_sources)
    ? [...new Set(body.income_sources.map(String))].filter((s) => INCOME_SOURCES.includes(s))
    : [];

  const totalMembers = int(body.total_members, MAX_MEMBERS);

  const rawMembers = Array.isArray(body.members) ? body.members : [];
  const members = rawMembers
    .slice(0, totalMembers ?? MAX_MEMBERS)
    .map((m) => {
      const row = (m ?? {}) as Record<string, unknown>;
      return { name: text(row.name), age: int(row.age, 120), relation: text(row.relation) };
    })
    // A row nobody filled in is not worth storing, but it must not shift the
    // ones after it — so blanks are kept in place unless they trail the list.
    .filter((m, i, all) => all.slice(i).some((r) => r.name || r.age !== null || r.relation));

  const male = int(body.male_count, MAX_MEMBERS);
  const female = int(body.female_count, MAX_MEMBERS);
  if (totalMembers !== null && male !== null && female !== null && male + female > totalMembers)
    return NextResponse.json(
      { error: 'Male and female counts add up to more than the total.' },
      { status: 422 }
    );

  const row = {
    user_id: userId,
    head_name: text(body.head_name),
    father_name: text(body.father_name),
    father_mobile: text(body.father_mobile),
    father_status: status,
    address: text(body.address),
    total_members: totalMembers,
    male_count: male,
    female_count: female,
    members,
    income_sources: sources,
    income_source_other: sources.includes('other') ? text(body.income_source_other) : null,
    monthly_income: num(body.monthly_income),
    monthly_expense: num(body.monthly_expense),
    house_type: house,
    has_bank_account:
      body.has_bank_account === null || body.has_bank_account === undefined
        ? null
        : Boolean(body.has_bank_account),
    bill_ke: num(body.bill_ke),
    rent: num(body.rent),
    education_expense: num(body.education_expense),
    medical_expense: num(body.medical_expense),
    fund_reason: text(body.fund_reason),
    updated_by: gate.userId,
  };

  const { data, error } = await gate
    .supabase!.from('family_details')
    .upsert(row, { onConflict: 'user_id' })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ family: data });
}
