import { NextResponse } from 'next/server';
import { currentSession } from '@/lib/session';
import { bankColumnsReady } from '@/lib/bank-schema';
import { normalizeAccount, validateBank } from '@/lib/banks';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/me — the signed-in member's profile. */
export async function GET() {
  const { supabase, user } = await currentSession();
  if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

  const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ profile: data });
}

/** PATCH /api/me — update editable profile fields. */
export async function PATCH(request: Request) {
  const { supabase, user } = await currentSession();
  if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  // role / is_blocked are deliberately absent — the DB trigger also guards them.
  const EDITABLE = [
    'full_name',
    'gender',
    'age',
    'country',
    'city',
    'mobile',
    'nic_path',
    'bank_name',
    'bank_account_title',
    'bank_account_number',
  ];
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

  // Bank details go in as a set or not at all: a half-updated payout account is
  // worse than none, because it still passes the "has bank details" check.
  const BANK = ['bank_name', 'bank_account_title', 'bank_account_number'] as const;
  if (BANK.some((k) => k in patch)) {
    if (!(await bankColumnsReady(supabase)))
      return NextResponse.json(
        { error: 'Bank details are not available yet. Run migration 0007 on the database.' },
        { status: 503 }
      );


    if (!BANK.every((k) => k in patch))
      return NextResponse.json(
        { error: 'Send the bank, account number and account holder name together.' },
        { status: 422 }
      );

    const problem = validateBank({
      bank_name: String(patch.bank_name ?? ''),
      bank_account_title: String(patch.bank_account_title ?? ''),
      bank_account_number: String(patch.bank_account_number ?? ''),
    });
    if (problem)
      return NextResponse.json(
        { error: problem.message, errors: { [problem.field]: problem.message } },
        { status: 422 }
      );

    patch.bank_name = String(patch.bank_name).trim();
    patch.bank_account_title = String(patch.bank_account_title).trim();
    patch.bank_account_number = normalizeAccount(String(patch.bank_account_number));
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
