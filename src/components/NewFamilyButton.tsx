'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from './Icon';
import Modal from './Modal';
import { useToast } from './Toast';

/**
 * Start a household.
 *
 * Nothing else has to exist first — no member account, no application. The
 * office meets families who have never registered and may never register, and
 * the household still has to be written down. So this asks for the one thing a
 * household cannot be without, the name of the head of the family, opens the
 * record, and lets the rest be filled in whenever it is known.
 */
export default function NewFamilyButton() {
  const toast = useToast();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [head, setHead] = useState('');
  const [city, setCity] = useState('');
  const [contact, setContact] = useState('');
  const [error, setError] = useState('');

  function close() {
    if (busy) return;
    setOpen(false);
    setHead('');
    setCity('');
    setContact('');
    setError('');
  }

  async function create() {
    if (head.trim().length < 2) {
      setError('Enter the name of the head of the family.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/admin/family', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          head_name: head.trim(),
          city: city.trim() || null,
          contact: contact.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Could not add the household.');

      toast(`${head.trim()}’s household added`);
      // Straight into the record, because the next thing anybody wants is to
      // fill in the rest of it.
      router.push(`/admin/families/${json.family.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <>
      <button className="admin-btn" type="button" onClick={() => setOpen(true)}>
        <Icon name="plus" />
        Add a family
      </button>

      {open && (
        <Modal onClose={close} busy={busy} label="Add a family">
          <h3>Add a family</h3>
          <p className="sub">
            A household stands on its own — it does not need a registered member behind it. The
            name of the head of the family is enough to start; everything else can follow.
          </p>

          <div className="field">
            <label htmlFor="nf_head">
              Head of the family <span className="req-star">*</span>
            </label>
            <input
              id="nf_head"
              className="input"
              autoFocus
              value={head}
              onChange={(e) => setHead(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void create();
                }
              }}
              placeholder="The name the household is known by"
            />
          </div>

          <div className="field">
            <label htmlFor="nf_city">City</label>
            <input
              id="nf_city"
              className="input"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Karachi, Lahore…"
            />
          </div>

          <div className="field">
            <label htmlFor="nf_contact">Contact number</label>
            <input
              id="nf_contact"
              className="input"
              dir="ltr"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder="A number for the household"
            />
            <p className="field-hint">
              Whoever the foundation reaches when it needs to ask something. There may be no
              member account behind this household to carry one.
            </p>
          </div>

          {error && <p className="err-msg">{error}</p>}

          <div className="amodal-foot">
            <button className="admin-btn ghost" type="button" onClick={close} disabled={busy}>
              Cancel
            </button>
            <button className="admin-btn" type="button" onClick={create} disabled={busy}>
              {busy ? <span className="spin" /> : <Icon name="check" />}
              Add and open
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
