import { NextResponse } from 'next/server';
import { monthLabel } from '@/lib/assistant';
import type { Action } from '@/lib/assistant-actions';
import { requireCapability } from '@/lib/admin-guard';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const pkr = (n: number) => `PKR ${Math.round(n).toLocaleString('en-GB')}`;
const isMonth = (s: unknown) => typeof s === 'string' && /^\d{4}-\d{2}-01$/.test(s);

/**
 * POST /api/admin/assistant/act — carry out a change the administrator confirmed.
 *
 * The proposal that reached the browser is a suggestion, not an authorisation:
 * it travelled through a client that could have altered it, so every field is
 * checked again here against the database before anything is written. A
 * proposal naming a member who has since been deleted, or an amount that has
 * become nonsense, fails at this door rather than on the way in.
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

  const gate = await requireCapability('use_assistant_writes');
  if ('refusal' in gate) return gate.refusal;

  let action: Action;
  try {
    action = ((await request.json()) as { action?: Action }).action as Action;
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }
  if (!action?.kind) return NextResponse.json({ error: 'Nothing to do.' }, { status: 422 });

  switch (action.kind) {
    /* ---------------------------------------------------------------- */
    case 'record_donation':
    case 'clear_donation': {
      if (!action.memberId) return NextResponse.json({ error: 'Which member?' }, { status: 422 });
      if (!isMonth(action.month))
        return NextResponse.json({ error: 'Which month?' }, { status: 422 });

      // Donors are members. A donor row is created on first gift rather than
      // as a separate step, so recording one is a single confirmation.
      const { data: person } = await supabase
        .from('profiles')
        .select('id, full_name')
        .eq('id', action.memberId)
        .single();
      if (!person) return NextResponse.json({ error: 'That member no longer exists.' }, { status: 404 });

      const { data: existing } = await supabase
        .from('donors')
        .select('id')
        .eq('user_id', action.memberId)
        .maybeSingle();

      let donorId = (existing as { id: string } | null)?.id ?? null;

      if (!donorId) {
        if (action.kind === 'clear_donation')
          return NextResponse.json(
            { error: `${person.full_name} has no donations recorded.` },
            { status: 404 }
          );
        const { data: made, error } = await supabase
          .from('donors')
          .insert({ user_id: action.memberId, name: person.full_name })
          .select('id')
          .single();
        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
        donorId = (made as { id: string }).id;
      }

      if (action.kind === 'clear_donation') {
        const { error } = await supabase
          .from('donations')
          .delete()
          .eq('donor_id', donorId)
          .eq('month', action.month);
        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
        return NextResponse.json({
          done: `Removed ${person.full_name}'s donation for ${monthLabel(action.month!)}.`,
          link: { href: '/admin/budget', label: 'Open the budget' },
        });
      }

      const amount = Number(action.amount);
      if (!Number.isFinite(amount) || amount <= 0)
        return NextResponse.json({ error: 'That is not a valid amount.' }, { status: 422 });

      const { error } = await supabase.from('donations').upsert(
        {
          donor_id: donorId,
          month: action.month,
          amount,
          received_on: new Date().toISOString().slice(0, 10),
          recorded_by: user.id,
        },
        { onConflict: 'donor_id,month' }
      );
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });

      const { data: fund } = await supabase.rpc('budget_status', { p_month: action.month });
      const left = Number((fund as { remaining?: number } | null)?.remaining ?? 0);

      return NextResponse.json({
        done: `Recorded ${pkr(amount)} from ${person.full_name} for ${monthLabel(action.month!)}. ${pkr(left)} is now available.`,
        link: { href: '/admin/budget', label: 'Open the budget' },
      });
    }

    /* ---------------------------------------------------------------- */
    case 'set_donor_active': {
      if (!action.memberId) return NextResponse.json({ error: 'Which member?' }, { status: 422 });

      const { data: person } = await supabase
        .from('profiles')
        .select('id, full_name')
        .eq('id', action.memberId)
        .single();
      if (!person)
        return NextResponse.json({ error: 'That member no longer exists.' }, { status: 404 });

      const { data: row } = await supabase
        .from('donors')
        .select('id')
        .eq('user_id', action.memberId)
        .maybeSingle();
      if (!row)
        return NextResponse.json(
          { error: `${person.full_name} is not on the donor list.` },
          { status: 404 }
        );

      const active = Boolean(action.active);
      const { error } = await supabase
        .from('donors')
        .update({ is_active: active })
        .eq('id', (row as { id: string }).id);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });

      return NextResponse.json({
        done: active
          ? `${person.full_name} is back on the donor list.`
          : `${person.full_name} is off the donor list. Their past donations are untouched, so no month's fund has changed.`,
        link: { href: '/admin/budget', label: 'Open the donors' },
      });
    }

    /* ---------------------------------------------------------------- */
    case 'set_pledge': {
      if (!action.memberId) return NextResponse.json({ error: 'Which member?' }, { status: 422 });
      const amount = Number(action.amount);
      if (!Number.isFinite(amount) || amount < 0)
        return NextResponse.json({ error: 'That is not a valid pledge.' }, { status: 422 });

      const { data: person } = await supabase
        .from('profiles')
        .select('id, full_name')
        .eq('id', action.memberId)
        .single();
      if (!person) return NextResponse.json({ error: 'That member no longer exists.' }, { status: 404 });

      const { data: existing } = await supabase
        .from('donors')
        .select('id')
        .eq('user_id', action.memberId)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from('donors')
          .update({ monthly_pledge: amount })
          .eq('id', (existing as { id: string }).id);
        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      } else {
        const { error } = await supabase
          .from('donors')
          .insert({ user_id: action.memberId, name: person.full_name, monthly_pledge: amount });
        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      }

      return NextResponse.json({
        done: `${person.full_name} is down for ${pkr(amount)} a month. A pledge is not money — it only counts once a donation is recorded.`,
        link: { href: '/admin/budget', label: 'Open the donors' },
      });
    }

    /* ---------------------------------------------------------------- */
    case 'set_status': {
      if (!action.requestId) return NextResponse.json({ error: 'Which application?' }, { status: 422 });
      if (!['review', 'accepted', 'rejected'].includes(action.status ?? ''))
        return NextResponse.json({ error: 'That status cannot be set from here.' }, { status: 422 });

      const { data: current } = await supabase
        .from('fund_requests')
        .select('id, reference, status, amount_requested, profiles!fund_requests_user_id_fkey(full_name)')
        .eq('id', action.requestId)
        .single();

      const r = current as unknown as {
        reference: string;
        status: string;
        amount_requested: number;
        profiles: { full_name: string } | null;
      } | null;
      if (!r) return NextResponse.json({ error: 'That application no longer exists.' }, { status: 404 });

      // Money has already moved; reopening it here would contradict a receipt.
      if (r.status === 'transferred')
        return NextResponse.json(
          { error: `${r.reference} has already been transferred and cannot be changed from here.` },
          { status: 409 }
        );

      if (action.status === 'rejected' && !action.note?.trim())
        return NextResponse.json(
          { error: 'A rejection needs a reason — the member is shown it. Add "because …" and try again.' },
          { status: 422 }
        );

      const patch: Record<string, unknown> = { status: action.status, reviewed_by: user.id };
      if (action.note?.trim()) patch.admin_note = action.note.trim();
      if (action.status === 'accepted' && Number.isFinite(Number(action.amount)))
        patch.amount_approved = Number(action.amount);

      const { error } = await supabase.from('fund_requests').update(patch).eq('id', action.requestId);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });

      const approved =
        action.status === 'accepted'
          ? ` at ${pkr(Number(action.amount ?? r.amount_requested))}`
          : '';

      return NextResponse.json({
        done: `${r.reference} for ${r.profiles?.full_name ?? 'the member'} is now ${action.status}${approved}.`,
        link: { href: `/admin/requests/${action.requestId}`, label: 'Open the application' },
      });
    }

    /* ---------------------------------------------------------------- */
    case 'block_member':
    case 'unblock_member': {
      if (!action.memberId) return NextResponse.json({ error: 'Which member?' }, { status: 422 });

      const { data: person } = await supabase
        .from('profiles')
        .select('id, full_name, role')
        .eq('id', action.memberId)
        .single();
      if (!person) return NextResponse.json({ error: 'That member no longer exists.' }, { status: 404 });

      // Locking the administrators out of their own portal is not a thing to
      // do by typing a sentence.
      if (person.role === 'admin')
        return NextResponse.json(
          { error: 'Administrator accounts cannot be blocked from here.' },
          { status: 409 }
        );
      if (person.id === user.id)
        return NextResponse.json({ error: 'You cannot block yourself.' }, { status: 409 });

      const blocked = action.kind === 'block_member';
      const { error } = await supabase
        .from('profiles')
        .update({ is_blocked: blocked })
        .eq('id', action.memberId);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });

      return NextResponse.json({
        done: blocked
          ? `${person.full_name} is blocked and can no longer sign in or apply.`
          : `${person.full_name} can sign in and apply again.`,
        link: { href: `/admin/members/${action.memberId}`, label: `Open ${person.full_name}` },
      });
    }

    default:
      return NextResponse.json({ error: 'Unknown action.' }, { status: 422 });
  }
}
