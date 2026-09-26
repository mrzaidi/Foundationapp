import { NextResponse } from 'next/server';
import { forgetIdentities, requireCapability } from '@/lib/admin-guard';
import { ALL_CAPABILITIES, type Capability } from '@/lib/permissions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SELECT = 'id, name, description, is_master, created_at, role_capabilities ( capability )';

interface RoleRow {
  id: string;
  name: string;
  description: string | null;
  is_master: boolean;
  created_at: string;
  role_capabilities: { capability: string }[] | null;
}

/** The shape the screens want: capabilities as a flat list, plus a count. */
const flatten = (r: RoleRow) => {
  const capabilities = (r.role_capabilities ?? []).map((c) => c.capability);
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    is_master: r.is_master,
    created_at: r.created_at,
    capabilities,
    capability_count: r.is_master ? ALL_CAPABILITIES.length : capabilities.length,
  };
};

const missingTables = (message: string) =>
  /roles|role_capabilities|schema cache|does not exist/i.test(message);

const notProvisioned = () =>
  NextResponse.json(
    {
      error: 'Roles need migration 0025. Run it, then try again.',
      code: 'migration_required',
    },
    { status: 503 }
  );

const clean = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/** Only the capabilities this app knows about, deduplicated. */
function wanted(input: unknown): Capability[] {
  if (!Array.isArray(input)) return [];
  const known = new Set(ALL_CAPABILITIES);
  return [...new Set(input.map(String))].filter((c): c is Capability =>
    known.has(c as Capability)
  );
}

/**
 * GET /api/admin/roles — every role, with what it grants.
 *
 * Readable by anyone who may manage roles. The account-creation form reads it
 * too, which is why a refusal here leaves that form offering only members
 * rather than breaking.
 */
export async function GET() {
  const gate = await requireCapability('manage_roles');
  if ('refusal' in gate) return gate.refusal;

  const { data, error } = await gate.supabase.from('roles').select(SELECT).order('name');

  if (error) return missingTables(error.message) ? notProvisioned() : NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ roles: (data as RoleRow[]).map(flatten) });
}

/** POST /api/admin/roles — make up a new role. */
export async function POST(request: Request) {
  const gate = await requireCapability('manage_roles');
  if ('refusal' in gate) return gate.refusal;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const name = clean(body.name);
  if (name.length < 2) return NextResponse.json({ error: 'Name the role.' }, { status: 422 });

  const capabilities = wanted(body.capabilities);

  const { data: role, error } = await gate.supabase
    .from('roles')
    .insert({ name, description: clean(body.description) || null })
    .select('id')
    .single();

  if (error) {
    if (missingTables(error.message)) return notProvisioned();
    const duplicate = /duplicate|unique/i.test(error.message);
    return NextResponse.json(
      { error: duplicate ? 'There is already a role with that name.' : error.message },
      { status: duplicate ? 409 : 400 }
    );
  }

  if (capabilities.length) {
    const { error: capError } = await gate.supabase
      .from('role_capabilities')
      .insert(capabilities.map((capability) => ({ role_id: role.id, capability })));
    if (capError) return NextResponse.json({ error: capError.message }, { status: 400 });
  }

  return NextResponse.json({ role: { id: role.id, name, capabilities } }, { status: 201 });
}

/**
 * PUT /api/admin/roles — rename a role, or change what it opens.
 *
 * Capabilities are replaced wholesale rather than diffed: the screen sends the
 * set of ticked boxes, and that set is what the role should be afterwards.
 * Anyone currently signed in under this role is re-read on their next request,
 * so a capability taken away stops working at once rather than at the end of
 * their session.
 */
export async function PUT(request: Request) {
  const gate = await requireCapability('manage_roles');
  if ('refusal' in gate) return gate.refusal;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const id = clean(body.id);
  if (!id) return NextResponse.json({ error: 'Which role?' }, { status: 422 });

  const { data: role, error: findError } = await gate.supabase
    .from('roles')
    .select('id, is_master')
    .eq('id', id)
    .maybeSingle();

  if (findError && missingTables(findError.message)) return notProvisioned();
  if (!role) return NextResponse.json({ error: 'Role not found.' }, { status: 404 });

  // The master role is what hands capabilities out. Editing it is the one way
  // to arrive at a foundation nobody can administer, so it is simply refused
  // here as well as by the trigger underneath.
  if (role.is_master)
    return NextResponse.json(
      { error: 'The master role always holds everything and cannot be changed.' },
      { status: 422 }
    );

  const name = clean(body.name);
  if (name.length < 2) return NextResponse.json({ error: 'Name the role.' }, { status: 422 });

  const { error: nameError } = await gate.supabase
    .from('roles')
    .update({ name, description: clean(body.description) || null })
    .eq('id', id);

  if (nameError) {
    const duplicate = /duplicate|unique/i.test(nameError.message);
    return NextResponse.json(
      { error: duplicate ? 'There is already a role with that name.' : nameError.message },
      { status: duplicate ? 409 : 400 }
    );
  }

  const capabilities = wanted(body.capabilities);

  const { error: clearError } = await gate.supabase
    .from('role_capabilities')
    .delete()
    .eq('role_id', id);
  if (clearError) return NextResponse.json({ error: clearError.message }, { status: 400 });

  if (capabilities.length) {
    const { error: capError } = await gate.supabase
      .from('role_capabilities')
      .insert(capabilities.map((capability) => ({ role_id: id, capability })));
    if (capError) return NextResponse.json({ error: capError.message }, { status: 400 });
  }

  // Everyone's established session is dropped, so the change is felt now.
  forgetIdentities();

  return NextResponse.json({ role: { id, name, capabilities } });
}

/** DELETE /api/admin/roles?id= — remove a role nobody holds. */
export async function DELETE(request: Request) {
  const gate = await requireCapability('manage_roles');
  if ('refusal' in gate) return gate.refusal;

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Which role?' }, { status: 422 });

  const { count } = await gate.supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('role_id', id);

  if ((count ?? 0) > 0)
    return NextResponse.json(
      {
        error: `${count} account${count === 1 ? ' holds' : 's hold'} this role. Move them to another role first.`,
      },
      { status: 409 }
    );

  const { error } = await gate.supabase.from('roles').delete().eq('id', id);
  if (error) {
    if (missingTables(error.message)) return notProvisioned();
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  forgetIdentities();
  return NextResponse.json({ ok: true });
}
