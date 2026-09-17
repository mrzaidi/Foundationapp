import { NextResponse } from 'next/server';
import { requireCapability } from '@/lib/admin-guard';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const isMonth = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** Pakistan keeps one offset all year, so this is exact rather than close. */
const PK = '+05:00';

/**
 * GET /api/admin/accounts/methods?month=YYYY-MM-01 — how grants were paid.
 *
 * Cash and bank transfer are not the same act. Cash leaves the office in
 * somebody's hand and is reconciled against a tin; a bank transfer is
 * reconciled against a statement. A treasurer closing a month needs the two
 * apart before either can be checked against anything.
 *
 * Read from the table rather than through a database function, deliberately:
 * `payment_method` has been recorded since migration 0014 and the totals are a
 * sum and a count. Adding a migration for arithmetic the application can do
 * would be one more thing for somebody to run before this works.
 */
export async function GET(request: Request) {
  const gate = await requireCapability('view_accounts');
  if ('refusal' in gate) return gate.refusal;

  const supabase = await createClient();
  const raw = new URL(request.url).searchParams.get('month');
  const month = isMonth(raw) ? raw : new Date().toISOString().slice(0, 10);

  const start = `${month.slice(0, 7)}-01`;
  const next = new Date(`${start}T00:00:00Z`);
  next.setUTCMonth(next.getUTCMonth() + 1);
  const end = next.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('fund_requests')
    .select('amount_requested, amount_approved, payment_method')
    .eq('status', 'transferred')
    .gte('transferred_at', `${start}T00:00:00.000${PK}`)
    .lt('transferred_at', `${end}T00:00:00.000${PK}`);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const rows = (data ?? []) as {
    amount_requested: number;
    amount_approved: number | null;
    payment_method: string | null;
  }[];

  const tally = { cash: 0, bank: 0, unrecorded: 0 };
  const counts = { cash: 0, bank: 0, unrecorded: 0 };

  for (const r of rows) {
    // The approved figure is what was actually paid once there is one.
    const amount = Number(r.amount_approved ?? r.amount_requested);
    // Anything other than the two we know about is unrecorded, not guessed at:
    // transfers made before 0014 have no method and inventing one would put a
    // figure in the cash column that nobody ever counted.
    const key =
      r.payment_method === 'cash' ? 'cash' : r.payment_method === 'bank' ? 'bank' : 'unrecorded';
    tally[key] += amount;
    counts[key] += 1;
  }

  return NextResponse.json({
    month: start,
    cash: tally.cash,
    bank: tally.bank,
    unrecorded: tally.unrecorded,
    counts,
    total: tally.cash + tally.bank + tally.unrecorded,
    transfers: rows.length,
  });
}
