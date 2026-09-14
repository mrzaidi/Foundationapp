import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Incoming {
  path: string;
  file_name: string;
  mime_type?: string;
  size_bytes?: number;
}

/**
 * POST /api/requests/:id/attachments
 * Records files the client already uploaded to the `documents` bucket.
 * Body: { files: Incoming[], kind?: 'report' | 'bill' | 'receipt' | 'other' }
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

  let body: { files?: Incoming[]; kind?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const files = Array.isArray(body.files) ? body.files : [];
  if (!files.length) return NextResponse.json({ error: 'No files supplied.' }, { status: 422 });

  // The request must exist and be visible to the caller (RLS).
  const { data: req } = await supabase
    .from('fund_requests')
    .select('id, user_id')
    .eq('id', id)
    .single();

  if (!req) return NextResponse.json({ error: 'Request not found.' }, { status: 404 });

  // A member may only attach files stored under their own storage folder.
  const invalid = files.find((f) => !f.path?.startsWith(`${user.id}/`));
  if (invalid)
    return NextResponse.json({ error: 'Attachment path does not belong to you.' }, { status: 403 });

  const rows = files.map((f) => ({
    request_id: id,
    user_id: user.id,
    path: f.path,
    file_name: f.file_name,
    mime_type: f.mime_type ?? null,
    size_bytes: f.size_bytes ?? null,
    kind: body.kind ?? 'report',
  }));

  const { data, error } = await supabase.from('request_attachments').insert(rows).select();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ attachments: data }, { status: 201 });
}
