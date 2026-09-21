import { NextResponse } from 'next/server';
import { requireCapability } from '@/lib/admin-guard';
import { buildDonationReceipt, donationReference } from '@/lib/donation-receipt-pdf';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/donations/:id/receipt — the receipt for a donation.
 *
 * Behind view_donors, not view_budget: the document names the donor, and the
 * level trusted with the month's balance but not the donor list must not be
 * able to read a name out of it.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const gate = await requireCapability('view_donors');
  if ('refusal' in gate) return gate.refusal;

  const supabase = await createClient();

  const { data, error } = await supabase
    .from('donations')
    .select('id, amount, donation_type, received_on, month, note, donors(name, contact, profiles:user_id(full_name, mobile))')
    .eq('id', id)
    .single();

  if (error || !data) return NextResponse.json({ error: 'Donation not found.' }, { status: 404 });

  const d = data as unknown as {
    id: string;
    amount: number;
    donation_type: string | null;
    received_on: string;
    month: string;
    note: string | null;
    donors: {
      name: string | null;
      contact: string | null;
      profiles: { full_name: string; mobile: string } | null;
    } | null;
  };

  // The account is the donor; the donor row's own name is the fallback for
  // rows that predate donors being members.
  const donorName = d.donors?.profiles?.full_name ?? d.donors?.name ?? null;
  const donorContact = d.donors?.profiles?.mobile ?? d.donors?.contact ?? null;

  const bytes = await buildDonationReceipt({
    id: d.id,
    donorName,
    donorContact,
    amount: Number(d.amount),
    donationType: d.donation_type,
    receivedOn: d.received_on,
    month: d.month,
    note: d.note,
  });

  const reference = donationReference(d.id, d.received_on);

  return new NextResponse(Buffer.from(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="donation-${reference}.pdf"`,
      'Cache-Control': 'no-store',
    },
  });
}
