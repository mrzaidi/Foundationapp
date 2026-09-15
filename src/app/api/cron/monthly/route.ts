import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/cron/monthly — file this month's standing applications.
 *
 * A fallback for projects without pg_cron, and a way to run the job by hand.
 * The work itself lives in Postgres (`generate_recurring_requests`), which is
 * idempotent: an arrangement that already has an application this month is
 * skipped, so it does not matter whether this runs once, twice, or alongside
 * the database's own schedule.
 *
 * Vercel sends `Authorization: Bearer $CRON_SECRET` when that variable is set.
 * Without a secret configured the route refuses rather than running open —
 * this creates real applications, so an unauthenticated caller must not.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret)
    return NextResponse.json(
      { error: 'CRON_SECRET is not configured, so this endpoint is disabled.' },
      { status: 503 }
    );

  if (request.headers.get('authorization') !== `Bearer ${secret}`)
    return NextResponse.json({ error: 'Not authorised.' }, { status: 401 });

  let admin;
  try {
    admin = createAdminClient();
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  const { data, error } = await admin.rpc('generate_recurring_requests');
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const result = Array.isArray(data) ? data[0] : data;
  return NextResponse.json({
    ok: true,
    created: result?.created ?? 0,
    skipped: result?.skipped ?? 0,
  });
}
