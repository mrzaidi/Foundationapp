import { NextResponse } from 'next/server';
import { requireCapability } from '@/lib/admin-guard';
import { can } from '@/lib/permissions';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Pakistan keeps one offset all year, so month boundaries are exact. */
function pkMonths(count: number): string[] {
  const now = new Date(Date.now() + 5 * 60 * 60 * 1000);
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/**
 * GET /api/admin/donors/history?months=12 — giving and receiving, by month.
 *
 * Three questions the committee asks of a year at once: what came in each
 * month, who gave it, and who it reached. Answered from the rows themselves
 * rather than from any running total, so correcting a donation corrects every
 * figure here with it.
 */
export async function GET(request: Request) {
  const supabase = await createClient();

  /*
   * The monthly totals are budget figures, which every administrator may see.
   * Named givers and named recipients are not, so they are attached only for a
   * level that may look at donors — the dashboard reads this endpoint too.
   */
  const gate = await requireCapability('view_budget');
  if ('refusal' in gate) return gate.refusal;
  const namesAllowed = can(gate.level, 'view_donors');

  const url = new URL(request.url);
  const months = Math.min(Math.max(Number(url.searchParams.get('months') ?? 12), 3), 24);
  const window = pkMonths(months);
  const from = window[0];

  const [{ data: donationRows }, { data: transferRows }, { data: joinRows }] = await Promise.all([
    supabase
      .from('donations')
      .select('month, amount, donors(id, name, user_id, profiles:user_id(full_name))')
      .gte('month', from),
    supabase
      .from('fund_requests')
      .select('amount_requested, amount_approved, transferred_at, profiles!fund_requests_user_id_fkey(id, full_name)')
      .eq('status', 'transferred')
      .not('transferred_at', 'is', null),
    supabase
      .from('profiles')
      .select('created_at')
      .gte('created_at', `${from}T00:00:00.000+05:00`),
  ]);

  type Donation = {
    month: string;
    amount: number;
    donors: { id: string; name: string; profiles: { full_name: string } | null } | null;
  };
  type Transfer = {
    amount_requested: number;
    amount_approved: number | null;
    transferred_at: string;
    profiles: { id: string; full_name: string } | null;
  };

  const donations = (donationRows ?? []) as unknown as Donation[];
  const transfers = (transferRows ?? []) as unknown as Transfer[];

  /* ---- what came in, month by month ---- */
  const byMonth = new Map(window.map((m) => [m, { month: m, total: 0, donors: 0, joined: 0 }]));
  for (const d of donations) {
    const row = byMonth.get(d.month.slice(0, 10));
    if (!row) continue;
    row.total += Number(d.amount);
    row.donors += 1;
  }

  /* ---- who arrived, month by month ---- */
  for (const j of (joinRows ?? []) as { created_at: string }[]) {
    const month = new Date(new Date(j.created_at).getTime() + 5 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 8)
      .concat('01');
    const row = byMonth.get(month);
    if (row) row.joined += 1;
  }

  /* ---- who gave it, over the whole window ---- */
  const perDonor = new Map<string, { name: string; total: number; gifts: number }>();
  for (const d of donations) {
    if (!byMonth.has(d.month.slice(0, 10))) continue;
    const name = d.donors?.profiles?.full_name ?? d.donors?.name ?? 'Unknown';
    const e = perDonor.get(name) ?? { name, total: 0, gifts: 0 };
    e.total += Number(d.amount);
    e.gifts += 1;
    perDonor.set(name, e);
  }

  /* ---- who it reached ---- */
  const perMember = new Map<string, { name: string; total: number; grants: number }>();
  for (const t of transfers) {
    // Transfers are not filtered in SQL: the window is cut on Karachi time,
    // which Postgres cannot express in a plain gte on a timestamptz column.
    const month = new Date(new Date(t.transferred_at).getTime() + 5 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 8)
      .concat('01');
    if (!byMonth.has(month)) continue;

    const name = t.profiles?.full_name ?? 'Unknown';
    const e = perMember.get(name) ?? { name, total: 0, grants: 0 };
    e.total += Number(t.amount_approved ?? t.amount_requested);
    e.grants += 1;
    perMember.set(name, e);
  }

  const rank = <T extends { total: number }>(m: Map<string, T>) =>
    [...m.values()].sort((a, b) => b.total - a.total).slice(0, 8);

  return NextResponse.json({
    months: [...byMonth.values()],
    donors: namesAllowed ? rank(perDonor) : [],
    recipients: namesAllowed ? rank(perMember) : [],
    namesAllowed,
  });
}
