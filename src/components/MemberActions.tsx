'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from './Icon';
import { useToast } from './Toast';
import type { Profile } from '@/lib/types';

/** Promote / demote and block / unblock, from the member record. */
export default function MemberActions({ member }: { member: Profile }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function patch(body: Record<string, unknown>, done: string) {
    setBusy(true);
    try {
      const res = await fetch('/api/admin/members', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: member.id, ...body }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Update failed.');
      toast(done);
      router.refresh();
    } catch (e) {
      toast((e as Error).message, 'bad');
    } finally {
      setBusy(false);
    }
  }

  const isAdmin = member.role === 'admin';

  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
      <button
        className="admin-btn ghost"
        disabled={busy}
        onClick={() =>
          patch(
            { role: isAdmin ? 'member' : 'admin' },
            isAdmin ? 'Administrator access removed' : 'Promoted to administrator'
          )
        }
        type="button"
      >
        <Icon name="shield" />
        {isAdmin ? 'Remove admin access' : 'Make administrator'}
      </button>
      <button
        className={member.is_blocked ? 'admin-btn' : 'admin-btn red'}
        disabled={busy}
        onClick={() =>
          patch(
            { is_blocked: !member.is_blocked },
            member.is_blocked ? 'Member unblocked' : 'Member blocked'
          )
        }
        type="button"
      >
        <Icon name={member.is_blocked ? 'checkCircle' : 'xCircle'} />
        {member.is_blocked ? 'Unblock member' : 'Block member'}
      </button>
    </div>
  );
}
