'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from './Icon';
import Modal from './Modal';
import { useToast } from './Toast';
import type { FundType } from '@/lib/types';

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

type Draft = {
  name: string;
  name_ur: string;
  description: string;
  description_ur: string;
  document_label: string;
  document_label_ur: string;
  document_required: boolean;
  min_amount: string;
  max_amount: string;
  gradient: string;
  icon: string;
  sort_order: string;
  is_active: boolean;
  is_recurring: boolean;
};

function draftOf(f: FundType): Draft {
  return {
    name: f.name,
    name_ur: f.name_ur ?? '',
    description: f.description ?? '',
    description_ur: f.description_ur ?? '',
    document_label: f.document_label,
    document_label_ur: f.document_label_ur ?? '',
    document_required: f.document_required,
    min_amount: String(Number(f.min_amount)),
    // Empty means no ceiling, which is a real setting rather than a blank.
    max_amount: f.max_amount == null ? '' : String(Number(f.max_amount)),
    gradient: f.gradient,
    icon: f.icon,
    sort_order: String(f.sort_order),
    is_active: f.is_active,
    is_recurring: Boolean(f.is_recurring),
  };
}

/**
 * Editing a fund from the portal.
 *
 * Funds were always rows rather than code, but "rows" meant a trip to the
 * Supabase table editor — so in practice nobody changed a limit. Everything the
 * member sees is here, including the Urdu copy, because a fund renamed in one
 * language and not the other reads as a bug to half the members.
 */
