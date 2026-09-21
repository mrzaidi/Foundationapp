import { currentSession } from '@/lib/session';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Incoming {
  path: string;
  file_name: string;
  mime_type?: string;
  size_bytes?: number;
}

const KINDS = ['report', 'bill', 'cnic', 'receipt', 'other'];

/**
 * POST /api/requests/:id/attachments
 * Records files the client already uploaded to the `documents` bucket.
 * Body: { files: Incoming[], kind?: 'report' | 'bill' | 'cnic' | 'receipt' | 'other' }
 *
 * Two writers, one rule: everything filed against a request lives in the
 * member's storage folder and carries the member's user_id. A member attaching
 * their own bill and an admin attaching the transfer receipt both end up in the
 * same case file, which is what makes the receipt visible to the member without
 * a single new read policy.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await currentSession();
  if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

  let body: { files?: Incoming[]; kind?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const files = Array.isArray(body.files) ? body.files : [];
  if (!files.length) return NextResponse.json({ error: 'No files supplied.' }, { status: 422 });

  const kind = body.kind ?? 'report';
  if (!KINDS.includes(kind))
    return NextResponse.json({ error: 'Unknown attachment kind.' }, { status: 422 });

  // The request must exist and be visible to the caller (RLS).
  const { data: req } = await supabase
    .from('fund_requests')
    .select('id, user_id')
    .eq('id', id)
    .single();

  if (!req) return NextResponse.json({ error: 'Request not found.' }, { status: 404 });

  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  const isAdmin = me?.role === 'admin';

  // A receipt is the foundation's record of paying out, so only staff may file
  // one — otherwise a member could manufacture their own proof of transfer.
  if (kind === 'receipt' && !isAdmin)
    return NextResponse.json({ error: 'Administrators only.' }, { status: 403 });

  // Everything is filed under the member's folder. A member may only reach
  // their own; an admin may reach the folder of the member whose request this
  // is, and no further.
  const owner = isAdmin ? req.user_id : user.id;
  const invalid = files.find((f) => !f.path?.startsWith(`${owner}/`));
  if (invalid)
    return NextResponse.json(
      {
        error: isAdmin
          ? 'Attachment path does not belong to this application.'
          : 'Attachment path does not belong to you.',
      },
      { status: 403 }
    );

  const rows = files.map((f) => ({
    request_id: id,
    user_id: owner,
    path: f.path,
    file_name: f.file_name,
    mime_type: f.mime_type ?? null,
    size_bytes: f.size_bytes ?? null,
    kind,
  }));

  const { data, error } = await supabase.from('request_attachments').insert(rows).select();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ attachments: data }, { status: 201 });
}
