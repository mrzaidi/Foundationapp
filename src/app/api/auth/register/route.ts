import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { corsHeaders, preflight } from '@/lib/cors';

export const runtime = 'nodejs';

/** The native app posts here cross-origin, so the preflight must be answered. */
export function OPTIONS(request: Request) {
  return preflight(request);
}

interface Body {
  full_name?: string;
  gender?: string;
  age?: number | string;
  country?: string;
  city?: string;
  email?: string;
  mobile?: string;
  password?: string;
}

const GENDERS = ['male', 'female', 'other'];

export async function POST(request: Request) {
  const cors = corsHeaders(request);

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400, headers: cors });
  }

  const full_name = (body.full_name ?? '').trim();
  const gender = (body.gender ?? '').trim().toLowerCase();
  const age = Number(body.age);
  const country = (body.country ?? '').trim();
  const city = (body.city ?? '').trim();
  const email = (body.email ?? '').trim().toLowerCase();
  const mobile = (body.mobile ?? '').trim();
  const password = body.password ?? '';

  /* ---- validation (mirrors the DB constraints) ---- */
  const errors: Record<string, string> = {};
  if (full_name.length < 3) errors.full_name = 'Enter your full name.';
  if (!GENDERS.includes(gender)) errors.gender = 'Select a gender.';
  if (!Number.isFinite(age) || age < 12 || age > 120) errors.age = 'Enter a valid age (12–120).';
  if (!country) errors.country = 'Select your country.';
  if (!city) errors.city = 'Enter your city.';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errors.email = 'Enter a valid email address.';
  if (mobile.replace(/\D/g, '').length < 10) errors.mobile = 'Enter a valid mobile number.';
  if (password.length < 8) errors.password = 'Password must be at least 8 characters.';

  if (Object.keys(errors).length) {
    return NextResponse.json({ error: 'Please check the form.', errors }, { status: 422, headers: cors });
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500, headers: cors });
  }

  /* ---- create the auth user ---- */
  const { data: created, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // no inbox round-trip; members register at the office
    user_metadata: { full_name },
  });

  if (authError || !created?.user) {
    const msg = authError?.message ?? 'Could not create the account.';
    const duplicate = /already|registered|exists/i.test(msg);
    return NextResponse.json(
      {
        error: duplicate
          ? 'An account with this email already exists. Try signing in instead.'
          : msg,
      },
      { status: duplicate ? 409 : 400, headers: cors }
    );
  }

  /* ---- create the profile ---- */
  const { error: profileError } = await admin.from('profiles').insert({
    id: created.user.id,
    full_name,
    gender,
    age,
    country,
    city,
    email,
    mobile,
    role: 'member',
  });

  if (profileError) {
    // Don't leave an orphaned auth user behind.
    await admin.auth.admin.deleteUser(created.user.id);
    return NextResponse.json({ error: profileError.message }, { status: 400, headers: cors });
  }

  return NextResponse.json({ ok: true, user_id: created.user.id }, { status: 201, headers: cors });
}
