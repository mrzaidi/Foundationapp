import { NextResponse } from 'next/server';
import { formatAccount } from '@/lib/banks';
import { toCsv } from '@/lib/csv';
import { createClient } from '@/lib/supabase/server';
import type { Profile } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Family {
  user_id: string;
  head_name: string | null;
  father_name: string | null;
  father_mobile: string | null;
  father_status: string | null;
  address: string | null;
  total_members: number | null;
  male_count: number | null;
  female_count: number | null;
  members: { name: string | null; age: number | null; relation: string | null }[] | null;
  income_sources: string[] | null;
  income_source_other: string | null;
  monthly_income: number | null;
  monthly_expense: number | null;
  house_type: string | null;
  has_bank_account: boolean | null;
  bill_ke: number | null;
  rent: number | null;
  education_expense: number | null;
  medical_expense: number | null;
  fund_reason: string | null;
}

const yesNo = (v: boolean | null | undefined) => (v === null || v === undefined ? '' : v ? 'Yes' : 'No');
const num = (v: number | null | undefined) => (v === null || v === undefined ? '' : Number(v));
const day = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : '');

/**
 * GET /api/admin/members/export?q=&role= — every member, one row each.
 *
 * One wide sheet rather than several: an admin exporting this is going to sort
 * and filter it in Excel, and a workbook split across tabs is worse for that
 * than columns they can hide.
 *
 * It honours the search and role filter from the members screen, so what
 * downloads is what was on the page. Family details are folded in where they
 * exist, because a household is the thing the committee actually reviews.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin')
    return NextResponse.json({ error: 'Administrators only.' }, { status: 403 });

  const url = new URL(request.url);
  const q = url.searchParams.get('q')?.trim() ?? '';
  const role = url.searchParams.get('role') ?? 'all';

  let query = supabase.from('profiles').select('*').order('created_at', { ascending: false });
  if (role !== 'all') query = query.eq('role', role);
  if (q) query = query.or(`full_name.ilike.%${q}%,email.ilike.%${q}%,mobile.ilike.%${q}%`);

  const { data: profileRows, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const members = (profileRows ?? []) as Profile[];
  const ids = members.map((m) => m.id);

  /* ---- what each of them has applied for ---- */
  const { data: reqRows } = ids.length
    ? await supabase
        .from('fund_requests')
        .select('user_id, status, amount_requested, amount_approved')
        .in('user_id', ids)
    : { data: [] };

  type Req = {
    user_id: string;
    status: string;
    amount_requested: number;
    amount_approved: number | null;
  };

  const activity = new Map<
    string,
    { total: number; open: number; approved: number; transferred: number; received: number }
  >();

  for (const r of (reqRows ?? []) as Req[]) {
    const e =
      activity.get(r.user_id) ?? { total: 0, open: 0, approved: 0, transferred: 0, received: 0 };
    e.total += 1;
    if (r.status === 'requested' || r.status === 'review') e.open += 1;
    if (r.status === 'accepted') e.approved += 1;
    if (r.status === 'transferred') {
      e.transferred += 1;
      e.received += Number(r.amount_approved ?? r.amount_requested);
    }
    activity.set(r.user_id, e);
  }

  /* ---- their households, where recorded ---- */
  // Absent until migration 0011; the columns stay and simply come out blank.
  const families = new Map<string, Family>();
  if (ids.length) {
    const { data: famRows } = await supabase.from('family_details').select('*').in('user_id', ids);
    for (const f of (famRows ?? []) as Family[]) families.set(f.user_id, f);
  }

  const header = [
    'Full name',
    'Gender',
    'Age',
    'City',
    'Country',
    'Email',
    'Mobile',
    'Role',
    'Blocked',
    'Registered',
    'CNIC on file',
    'Bank',
    'Account holder',
    'IBAN / account',
    'Applications',
    'Awaiting decision',
    'Approved',
    'Transferred',
    'Total received (PKR)',
    'Head of family',
    'Father',
    'Father mobile',
    'Father status',
    'Address',
    'Family members',
    'Male',
    'Female',
    'Household',
    'Income sources',
    'Monthly income (PKR)',
    'Monthly expense (PKR)',
    'House type',
    'Has bank account',
    'Electricity KE (PKR)',
    'Rent (PKR)',
    'Education (PKR)',
    'Medicine (PKR)',
    'Why the fund is needed',
  ];

  const rows: unknown[][] = [
    [`Subaidar Hasnain Foundation — members`],
    [
      `Generated ${new Date().toISOString().slice(0, 10)}`,
      q ? `Search: ${q}` : '',
      role !== 'all' ? `Role: ${role}` : '',
    ],
    [],
    header,
    ...members.map((m) => {
      const a = activity.get(m.id);
      const f = families.get(m.id);

      // One cell per household, so the sheet stays one row per member.
      const household = (f?.members ?? [])
        .filter((p) => p.name || p.age !== null || p.relation)
        .map((p) => {
          const bits = [p.age !== null ? `${p.age}` : '', p.relation ?? ''].filter(Boolean);
          return bits.length ? `${p.name ?? '—'} (${bits.join(', ')})` : (p.name ?? '—');
        })
        .join('; ');

      const sources = (f?.income_sources ?? [])
        .map((s) => s[0].toUpperCase() + s.slice(1))
        .join(', ');

      return [
        m.full_name,
        m.gender,
        m.age,
        m.city,
        m.country,
        m.email,
        m.mobile,
        m.role,
        yesNo(m.is_blocked),
        day(m.created_at),
        m.nic_path ? 'Yes' : 'No',
        m.bank_name ?? '',
        m.bank_account_title ?? '',
        formatAccount(m.bank_account_number),
        a?.total ?? 0,
        a?.open ?? 0,
        a?.approved ?? 0,
        a?.transferred ?? 0,
        a?.received ?? 0,
        f?.head_name ?? '',
        f?.father_name ?? '',
        f?.father_mobile ?? '',
        f?.father_status ?? '',
        f?.address ?? '',
        num(f?.total_members),
        num(f?.male_count),
        num(f?.female_count),
        household,
        sources + (f?.income_source_other ? ` (${f.income_source_other})` : ''),
        num(f?.monthly_income),
        num(f?.monthly_expense),
        f?.house_type ?? '',
        yesNo(f?.has_bank_account),
        num(f?.bill_ke),
        num(f?.rent),
        num(f?.education_expense),
        num(f?.medical_expense),
        f?.fund_reason ?? '',
      ];
    }),
  ];

  const stamp = new Date().toISOString().slice(0, 10);

  return new NextResponse(toCsv(rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="shf-members-${stamp}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
