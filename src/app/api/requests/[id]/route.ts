import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { RequestStatus } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STATUSES: RequestStatus[] = [
  'requested',
  'review',
  'accepted',
  'transferred',
  'rejected',
];

/** GET /api/requests/:id — full detail, including timeline and attachments. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

  // RLS decides whether this row is visible (own request, or any if admin).
  const { data, error } = await supabase
    .from('fund_requests')
    .select(
      '*, fund_types(*), profiles!fund_requests_user_id_fkey(id, full_name, email, mobile, city, country), request_attachments(*), request_events(*)'
    )
    .eq('id', id)
    .single();

  if (error || !data)
    return NextResponse.json({ error: 'Request not found.' }, { status: 404 });

  return NextResponse.json({ request: data });
}

/**
 * PATCH /api/requests/:id — admin moves the application along the pipeline.
 * Body: { status?, amount_approved?, admin_note?, transfer_ref? }
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin')
    return NextResponse.json({ error: 'Administrators only.' }, { status: 403 });

  let body: {
    status?: string;
    amount_approved?: number | null;
    admin_note?: string | null;
    transfer_ref?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const patch: Record<string, unknown> = { reviewed_by: user.id };

  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status as RequestStatus))
      return NextResponse.json({ error: 'Unknown status.' }, { status: 422 });
    patch.status = body.status;
  }

  if (body.amount_approved !== undefined) {
    if (body.amount_approved !== null) {
      const n = Number(body.amount_approved);
      if (!Number.isFinite(n) || n < 0)
        return NextResponse.json({ error: 'Invalid approved amount.' }, { status: 422 });
      patch.amount_approved = n;
    } else {
      patch.amount_approved = null;
    }
  }

  if (body.admin_note !== undefined) patch.admin_note = body.admin_note;
  if (body.transfer_ref !== undefined) patch.transfer_ref = body.transfer_ref;

  /*
   * A transfer cannot exceed the month's fund. There is a trigger enforcing
   * this too, but catching it here means the admin reads a sentence rather
   * than a Postgres exception — and finds out before the row is touched.
   */
  if (body.status === 'transferred') {
    const { data: current } = await supabase
      .from('fund_requests')
      .select('status, amount_approved, amount_requested')
      .eq('id', id)
      .single();

    if (current && current.status !== 'transferred') {
      const amount = Number(
        patch.amount_approved ?? current.amount_approved ?? current.amount_requested
      );

      const { data: fundRow } = await supabase.rpc('budget_status');
      const remaining = Number(
        (fundRow as { remaining?: number } | null)?.remaining ?? 0
      );

      if (Number.isFinite(amount) && amount > remaining)
        return NextResponse.json(
          {
            error:
              remaining <= 0
                ? 'There is nothing left in this month’s fund. Record a donation before transferring.'
                : `This transfer is ${amount.toLocaleString()} but only ${remaining.toLocaleString()} is left in this month’s fund.`,
            code: 'insufficient_fund',
            remaining,
          },
          { status: 422 }
        );
    }
  }

  const { data, error } = await supabase
    .from('fund_requests')
    .update(patch)
    .eq('id', id)
    .select('*, fund_types(*), profiles!fund_requests_user_id_fkey(id, full_name, email, mobile, city, country)')
    .single();

  if (error) {
    const shortFund = /is left in the .* fund|nothing left/i.test(error.message);
    return NextResponse.json(
      { error: error.message, ...(shortFund ? { code: 'insufficient_fund' } : {}) },
      { status: shortFund ? 422 : 400 }
    );
  }

  return NextResponse.json({ request: data });
}
