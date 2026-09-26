import { NextResponse } from 'next/server';
import { requireCapability } from '@/lib/admin-guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const INCOME_SOURCES = ['labour', 'business', 'job', 'pension', 'other'];
const MAX_MEMBERS = 60;

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

/**
 * Everything the form sends, checked and shaped.
 *
 * Returns either the row to write or the sentence to show. The same rules
 * apply whether a household is being started or corrected, so both handlers
 * come through here.
 */
function shape(body: Record<string, unknown>): { row: Record<string, unknown> } | { bad: string } {
  const head = text(body.head_name);
  if (!head || head.length < 2) return { bad: 'Enter the name of the head of the family.' };

  const status = text(body.father_status);
  if (status && !['alive', 'deceased'].includes(status))
    return { bad: 'Father status must be alive or deceased.' };

  const house = text(body.house_type);
  if (house && !['own', 'rent'].includes(house)) return { bad: 'House type must be own or rent.' };

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
    return { bad: 'Male and female counts add up to more than the total.' };

  return {
    row: {
      head_name: head,
      father_name: text(body.father_name),
      father_mobile: text(body.father_mobile),
      father_status: status,
      address: text(body.address),
      city: text(body.city),
      contact: text(body.contact),
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
    },
  };
}

const read = async (request: Request) => {
  try {
    return { body: (await request.json()) as Record<string, unknown> };
  } catch {
    return { bad: 'Invalid request body.' };
  }
};

/** GET /api/admin/family?id= — one household. */
export async function GET(request: Request) {
  const gate = await requireCapability('view_members');
  if ('refusal' in gate) return gate.refusal;

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Which household?' }, { status: 422 });

  const { data, error } = await gate.supabase
    .from('families')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ family: data ?? null });
}

/**
 * POST /api/admin/family — start a household.
 *
 * Nothing else has to exist first. The office meets families who have never
 * registered and may never register; the head of the family's name is the
 * whole requirement, and the rest can be filled in whenever it is known.
 */
export async function POST(request: Request) {
  const gate = await requireCapability('view_members');
  if ('refusal' in gate) return gate.refusal;

  const parsed = await read(request);
  if ('bad' in parsed) return NextResponse.json({ error: parsed.bad }, { status: 400 });

  const shaped = shape(parsed.body);
  if ('bad' in shaped) return NextResponse.json({ error: shaped.bad }, { status: 422 });

  const { data, error } = await gate.supabase
    .from('families')
    .insert({ ...shaped.row, created_by: gate.user.id, updated_by: gate.user.id })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ family: data }, { status: 201 });
}

/** PUT /api/admin/family — correct a household. Body carries its id. */
export async function PUT(request: Request) {
  const gate = await requireCapability('view_members');
  if ('refusal' in gate) return gate.refusal;

  const parsed = await read(request);
  if ('bad' in parsed) return NextResponse.json({ error: parsed.bad }, { status: 400 });

  const id = text(parsed.body.id);
  if (!id) return NextResponse.json({ error: 'Which household?' }, { status: 422 });

  const shaped = shape(parsed.body);
  if ('bad' in shaped) return NextResponse.json({ error: shaped.bad }, { status: 422 });

  const { data, error } = await gate.supabase
    .from('families')
    .update({ ...shaped.row, updated_by: gate.user.id })
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: 'Household not found.' }, { status: 404 });
  return NextResponse.json({ family: data });
}

/** DELETE /api/admin/family?id= — remove a household written down in error. */
export async function DELETE(request: Request) {
  const gate = await requireCapability('view_members');
  if ('refusal' in gate) return gate.refusal;

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Which household?' }, { status: 422 });

  const { error } = await gate.supabase.from('families').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
