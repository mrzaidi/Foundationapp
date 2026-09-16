import { NextResponse } from 'next/server';
import { buildReceipt } from '@/lib/invoice-pdf';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/requests/:id/invoice — the payment receipt for a transfer.
 *
 * Only for requests actually marked transferred: a receipt states that money
 * changed hands, and issuing one for an application still under review would
 * be a document from the foundation saying something untrue.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin')
    return NextResponse.json({ error: 'Administrators only.' }, { status: 403 });

  const { data, error } = await supabase
    .from('fund_requests')
    .select(
      '*, fund_types(name), profiles!fund_requests_user_id_fkey(full_name, mobile)'
    )
    .eq('id', id)
    .single();

  if (error || !data) return NextResponse.json({ error: 'Application not found.' }, { status: 404 });

  const r = data as unknown as {
    reference: string;
    status: string;
    amount_requested: number;
    amount_approved: number | null;
    transfer_ref: string | null;
    transferred_at: string | null;
    payment_method?: string | null;
    fund_types: { name: string } | null;
    profiles: { full_name: string; mobile: string } | null;
  };

  if (r.status !== 'transferred')
    return NextResponse.json(
      { error: 'A receipt can only be issued once the transfer has been made.' },
      { status: 409 }
    );

  const bytes = await buildReceipt({
    reference: r.reference,
    receiverName: r.profiles?.full_name ?? null,
    receiverNumber: r.profiles?.mobile ?? null,
    fundType: r.fund_types?.name ?? null,
    amount: Number(r.amount_approved ?? r.amount_requested),
    // Absent entirely until migration 0014; prints "Not recorded" rather than a guess.
    paymentMethod: r.payment_method,
    paidAt: r.transferred_at ?? new Date().toISOString(),
    transferRef: r.transfer_ref,
  });

  return new NextResponse(Buffer.from(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="receipt-${r.reference}.pdf"`,
      'Cache-Control': 'no-store',
    },
  });
}
