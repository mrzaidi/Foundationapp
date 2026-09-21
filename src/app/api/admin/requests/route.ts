import { NextResponse } from 'next/server';
import { requireCapability } from '@/lib/admin-guard';
import { bankColumnsReady } from '@/lib/bank-schema';
import { hasBankDetails, normalizeAccount, validateBank } from '@/lib/banks';
import { columnReady } from '@/lib/schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/requests — file an application on a member's behalf.
 *
 * For the people who cannot file their own: someone at the office counter with
 * a hospital bill and no smartphone, a household registered on a relative's
 * phone. The application that comes out is an ordinary one — it starts at
 * `requested`, it appears on the member's own screens as theirs, and it still
 * has to be approved and transferred by the same hands under the same rules.
 *
 * Every limit the member would have met is checked here against the database
 * rather than trusted from the form, because the person filling it in is not
 * the person the money is for.
 */
export async function POST(request: Request) {
  const gate = await requireCapability('file_requests');
  if ('refusal' in gate) return gate.refusal;

  const { supabase, user } = gate;

  // The column arrives with migration 0021. Until it runs, the insert policy
  // underneath still refuses an administrator, so the honest answer is that
  // the feature is not provisioned yet — not a Postgres error.
  if (!(await columnReady(supabase, 'fund_requests', 'filed_by')))
    return NextResponse.json(
      {
        error: 'Filing on a member’s behalf needs migration 0021. Run it, then try again.',
        code: 'migration_required',
      },
      { status: 503 }
    );

  let body: {
    user_id?: string;
    fund_type_id?: string;
    amount_requested?: number;
    purpose?: string | null;
    bank_name?: string;
    bank_account_title?: string;
    bank_account_number?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const memberId = (body.user_id ?? '').trim();
  const fundId = (body.fund_type_id ?? '').trim();
  const amount = Number(body.amount_requested);

  if (!memberId) return NextResponse.json({ error: 'Choose a member.' }, { status: 422 });
  if (!fundId) return NextResponse.json({ error: 'Select a fund.' }, { status: 422 });
  if (!Number.isFinite(amount) || amount <= 0)
    return NextResponse.json({ error: 'Enter a valid amount.' }, { status: 422 });

  const { data: member, error: memberError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', memberId)
    .single();

  if (memberError || !member)
    return NextResponse.json({ error: 'That member could not be found.' }, { status: 404 });

  if (member.role === 'admin')
    return NextResponse.json(
      { error: 'Applications are filed for members, not for administrators.' },
      { status: 422 }
    );

  /*
   * Somewhere for the money to land.
   *
   * The same rule the member meets when they apply — a trigger enforces it in
   * the database either way. The difference at a counter is that the details
   * can be taken down there and then, so the form may send them and they are
   * saved to the member's own profile before the application is filed. They
   * belong to the member afterwards, exactly as if they had entered them.
   */
  if (await bankColumnsReady(supabase)) {
    if (!hasBankDetails(member)) {
      const bank = {
        bank_name: (body.bank_name ?? '').trim(),
        bank_account_title: (body.bank_account_title ?? '').trim(),
        bank_account_number: (body.bank_account_number ?? '').trim(),
      };

      if (!bank.bank_name && !bank.bank_account_title && !bank.bank_account_number)
        return NextResponse.json(
          {
            error: `${member.full_name ?? 'This member'} has no bank details on file. Add them to file this application.`,
            code: 'bank_required',
          },
          { status: 422 }
        );

      const problem = validateBank(bank);
      if (problem)
        return NextResponse.json(
          { error: problem.message, field: problem.field, code: 'bank_invalid' },
          { status: 422 }
        );

      const { error: saveError } = await supabase
        .from('profiles')
        .update({
          bank_name: bank.bank_name,
          bank_account_title: bank.bank_account_title,
          bank_account_number: normalizeAccount(bank.bank_account_number),
        })
        .eq('id', memberId);

      if (saveError)
        return NextResponse.json(
          { error: `Could not save the bank details: ${saveError.message}` },
          { status: 400 }
        );
    }
  }

  // The fund's own limits, read from the database rather than the form.
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

  const purpose = (body.purpose ?? '').trim();

  const { data, error } = await supabase
    .from('fund_requests')
    .insert({
      user_id: memberId,
      fund_type_id: fundId,
      amount_requested: amount,
      purpose: purpose || null,
      status: 'requested',
      filed_by: user.id,
    })
    .select('*, fund_types(*), profiles!fund_requests_user_id_fkey(id, full_name, email, mobile)')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ request: data }, { status: 201 });
}
