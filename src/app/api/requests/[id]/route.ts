import { NextResponse } from 'next/server';
import { mailReady, sendInBackground } from '@/lib/mailer';
import { decisionEmail, transferEmail } from '@/lib/emails';
import { buildReceipt } from '@/lib/invoice-pdf';
import { columnReady } from '@/lib/schema';
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
    amount_requested?: number;
    amount_approved?: number | null;
    admin_note?: string | null;
    transfer_ref?: string | null;
    payment_method?: string | null;
    funded_from?: string | null;
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

  /*
   * Correcting what was asked for.
   *
   * Applications are often filled in at the office on somebody's behalf, so a
   * mistyped figure is the committee's mistake to fix rather than the member's
   * to live with. It is still their stated request, so it can only be changed
   * while the application is undecided — once money has moved, the record has
   * to match the receipt that went out with it.
   */
  if (body.amount_requested !== undefined) {
    const n = Number(body.amount_requested);
    if (!Number.isFinite(n) || n <= 0)
      return NextResponse.json({ error: 'Enter a valid amount.' }, { status: 422 });

    const { data: current } = await supabase
      .from('fund_requests')
      .select('status')
      .eq('id', id)
      .single();

    if (current?.status === 'transferred')
      return NextResponse.json(
        { error: 'This has already been transferred — the amount cannot be changed now.' },
        { status: 409 }
      );

    patch.amount_requested = n;
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
   * Cash or bank. Dropped silently until migration 0014 lands, so a deploy
   * that outruns the SQL records the transfer without it rather than refusing
   * the whole thing — the receipt then prints "Not recorded" instead of a
   * guess, and the transfer itself is never held up.
   */
  // Which kind of giving the grant comes out of. Unrecognised values are
  // refused rather than defaulted: paying a Zakat grant out of Khums because
  // a typo fell through would be a real accounting error, and the transfer
  // dialog only ever sends one of the eight.
  if (body.funded_from !== undefined) {
    const KINDS = [
      'khums', 'zakat', 'zakat_al_fitr', 'sadaqah',
      'fidyah', 'kaffarah', 'nadhr', 'general',
    ];
    if (body.funded_from !== null && !KINDS.includes(body.funded_from))
      return NextResponse.json({ error: 'Unknown donation category.' }, { status: 422 });
    if (await columnReady(supabase, 'fund_requests', 'funded_from'))
      patch.funded_from = body.funded_from;
  }

  if (body.payment_method !== undefined) {
    if (body.payment_method !== null && !['cash', 'bank'].includes(body.payment_method))
      return NextResponse.json({ error: 'Unknown payment method.' }, { status: 422 });
    if (await columnReady(supabase, 'fund_requests', 'payment_method'))
      patch.payment_method = body.payment_method;
  }

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

  /*
   * Tell the member. Three moments only — approved, rejected, transferred —
   * because those are the ones they would otherwise have to keep opening the
   * portal to learn.
   *
   * Sent after the update has committed, and never awaited: money that has
   * moved has moved, and an email provider having a bad afternoon must not
   * turn a recorded transfer into a failed request.
   */
  if (body.status && mailReady()) {
    const row = data as unknown as {
      reference: string;
      status: string;
      amount_requested: number;
      amount_approved: number | null;
      transferred_at: string | null;
      transfer_ref: string | null;
      payment_method?: string | null;
    funded_from?: string | null;
      fund_types: { name: string } | null;
      profiles: { full_name: string; email: string; mobile: string } | null;
    };

    const member = row.profiles;
    const fund = row.fund_types?.name ?? 'a fund';
    const amount = Number(row.amount_approved ?? row.amount_requested);

    if (member?.email) {
      if (row.status === 'transferred') {
        // The receipt travels with the message, so nobody has to ask for it.
        let receipt: { content: string; name: string } | undefined;
        try {
          const pdf = await buildReceipt({
            reference: row.reference,
            receiverName: member.full_name,
            receiverNumber: member.mobile,
            fundType: fund,
            amount,
            paymentMethod: row.payment_method,
            paidAt: row.transferred_at ?? new Date().toISOString(),
            transferRef: row.transfer_ref,
          });
          receipt = {
            content: Buffer.from(pdf).toString('base64'),
            name: `receipt-${row.reference}.pdf`,
          };
        } catch (e) {
          // A receipt that will not render is not a reason to withhold the news.
          console.warn(`[email] receipt for ${row.reference} failed: ${(e as Error).message}`);
        }

        sendInBackground(
          transferEmail(
            member.email,
            member.full_name,
            { reference: row.reference, fund, amount, method: row.payment_method },
            receipt
          )
        );
      } else {
        const mail = decisionEmail(member.email, member.full_name, {
          reference: row.reference,
          fund,
          status: row.status,
          amount: row.amount_approved,
          note: typeof patch.admin_note === 'string' ? patch.admin_note : null,
        });
        if (mail) sendInBackground(mail);
      }
    }
  }

  return NextResponse.json({ request: data });
}
