'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from './Icon';
import Modal from './Modal';
import { useToast } from './Toast';

/**
 * Remove a household written down in error.
 *
 * A household is nobody's account now, so nothing cascades and nothing else
 * breaks when one goes — which is exactly why it needs confirming: a duplicate
 * typed in twice should be easy to undo, and a real family's circumstances
 * should not be one stray click from gone.
 */
export default function DeleteFamilyButton({
  familyId,
  headName,
}: {
  familyId: string;
  headName: string;
}) {
  const toast = useToast();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function remove() {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/family?id=${familyId}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Could not remove the household.');
      toast(`${headName}’s household removed`);
      router.push('/admin/families');
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <>
      <button className="admin-btn ghost" type="button" onClick={() => setOpen(true)}>
        <Icon name="x" />
        Remove
      </button>

      {open && (
        <Modal
          onClose={() => !busy && setOpen(false)}
          busy={busy}
          label="Remove this household"
        >
          <h3>Remove this household?</h3>
          <p className="sub">
            Everything recorded about <strong>{headName}</strong>&rsquo;s household — who lives
            there, what comes in, what goes out — is deleted. There is no undo.
          </p>

          {error && <p className="err-msg">{error}</p>}

          <div className="amodal-foot">
            <button
              className="admin-btn ghost"
              type="button"
              onClick={() => setOpen(false)}
              disabled={busy}
            >
              Keep it
            </button>
            <button className="admin-btn red" type="button" onClick={remove} disabled={busy}>
              {busy ? <span className="spin" /> : <Icon name="x" />}
              Remove the household
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
