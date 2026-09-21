import { NextResponse } from 'next/server';
import { currentSession } from '@/lib/session';
import { columnReady } from '@/lib/schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Gradient classes and icon names the UI actually has. */
const GRADIENTS = ['g-brand', 'g-rose', 'g-amber', 'g-blue', 'g-plum', 'g-gold'];
const ICONS = [
  'calendar',
  'health',
  'basket',
  'bolt',
  'book',
  'heart',
  'wallet',
  'building',
  'shield',
  'users',
];

async function requireAdmin() {
  const { supabase, user } = await currentSession();
  if (!user) return { error: NextResponse.json({ error: 'Not authenticated.' }, { status: 401 }) };

  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin')
    return { error: NextResponse.json({ error: 'Administrators only.' }, { status: 403 }) };

  return { supabase };
}

/** GET /api/admin/funds — every fund, active or not. */
export async function GET() {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  const { data, error } = await gate.supabase!.from('fund_types').select('*').order('sort_order');
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ funds: data ?? [] });
}

/**
 * PATCH /api/admin/funds — edit one fund.
 * Body: { id, ...fields }
 *
 * `id` is the primary key and the storage/seed key both, so it is the one thing
 * that cannot be edited: renaming it would orphan every application filed
 * against it.
 */
export async function PATCH(request: Request) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  const supabase = gate.supabase!;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const id = String(body.id ?? '').trim();
  if (!id) return NextResponse.json({ error: 'Which fund?' }, { status: 422 });

  const patch: Record<string, unknown> = {};

  const text = (key: string, { required = false, max = 400 } = {}) => {
    if (!(key in body)) return null;
    const v = body[key] === null ? null : String(body[key]).trim();
    if (required && !v) return `${key.replace(/_/g, ' ')} cannot be empty.`;
    if (v && v.length > max) return `${key.replace(/_/g, ' ')} is too long.`;
    patch[key] = v || (required ? v : null);
    return null;
  };

  const problem =
    text('name', { required: true, max: 80 }) ??
    text('name_ur', { max: 80 }) ??
    text('description', { max: 400 }) ??
    text('description_ur', { max: 400 }) ??
    text('document_label', { required: true, max: 120 }) ??
    text('document_label_ur', { max: 120 });

  if (problem) return NextResponse.json({ error: problem }, { status: 422 });

  if ('gradient' in body) {
    const g = String(body.gradient);
    if (!GRADIENTS.includes(g))
      return NextResponse.json({ error: 'Unknown gradient.' }, { status: 422 });
    patch.gradient = g;
  }

  if ('icon' in body) {
    const i = String(body.icon);
    if (!ICONS.includes(i)) return NextResponse.json({ error: 'Unknown icon.' }, { status: 422 });
    patch.icon = i;
  }

  if ('document_required' in body) patch.document_required = Boolean(body.document_required);
  if ('is_active' in body) patch.is_active = Boolean(body.is_active);
  // Dropped rather than sent until 0009 has run: an unknown column would fail
  // the whole edit, so a fund's name could not be changed either.
  if ('is_recurring' in body && (await columnReady(supabase, 'fund_types', 'is_recurring')))
    patch.is_recurring = Boolean(body.is_recurring);

  if ('sort_order' in body) {
    const n = Number(body.sort_order);
    if (!Number.isInteger(n) || n < 0 || n > 999)
      return NextResponse.json({ error: 'Sort order must be 0–999.' }, { status: 422 });
    patch.sort_order = n;
  }

  // The range is the thing most likely to be edited, so it is the thing most
  // worth checking: a max below the min would make the fund impossible to apply
  // for, and the member would just see a form that always rejects them.
  const min = 'min_amount' in body ? Number(body.min_amount) : undefined;
  const max =
    'max_amount' in body
      ? body.max_amount === null || body.max_amount === ''
        ? null
        : Number(body.max_amount)
      : undefined;

  if (min !== undefined) {
    if (!Number.isFinite(min) || min < 1)
      return NextResponse.json({ error: 'Minimum must be at least 1.' }, { status: 422 });
    patch.min_amount = min;
  }
  if (max !== undefined) {
    if (max !== null && (!Number.isFinite(max) || max < 1))
      return NextResponse.json({ error: 'Maximum must be a positive amount.' }, { status: 422 });
    patch.max_amount = max;
  }

  if (min !== undefined || max !== undefined) {
    const { data: current } = await supabase
      .from('fund_types')
      .select('min_amount, max_amount')
      .eq('id', id)
      .single();

    const finalMin = min ?? Number(current?.min_amount ?? 0);
    const finalMax = max !== undefined ? max : (current?.max_amount ?? null);

    if (finalMax !== null && Number(finalMax) < finalMin)
      return NextResponse.json(
        { error: 'The maximum cannot be below the minimum.' },
        { status: 422 }
      );
  }

  if (!Object.keys(patch).length)
    return NextResponse.json({ error: 'Nothing to update.' }, { status: 422 });

  const { data, error } = await supabase
    .from('fund_types')
    .update(patch)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: 'Fund not found.' }, { status: 404 });

  return NextResponse.json({ fund: data });
}