export default function FundEditor({
  fund,
  recurringReady,
}: {
  fund: FundType;
  /** False until migration 0009 has run — the column would reject the write. */
  recurringReady: boolean;
}) {
  const router = useRouter();
  const toast = useToast();

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [d, setD] = useState<Draft>(() => draftOf(fund));

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => {
    setD((prev) => ({ ...prev, [k]: v }));
    setError('');
  };

  function start() {
    setD(draftOf(fund));
    setError('');
    setOpen(true);
  }

  async function save() {
    const min = Number(d.min_amount);
    const max = d.max_amount.trim() === '' ? null : Number(d.max_amount);

    if (!d.name.trim()) return setError('The fund needs a name.');
    if (!d.document_label.trim()) return setError('The document label cannot be empty.');
    if (!Number.isFinite(min) || min < 1) return setError('Minimum must be at least 1.');
    if (max !== null && (!Number.isFinite(max) || max < 1))
      return setError('Maximum must be a positive amount, or blank for no ceiling.');
    if (max !== null && max < min) return setError('The maximum cannot be below the minimum.');

    setBusy(true);
    try {
      const res = await fetch('/api/admin/funds', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: fund.id,
          name: d.name.trim(),
          name_ur: d.name_ur.trim(),
          description: d.description.trim(),
          description_ur: d.description_ur.trim(),
          document_label: d.document_label.trim(),
          document_label_ur: d.document_label_ur.trim(),
          document_required: d.document_required,
          min_amount: min,
          max_amount: max,
          gradient: d.gradient,
          icon: d.icon,
          sort_order: Number(d.sort_order),
          is_active: d.is_active,
          ...(recurringReady ? { is_recurring: d.is_recurring } : {}),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Could not save the fund.');

      toast(`${d.name.trim()} updated`);
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button className="admin-btn ghost fund-edit" onClick={start} type="button">
        <Icon name="settings" />
        Edit
      </button>

      {open && (
        <Modal
          className="wide"
          busy={busy}
          onClose={() => setOpen(false)}
          label={`Edit ${fund.name}`}
        >
          <h3>Edit {fund.name}</h3>
          <p className="sub">
            Changes show on every member&apos;s dashboard immediately. The fund&apos;s id (
            <code>{fund.id}</code>) cannot change — applications are filed against it.
          </p>

          <div className="row-2">
            <div className="field">
              <label htmlFor={`n_${fund.id}`}>Name (English)</label>
              <input
                id={`n_${fund.id}`}
                className="input"
                value={d.name}
                onChange={(e) => set('name', e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor={`nu_${fund.id}`}>Name (اردو)</label>
              <input
                id={`nu_${fund.id}`}
                className="input"
                lang="ur"
                dir="rtl"
                value={d.name_ur}
                onChange={(e) => set('name_ur', e.target.value)}
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor={`d_${fund.id}`}>Description (English)</label>
            <textarea
              id={`d_${fund.id}`}
              className="input"
              rows={2}
              value={d.description}
              onChange={(e) => set('description', e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor={`du_${fund.id}`}>Description (اردو)</label>
            <textarea
              id={`du_${fund.id}`}
              className="input"
              rows={2}
              lang="ur"
              dir="rtl"
              value={d.description_ur}
              onChange={(e) => set('description_ur', e.target.value)}
            />
          </div>

          <div className="row-2">
            <div className="field">
              <label htmlFor={`min_${fund.id}`}>Minimum (PKR)</label>
              <input
                id={`min_${fund.id}`}
                className="input"
                type="number"
                min={1}
                value={d.min_amount}
                onChange={(e) => set('min_amount', e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor={`max_${fund.id}`}>Maximum (PKR)</label>
              <input
                id={`max_${fund.id}`}
                className="input"
                type="number"
                min={1}
                placeholder="No ceiling"
                value={d.max_amount}
                onChange={(e) => set('max_amount', e.target.value)}
              />
              <p className="field-hint">Leave blank for no upper limit.</p>
            </div>
          </div>

          <div className="row-2">
            <div className="field">
              <label htmlFor={`dl_${fund.id}`}>Document label (English)</label>
              <input
                id={`dl_${fund.id}`}
                className="input"
                value={d.document_label}
                onChange={(e) => set('document_label', e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor={`dlu_${fund.id}`}>Document label (اردو)</label>
              <input
                id={`dlu_${fund.id}`}
                className="input"
                lang="ur"
                dir="rtl"
                value={d.document_label_ur}
                onChange={(e) => set('document_label_ur', e.target.value)}
              />
            </div>
          </div>

          <div className="row-2">
            <div className="field">
              <label htmlFor={`g_${fund.id}`}>Colour</label>
              <div className="swatches">
                {GRADIENTS.map((g) => (
                  <button
                    key={g}
                    type="button"
                    className={`swatch ${g} ${d.gradient === g ? 'on' : ''}`}
                    aria-label={g}
                    aria-pressed={d.gradient === g}
                    onClick={() => set('gradient', g)}
                  />
                ))}
              </div>
            </div>
            <div className="field">
              <label htmlFor={`i_${fund.id}`}>Icon</label>
              <div className="swatches">
                {ICONS.map((i) => (
                  <button
                    key={i}
                    type="button"
                    className={`swatch icon ${d.icon === i ? 'on' : ''}`}
                    aria-label={i}
                    aria-pressed={d.icon === i}
                    onClick={() => set('icon', i)}
                  >
                    <Icon name={i} width={16} height={16} />
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="row-2">
            <div className="field">
              <label htmlFor={`s_${fund.id}`}>Order on the dashboard</label>
              <input
                id={`s_${fund.id}`}
                className="input"
                type="number"
                min={0}
                value={d.sort_order}
                onChange={(e) => set('sort_order', e.target.value)}
              />
            </div>
            <div className="field">
              <label>Settings</label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={d.document_required}
                  onChange={(e) => set('document_required', e.target.checked)}
                />
                <span>A document is required</span>
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={d.is_active}
                  onChange={(e) => set('is_active', e.target.checked)}
                />
                <span>Visible to members</span>
              </label>
              {recurringReady && (
                <label className="check">
                  <input
                    type="checkbox"
                    checked={d.is_recurring}
                    onChange={(e) => set('is_recurring', e.target.checked)}
                  />
                  <span>Recurs monthly once approved</span>
                </label>
              )}
            </div>
          </div>

          {error && (
            <p className="err-msg" role="alert">
              {error}
            </p>
          )}

          <div className="btn-row mt-8">
            <button
              className="admin-btn ghost"
              style={{ flex: 1, justifyContent: 'center' }}
              onClick={() => setOpen(false)}
              disabled={busy}
              type="button"
            >
              Cancel
            </button>
            <button
              className="admin-btn"
              style={{ flex: 1, justifyContent: 'center' }}
              onClick={save}
              disabled={busy}
              type="button"
            >
              {busy ? <span className="spin" /> : <Icon name="check" />}
              {busy ? 'Saving…' : 'Save fund'}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
