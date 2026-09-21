import { currentSession } from '@/lib/session';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/documents?path=<storage path>
 * Returns a short-lived signed URL for a private document.
 * Storage RLS decides who may sign: the owner, or any admin.
 */
export async function GET(request: Request) {
  const { supabase, user } = await currentSession();
  if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

  const path = new URL(request.url).searchParams.get('path');
  if (!path) return NextResponse.json({ error: 'Missing path.' }, { status: 422 });

  const { data, error } = await supabase.storage
    .from('documents')
    .createSignedUrl(path, 60 * 10); // 10 minutes

  if (error || !data)
    return NextResponse.json(
      { error: error?.message ?? 'Could not sign that document.' },
      { status: 403 }
    );

  return NextResponse.json({ url: data.signedUrl });
}
