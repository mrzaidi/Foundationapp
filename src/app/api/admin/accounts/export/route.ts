import { NextResponse } from 'next/server';
import { requireCapability } from '@/lib/admin-guard';
import { toCsv } from '@/lib/csv';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const isMonth = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

const monthName = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

const shortMonth = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });

const dayLabel = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

interface Entry {
  on_date: string;
  direction: 'in' | 'out';
  party: string;
  kind: string;
  reference: string | null;
  amount: number;
  note: string | null;
  balance: number;
}

interface Ledger {
  month: string;
  opening: number;
  received: number;
  paid: number;
  closing: number;
  committed: number;
  entries: Entry[];
}

interface MonthRow {
  month: string;
  opening: number;
  received: number;
  paid: number;
}

/**
 * GET /api/admin/accounts/export?month=YYYY-MM-01 — the account book as a file.
 *
 * The screen is for reading; this is for the people who need it in a
 * spreadsheet — a treasurer reconciling against a bank statement, an auditor,
 * a committee paper. So it is the same book in the same order: what the month
 * opened with, every movement with its running balance, what it closed with,
 * and then the months around it.
 *
 * Amounts go out as plain numbers, unformatted and unquoted, because a column
 * of "PKR 12,500" is text that Excel will not add up — and a total somebody
 * has to retype by hand is a total that will eventually be retyped wrongly.
 */
export async function GET(request: Request) {
  const gate = await requireCapability('view_accounts');
  if ('refusal' in gate) return gate.refusal;

  const supabase = await createClient();
  const raw = new URL(request.url).searchParams.get('month');
  const month = isMonth(raw) ? raw : new Date().toISOString().slice(0, 10);

  const [{ data: ledgerData, error: ledgerErr }, { data: monthsData }] = await Promise.all([
    supabase.rpc('account_ledger', { p_month: month }),
    supabase.rpc('account_months', { p_months: 12 }),
  ]);

  if (ledgerErr) return NextResponse.json({ error: ledgerErr.message }, { status: 400 });
  if (!ledgerData) return NextResponse.json({ error: 'Administrators only.' }, { status: 403 });

  const ledger = ledgerData as Ledger;
  const months = (monthsData ?? []) as MonthRow[];
  const label = monthName(ledger.month);

  const rows: unknown[][] = [
    ['Mohammad Husnain Foundation'],
    ['Accounts', label],
    ['Generated', new Date().toLocaleString('en-GB', { timeZone: 'Asia/Karachi' })],
    [],

    ['SUMMARY'],
    ['Brought forward', Number(ledger.opening)],
    ['Received this month', Number(ledger.received)],
    ['Paid out this month', Number(ledger.paid)],
    ['Carried forward', Number(ledger.closing)],
    ['Approved, awaiting transfer', Number(ledger.committed)],
    ['Uncommitted', Number(ledger.closing) - Number(ledger.committed)],
    [],

    ['LEDGER'],
    ['Date', 'Detail', 'Reference', 'Type', 'In', 'Out', 'Balance', 'Note'],
    // The opening line is not a movement and carries no amount, but a book
    // that starts mid-air cannot be reconciled against anything.
    ['', 'Brought forward', '', '', '', '', Number(ledger.opening), ''],
  ];

  for (const e of ledger.entries ?? []) {
    rows.push([
      dayLabel(e.on_date),
      e.party,
      e.reference ?? '',
      e.kind,
      e.direction === 'in' ? Number(e.amount) : '',
      e.direction === 'out' ? Number(e.amount) : '',
      Number(e.balance),
      e.note ?? '',
    ]);
  }

  rows.push(
    ['', 'Carried forward', '', '', Number(ledger.received), Number(ledger.paid), Number(ledger.closing), ''],
    [],
    ['MONTH BY MONTH'],
    ['Month', 'Opened with', 'In', 'Out', 'Closed with']
  );

  // Oldest first here, unlike the screen: a spreadsheet is read downwards and
  // a running balance that goes backwards is unreadable.
  for (const m of [...months].sort((a, b) => a.month.localeCompare(b.month))) {
    rows.push([
      shortMonth(m.month),
      Number(m.opening),
      Number(m.received),
      Number(m.paid),
      Number(m.opening) + Number(m.received) - Number(m.paid),
    ]);
  }

  rows.push(
    [],
    ['All amounts in PKR.'],
    ['Each month opens with what the previous month closed with.']
  );

  const filename = `accounts-${ledger.month.slice(0, 7)}.csv`;

  return new NextResponse(toCsv(rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
