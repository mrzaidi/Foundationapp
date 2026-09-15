import { NextResponse } from 'next/server';
import { hasBankDetails } from '@/lib/banks';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/requests
 *   ?status=requested|review|accepted|transferred|rejected
 *   ?scope=all    (admins only — every member's requests)
 *   ?limit / ?offset
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

  const url = new URL(request.url);
  const status = url.searchParams.get('status');
  const scope = url.searchParams.get('scope');
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), 200);
  const offset = Number(url.searchParams.get('offset') ?? 0);

  let query = supabase
    .from('fund_requests')
    .select('*, fund_types(*), profiles!fund_requests_user_id_fkey(id, full_name, email, mobile, city, country)', {
      count: 'exact',
    })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  // RLS already limits a member to their own rows; this makes it explicit and
  // lets an admin ask for just their own by leaving scope off.
  if (scope !== 'all') query = query.eq('user_id', user.id);
  if (status) query = query.eq('status', status);

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ requests: data ?? [], total: count ?? 0 });
}

/** POST /api/requests — a member submits a new application. */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

  let body: { fund_type_id?: string; amount_requested?: number; purpose?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const fundId = (body.fund_type_id ?? '').trim();
  const amount = Number(body.amount_requested);

  if (!fundId) return NextResponse.json({ error: 'Select a fund.' }, { status: 422 });

  // There is a trigger enforcing this too, but a 422 with a sentence the app
  // can show beats surfacing a Postgres exception to a member.
  const { data: me } = await supabase
    .from('profiles')
    .select('bank_name, bank_account_title, bank_account_number')
    .eq('id', user.id)
    .single();

  if (!me || !hasBankDetails(me))
    return NextResponse.json(
      { error: 'Add your bank details before applying for a fund.', code: 'bank_required' },
      { status: 422 }
    );

  if (!Number.isFinite(amount) || amount <= 0)
    return NextResponse.json({ error: 'Enter a valid amount.' }, { status: 422 });

  // Validate against the fund's own limits rather than trusting the client.
  const { data: fund, error: fundError } = await supabase
    .from('fund_types')
    .select('*')
    .eq('id', fundId)
    .eq('is_active', true)
    .single();

  if (fundError || !fund)
    return NextResponse.json({ error: 'That fund is not available.' }, { status: 404 });

  if (amount < Number(fund.min_amount))
    return NextResponse.json(
      { error: `The minimum request for ${fund.name} is ${fund.min_amount}.` },
      { status: 422 }
    );

  if (fund.max_amount && amount > Number(fund.max_amount))
    return NextResponse.json(
      { error: `The maximum request for ${fund.name} is ${fund.max_amount}.` },
      { status: 422 }
    );

  const { data, error } = await supabase
    .from('fund_requests')
    .insert({
      user_id: user.id,
      fund_type_id: fundId,
      amount_requested: amount,
      purpose: body.purpose ?? null,
      status: 'requested',
    })
    .select('*, fund_types(*)')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ request: data }, { status: 201 });
}
