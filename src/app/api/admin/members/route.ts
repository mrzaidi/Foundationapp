import { NextResponse } from 'next/server';
import { adminIdentity, forgetIdentities, requireCapability } from '@/lib/admin-guard';
import { mailReady, sendInBackground } from '@/lib/mailer';
import { welcomeEmail } from '@/lib/emails';
import { columnReady } from '@/lib/schema';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Established once per request and shared — see lib/admin-guard. */
async function requireAdmin() {
  const { supabase, signedIn, identity } = await adminIdentity();
  if (!signedIn)
    return { error: 'Not authenticated.', status: 401 as const, supabase, user: null };
  if (!identity)
    return { error: 'Administrators only.', status: 403 as const, supabase, user: null };

  return { error: null, status: 200 as const, supabase, user: identity.user };
}

/** GET /api/admin/members?q=&limit=&offset= */
export async function GET(request: Request) {
  const { error: authError, status, supabase } = await requireAdmin();
  if (authError) return NextResponse.json({ error: authError }, { status });

  const url = new URL(request.url);
  const q = url.searchParams.get('q')?.trim();
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), 200);
  const offset = Number(url.searchParams.get('offset') ?? 0);

  let query = supabase
    .from('profiles')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (q) query = query.or(`full_name.ilike.%${q}%,email.ilike.%${q}%,mobile.ilike.%${q}%`);

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ members: data ?? [], total: count ?? 0 });
}

/** PATCH /api/admin/members — { id, role?, is_blocked? } */
export async function PATCH(request: Request) {
  const { error: authError, status, supabase } = await requireAdmin();
  if (authError) return NextResponse.json({ error: authError }, { status });

  let body: { id?: string; role?: string; is_blocked?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  if (!body.id) return NextResponse.json({ error: 'Missing member id.' }, { status: 422 });

  const patch: Record<string, unknown> = {};
  if (body.role !== undefined) {
    if (!['member', 'admin'].includes(body.role))
      return NextResponse.json({ error: 'Unknown role.' }, { status: 422 });
    patch.role = body.role;
  }
  if (body.is_blocked !== undefined) patch.is_blocked = Boolean(body.is_blocked);

  if (!Object.keys(patch).length)
    return NextResponse.json({ error: 'Nothing to update.' }, { status: 422 });

  const { data, error } = await supabase
    .from('profiles')
    .update(patch)
    .eq('id', body.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Making somebody an administrator, or taking it away, must be felt at once
  // rather than after the guard's cache has aged out.
  if (patch.role !== undefined || patch.is_blocked) forgetIdentities();

  return NextResponse.json({ member: data });
}

/**
 * POST /api/admin/members — create a member, or another administrator.
 *
 * Most people register themselves. This is for the ones who cannot: someone at
 * the foundation office with no email of their own, a household registered on
 * a relative's phone. So the administrator sets the password and hands it over,
 * rather than an invite being emailed to an inbox that may not exist.
 *
 * Bank details are optional here, unlike self-registration. An administrator
 * taking down someone's details at a desk often does not have their account
 * number yet, and the trigger from 0007 still refuses to let that member apply
 * for a fund until one is on file — so the money stays protected either way.
 */
export async function POST(request: Request) {
  const { error: authError, status, user } = await requireAdmin();
  if (authError) return NextResponse.json({ error: authError }, { status });

  const gate = await requireCapability('create_members');
  if ('refusal' in gate) return gate.refusal;

  let body: {
    full_name?: string;
    gender?: string;
    age?: number | string;
    country?: string;
    city?: string;
    email?: string;
    mobile?: string;
    password?: string;
    role?: string;
    admin_level?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const full_name = (body.full_name ?? '').trim();
  const gender = (body.gender ?? '').trim().toLowerCase();
  const age = Number(body.age);
  const country = (body.country ?? '').trim() || 'Pakistan';
  const city = (body.city ?? '').trim();
  const email = (body.email ?? '').trim().toLowerCase();
  const mobile = (body.mobile ?? '').trim();
  const password = body.password ?? '';
  const role = body.role === 'admin' ? 'admin' : 'member';
  const adminLevelWanted = ['master', 'reports', 'intake'].includes(body.admin_level ?? '')
    ? (body.admin_level as string)
    : 'master';

  // Making another administrator is a different permission from adding a
  // member, and only a master has it.
  if (role === 'admin') {
    const adminGate = await requireCapability('create_admins');
    if ('refusal' in adminGate) return adminGate.refusal;
  }

  const errors: Record<string, string> = {};
  if (full_name.length < 3) errors.full_name = 'Enter their full name.';
  if (!['male', 'female', 'other'].includes(gender)) errors.gender = 'Select a gender.';
  if (!Number.isFinite(age) || age < 12 || age > 120) errors.age = 'Enter a valid age (12–120).';
  if (!city) errors.city = 'Enter their city.';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errors.email = 'Enter a valid email address.';
  if (mobile.replace(/\D/g, '').length < 10) errors.mobile = 'Enter a valid mobile number.';
  if (password.length < 8) errors.password = 'Password must be at least 8 characters.';

  if (Object.keys(errors).length)
    return NextResponse.json({ error: 'Please check the form.', errors }, { status: 422 });

  let admin;
  try {
    admin = createAdminClient();
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    // No inbox round-trip: these accounts are made at the office, in person.
    email_confirm: true,
    user_metadata: { full_name },
  });

  if (createError || !created?.user) {
    const msg = createError?.message ?? 'Could not create the account.';
    const duplicate = /already|registered|exists/i.test(msg);
    return NextResponse.json(
      { error: duplicate ? 'Someone is already registered with that email address.' : msg },
      { status: duplicate ? 409 : 400 }
    );
  }

  // Absent until migration 0015; without it every administrator is a master,
  // which is what they all were before levels existed.
  const levelsReady = await columnReady(admin, 'profiles', 'admin_level');

  const { error: profileError } = await admin.from('profiles').insert({
    id: created.user.id,
    full_name,
    gender,
    age,
    country,
    city,
    email,
    mobile,
    role,
    ...(role === 'admin' && levelsReady ? { admin_level: adminLevelWanted } : {}),
  });

  if (profileError) {
    // Never leave an auth user behind with no profile to go with it.
    await admin.auth.admin.deleteUser(created.user.id);
    return NextResponse.json({ error: profileError.message }, { status: 400 });
  }

  console.info();

  // Confirms the address works and says where to sign in. Deliberately without
  // the password — see lib/emails.
  if (mailReady()) sendInBackground(welcomeEmail(email, full_name));

  return NextResponse.json(
    {
      ok: true,
      id: created.user.id,
      role,
      message:
        role === 'admin'
          ? `${full_name} can now sign in as an administrator.`
          : `${full_name} can now sign in. Add their bank details before they apply for a fund.`,
    },
    { status: 201 }
  );
}
