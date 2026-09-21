import { requireCapability } from '@/lib/admin-guard';
import { NextResponse } from 'next/server';
import { toCsv } from '@/lib/csv';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const isMonth = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** Pakistan has no daylight saving, so one fixed offset is exact all year. */
const PK = '+05:00';
const monthName = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

/**
 * GET /api/admin/export?month=YYYY-MM-01 — the month as one CSV.
 *
 * Three blocks in one file, separated by blank lines: what came in, what went
 * out, and what is left. Excel reads that as a statement, which is what the
 * committee actually wants — a single sheet they can print or email, not three
 * downloads to reconcile by hand.
 *
 * The donations block doubles as the import template: fill the Amount column
 * and send it back.
 */
export async function GET(request: Request) {
  const gate = await requireCapability('view_budget');
  if ('refusal' in gate) return gate.refusal;

  const { supabase } = gate;

  const raw = new URL(request.url).searchParams.get('month');
  const month = isMonth(raw) ? raw : new Date().toISOString().slice(0, 10);
  const start = `${month.slice(0, 7)}-01`;
  const nextMonth = new Date(`${start}T00:00:00Z`);
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
  const end = nextMonth.toISOString().slice(0, 10);

  /* ---- what came in ---- */
  const { data: donorRows, error: donorErr } = await supabase.rpc('donor_month', {
    p_month: start,
  });
  if (donorErr) return NextResponse.json({ error: donorErr.message }, { status: 400 });

  type DonorRow = {
    name: string | null;
    email: string | null;
    contact: string | null;
    monthly_pledge: number | null;
    given: number | null;
    received_on: string | null;
  };
  const donors = (donorRows ?? []) as DonorRow[];

  /* ---- what went out ---- */
  const { data: transferRows, error: txErr } = await supabase
    .from('fund_requests')
    .select(
      'reference, amount_requested, amount_approved, transferred_at, transfer_ref, fund_types(name), profiles!fund_requests_user_id_fkey(full_name, email, mobile)'
    )
    .eq('status', 'transferred')
    .gte('transferred_at', `${start}T00:00:00.000${PK}`)
    .lt('transferred_at', `${end}T00:00:00.000${PK}`)
    .order('transferred_at');

  if (txErr) return NextResponse.json({ error: txErr.message }, { status: 400 });

  type Tx = {
    reference: string;
    amount_requested: number;
    amount_approved: number | null;
    transferred_at: string | null;
    transfer_ref: string | null;
    fund_types: { name: string } | null;
    profiles: { full_name: string; email: string; mobile: string } | null;
  };
  const transfers = (transferRows ?? []) as unknown as Tx[];

  const donated = donors.reduce((s, d) => s + Number(d.given ?? 0), 0);
  const paid = transfers.reduce((s, t) => s + Number(t.amount_approved ?? t.amount_requested), 0);

  const day = (iso: string | null) => (iso ? iso.slice(0, 10) : '');

  const rows: unknown[][] = [
    [`Mohammad Husnain Foundation — ${monthName(start)}`],
    [`Generated ${new Date().toISOString().slice(0, 10)}`],
    [],

    ['DONATIONS RECEIVED'],
    ['Donor', 'Email', 'Contact', 'Monthly pledge (PKR)', 'Amount (PKR)', 'Received on'],
    ...donors.map((d) => [
      d.name ?? '',
      d.email ?? '',
      d.contact ?? '',
      Number(d.monthly_pledge ?? 0),
      d.given == null ? '' : Number(d.given),
      day(d.received_on),
    ]),
    ['', '', '', 'Total received', donated, ''],
    [],

    ['TRANSFERS MADE'],
    ['Reference', 'Member', 'Email', 'Mobile', 'Fund', 'Amount (PKR)', 'Transfer ref', 'Date'],
    ...transfers.map((t) => [
      t.reference,
      t.profiles?.full_name ?? '',
      t.profiles?.email ?? '',
      t.profiles?.mobile ?? '',
      t.fund_types?.name ?? '',
      Number(t.amount_approved ?? t.amount_requested),
      t.transfer_ref ?? '',
      day(t.transferred_at),
    ]),
    ['', '', '', '', 'Total transferred', paid, '', ''],
    [],

    ['SUMMARY'],
    ['Month', monthName(start)],
    ['Donations received (the month’s fund)', donated],
    ['Transferred to members', paid],
    ['Remaining', donated - paid],
    ['Donors who gave', donors.filter((d) => d.given != null).length],
    ['Donors on the list', donors.length],
    ['Transfers made', transfers.length],
  ];

  const filename = `shf-${start.slice(0, 7)}.csv`;

  return new NextResponse(toCsv(rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
