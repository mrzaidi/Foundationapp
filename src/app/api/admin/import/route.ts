import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const isMonth = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

interface Incoming {
  /** Whatever identified the donor in the sheet — email preferred, name accepted. */
  key: string;
  amount: number | null;
  /** The cell had text in it that is not a number. Never treated as blank. */
  invalid?: boolean;
}

type Outcome = {
  key: string;
  amount: number | null;
  action: 'record' | 'clear' | 'unchanged' | 'skip';
  reason?: string;
  donor?: string;
};

/**
 * POST /api/admin/import — record a month of donations from a spreadsheet.
 *
 * Two passes by design. With `apply` false (the default) nothing is written and
 * the caller gets the row-by-row outcome to show the admin; only a second call
 * with `apply` true commits it. This moves money figures, and an import that
 * silently half-applies is worse than one that refuses.
 *
 * Donors are matched by email first and name second, both case-insensitively.
 * A row that matches nothing is reported, never guessed at.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin')
    return NextResponse.json({ error: 'Administrators only.' }, { status: 403 });

  let body: { month?: string; rows?: Incoming[]; apply?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  if (!isMonth(body.month))
    return NextResponse.json({ error: 'Pick a month to import into.' }, { status: 422 });
  const month = `${body.month.slice(0, 7)}-01`;

  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (!rows.length)
    return NextResponse.json({ error: 'The file had no donation rows.' }, { status: 422 });

  /* ---- who we can match against ---- */
  const { data: donorRows, error: listErr } = await supabase.rpc('donor_month', { p_month: month });
  if (listErr) return NextResponse.json({ error: listErr.message }, { status: 400 });

  type DonorRow = {
    id: string;
    name: string | null;
    email: string | null;
    given: number | null;
  };
  const donors = (donorRows ?? []) as DonorRow[];

  const byEmail = new Map<string, DonorRow>();
  const byName = new Map<string, DonorRow>();
  for (const d of donors) {
    if (d.email) byEmail.set(d.email.trim().toLowerCase(), d);
    if (d.name) byName.set(d.name.trim().toLowerCase(), d);
  }

  const outcomes: Outcome[] = [];
  const writes: { donor: DonorRow; amount: number | null }[] = [];

  for (const raw of rows) {
    const key = String(raw.key ?? '').trim();
    if (!key) {
      outcomes.push({ key, amount: raw.amount, action: 'skip', reason: 'No donor in this row.' });
      continue;
    }

    const donor = byEmail.get(key.toLowerCase()) ?? byName.get(key.toLowerCase());
    if (!donor) {
      outcomes.push({
        key,
        amount: raw.amount,
        action: 'skip',
        reason: 'No donor with that email or name — add them first.',
      });
      continue;
    }

    // A cell reading "abc" is a typo. Clearing a donation over one would be
    // a silent loss of money, so it is refused rather than read as blank.
    if (raw.invalid) {
      outcomes.push({
        key,
        amount: null,
        action: 'skip',
        reason: 'That amount is not a number — left as it was.',
        donor: donor.name ?? key,
      });
      continue;
    }

    const amount = raw.amount == null ? null : Number(raw.amount);
    if (amount !== null && (!Number.isFinite(amount) || amount < 0)) {
      outcomes.push({ key, amount: raw.amount, action: 'skip', reason: 'Not a valid amount.', donor: donor.name ?? key });
      continue;
    }

    const current = donor.given == null ? null : Number(donor.given);
    const next = amount === 0 ? null : amount;

    if (current === next) {
      outcomes.push({ key, amount: next, action: 'unchanged', donor: donor.name ?? key });
      continue;
    }

    outcomes.push({
      key,
      amount: next,
      action: next === null ? 'clear' : 'record',
      donor: donor.name ?? key,
    });
    writes.push({ donor, amount: next });
  }

  const summary = {
    record: outcomes.filter((o) => o.action === 'record').length,
    clear: outcomes.filter((o) => o.action === 'clear').length,
    unchanged: outcomes.filter((o) => o.action === 'unchanged').length,
    skip: outcomes.filter((o) => o.action === 'skip').length,
    total: outcomes
      .filter((o) => o.action === 'record')
      .reduce((s, o) => s + Number(o.amount ?? 0), 0),
  };

  if (!body.apply) return NextResponse.json({ preview: true, month, outcomes, summary });

  /* ---- commit ---- */
  const toUpsert = writes.filter((w) => w.amount !== null);
  const toDelete = writes.filter((w) => w.amount === null).map((w) => w.donor.id);

  /*
   * A spreadsheet states what a donor gave in the month, as one figure. Now
   * that a donor can have several gifts, appending would make a second import
   * of the same sheet count everything twice — so the month is replaced
   * rather than added to: the existing rows go, and the sheet's figure
   * becomes the single row for that donor.
   *
   * Rows whose total already matches the sheet never reach here — they are
   * marked unchanged above — so a month recorded gift by gift in the portal
   * is not flattened by an import that agrees with it.
   */
  if (toUpsert.length) {
    const { error: clearErr } = await supabase
      .from('donations')
      .delete()
      .eq('month', month)
      .in(
        'donor_id',
        toUpsert.map((w) => w.donor.id)
      );
    if (clearErr) return NextResponse.json({ error: clearErr.message }, { status: 400 });

    const { error } = await supabase.from('donations').insert(
      toUpsert.map((w) => ({
        donor_id: w.donor.id,
        month,
        amount: w.amount as number,
        received_on: new Date().toISOString().slice(0, 10),
        recorded_by: user.id,
      }))
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (toDelete.length) {
    const { error } = await supabase
      .from('donations')
      .delete()
      .eq('month', month)
      .in('donor_id', toDelete);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ preview: false, month, outcomes, summary });
}
