'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from './Icon';
import Lightbox, { type LightboxItem } from './Lightbox';
import { useI18n } from './LocaleProvider';
import { useToast } from './Toast';
import { createClient } from '@/lib/supabase/client';
import { bytes, money } from '@/lib/format';
import { fundText } from '@/lib/funds';
import type { FundType } from '@/lib/types';

type Phase = 'confirm' | 'form' | 'done';

const MAX_FILES = 8;

interface Props {
  fund: FundType | null;
  userId: string;
  onClose: () => void;
  /** Coming from the fund picker the member has already chosen — skip the confirm step. */
  startAt?: Phase;
}

export default function ApplySheet({ fund, userId, onClose, startAt = 'confirm' }: Props) {
  const router = useRouter();
  const toast = useToast();
  const { d, locale } = useI18n();
  const fileRef = useRef<HTMLInputElement>(null);

  const [phase, setPhase] = useState<Phase>(startAt);
  const [amount, setAmount] = useState('');
  const [purpose, setPurpose] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reference, setReference] = useState('');
  const [preview, setPreview] = useState<number | null>(null);

  useEffect(() => {
    if (fund) {
      setPhase(startAt);
      setAmount('');
      setPurpose('');
      setFiles([]);
      setError('');
      setReference('');
      setPreview(null);
    }
  }, [fund, startAt]);

  /* Object URLs are revoked when the selection changes, so a long session
     picking and unpicking files cannot leak them. */
  const shots = useMemo(
    () =>
      files.map((f) => ({
        name: f.name,
        isImage: f.type.startsWith('image/'),
        url: f.type.startsWith('image/') ? URL.createObjectURL(f) : '',
      })),
    [files]
  );

  useEffect(() => {
    return () => shots.forEach((s) => s.url && URL.revokeObjectURL(s.url));
  }, [shots]);

  if (!fund) return null;

  const text = fundText(fund, locale);
  const min = Number(fund.min_amount ?? 0);
  const max = fund.max_amount ? Number(fund.max_amount) : null;
  const quick = (
    max
      ? [min, Math.round((min + max) / 4 / 500) * 500, Math.round((min + max) / 2 / 500) * 500, max]
      : [min, min * 2, min * 5, min * 10]
  )
    .filter((v, i, a) => v > 0 && a.indexOf(v) === i)
    .slice(0, 4);

  function addFiles(list: FileList | null) {
    if (!list?.length) return;

    const room = MAX_FILES - files.length;
    const incoming = Array.from(list).filter((file) => {
      if (file.size > 10 * 1024 * 1024) {
        toast(d.apply.errors.tooBig(file.name), 'bad');
        return false;
      }
      return true;
    });

    if (incoming.length > room) toast(d.apply.errors.tooMany(MAX_FILES), 'bad');
    setFiles((prev) => [...prev, ...incoming.slice(0, room)]);
    setError('');
  }

  async function submit() {
    const value = Number(amount);

    if (!amount || !Number.isFinite(value) || value <= 0) return setError(d.apply.errors.amountRequired);
    if (value < min) return setError(d.apply.errors.min(money(min)));
    if (max && value > max) return setError(d.apply.errors.max(money(max)));
    if (fund!.document_required && files.length === 0)
      return setError(d.apply.errors.docRequired(text.documentLabel));

    setBusy(true);
    setError('');

    try {
      const res = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fund_type_id: fund!.id,
          amount_requested: value,
          purpose: purpose.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? d.common.somethingWrong);

      const requestId: string = json.request.id;

      if (files.length) {
        const supabase = createClient();
        const uploaded: { path: string; file_name: string; mime_type: string; size_bytes: number }[] =
          [];

        for (const file of files) {
          const safe = file.name.replace(/[^\w.\-]+/g, '_');
          const path = `${userId}/requests/${requestId}/${Date.now()}-${safe}`;
          const { error: upErr } = await supabase.storage
            .from('documents')
            .upload(path, file, { contentType: file.type, upsert: false });

          if (upErr) {
            toast(d.apply.errors.uploadFailed(file.name), 'bad');
            continue;
          }
          uploaded.push({
            path,
            file_name: file.name,
            mime_type: file.type,
            size_bytes: file.size,
          });
        }

        if (uploaded.length) {
          await fetch(`/api/requests/${requestId}/attachments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              files: uploaded,
              kind: fund!.id === 'electricity' ? 'bill' : 'report',
            }),
          });
        }
      }

      setReference(json.request.reference);
      setPhase('done');
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const lightboxItems: LightboxItem[] = shots.map((s) => ({
    url: s.url,
    name: s.name,
    isImage: s.isImage,
  }));

  return (
    <>
      <div className={`backdrop ${fund ? 'open' : ''}`} onClick={busy ? undefined : onClose} />

      {/* ---------- 1. confirmation ---------- */}
      <div className={`dialog ${phase === 'confirm' ? 'open' : ''}`} role="dialog" aria-modal="true">
        <div className={`big-ico ${fund.gradient}`}>
          <Icon name={fund.icon} />
        </div>
        <h3>{d.apply.confirmTitle(text.name)}</h3>
        <p>{d.apply.confirmBody(text.description, text.documentLabel.toLowerCase())}</p>
        <div className="btn-row">
          <button className="btn ghost" onClick={onClose} type="button">
            <span>{d.common.cancel}</span>
          </button>
          <button className="btn" onClick={() => setPhase('form')} type="button">
            <Icon name="arrowRight" className="flip" />
            <span>{d.common.continue}</span>
          </button>
        </div>
      </div>

      {/* ---------- 2. the application ---------- */}
      <div className={`sheet ${phase === 'form' ? 'open' : ''}`} role="dialog" aria-modal="true">
        <div className="grab" />
        <div className="sheet-body">
          <div className="sheet-head">
            <div className={`ico ${fund.gradient}`}>
              <Icon name={fund.icon} />
            </div>
            <div style={{ flex: 1 }}>
              <h3>{text.name}</h3>
              <p>
                {max ? d.apply.range(money(min), money(max)) : d.apply.from(money(min))} ·{' '}
                {d.apply.reviewedBy}
              </p>
            </div>
            <button
              className="icon-btn dark"
              onClick={busy ? undefined : onClose}
              aria-label={d.common.close}
              type="button"
            >
              <Icon name="x" />
            </button>
          </div>

          <div className="field">
            <label htmlFor="amount">
              {d.apply.amount} <span className="req-star">*</span>
            </label>
            <div className="amount-wrap">
              <span className="cur">{d.common.currency}</span>
              <input
                id="amount"
                className="input"
                type="number"
                inputMode="numeric"
                placeholder="0"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                  setError('');
                }}
              />
            </div>
            <div className="quick-amounts">
              {quick.map((q) => (
                <button key={q} type="button" onClick={() => setAmount(String(q))}>
                  {money(q, false)}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <label>
              {text.documentLabel}{' '}
              {fund.document_required ? (
                <span className="req-star">*</span>
              ) : (
                <span style={{ color: 'var(--text-faint)', fontWeight: 500 }}>
                  {d.common.optional}
                </span>
              )}
              {files.length > 0 && (
                <span className="file-count num">
                  {files.length}/{MAX_FILES}
                </span>
              )}
            </label>

            <label className="upload small" htmlFor="docs">
              <div className="u-ico">
                <Icon name="upload" />
              </div>
              <div className="u-t">{d.apply.uploadTitle}</div>
              <div className="u-d">{d.apply.uploadHintMulti(MAX_FILES)}</div>
              <input
                id="docs"
                ref={fileRef}
                type="file"
                multiple
                accept="image/*,application/pdf"
                onChange={(e) => {
                  addFiles(e.target.files);
                  if (fileRef.current) fileRef.current.value = '';
                }}
              />
            </label>

            {files.length > 0 && (
              <div className="thumb-grid">
                {shots.map((s, i) => (
                  <div className="thumb-cell" key={`${s.name}-${i}`}>
                    <button
                      type="button"
                      className="thumb-open"
                      onClick={() => setPreview(i)}
                      title={s.name}
                    >
                      {s.isImage ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={s.url} alt="" />
                      ) : (
                        <span className="thumb-file">
                          <Icon name="file" />
                        </span>
                      )}
                      <span className="thumb-zoom">
                        <Icon name="eye" />
                      </span>
                    </button>
                    <button
                      type="button"
                      className="thumb-rm"
                      aria-label={d.register.removeFile}
                      onClick={() => setFiles((p) => p.filter((_, x) => x !== i))}
                    >
                      <Icon name="x" />
                    </button>
                    <span className="thumb-meta">{bytes(files[i].size)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="field">
            <label htmlFor="purpose">{d.apply.reason}</label>
            <textarea
              id="purpose"
              className="input"
              placeholder={d.apply.reasonPlaceholder}
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              maxLength={600}
            />
          </div>

          {error && (
            <p className="err-msg" role="alert" style={{ marginBottom: 10 }}>
              {error}
            </p>
          )}

          <button className="btn" onClick={submit} disabled={busy} type="button">
            {busy ? <span className="spin" /> : <Icon name="send" />}
            <span>{busy ? d.apply.submitting : d.apply.submit}</span>
          </button>

          <p className="muted center mt-12" style={{ fontSize: 11.5 }}>
            {d.apply.disclaimer}
          </p>
        </div>
      </div>

      {/* ---------- 3. done ---------- */}
      <div className={`dialog ${phase === 'done' ? 'open' : ''}`} role="dialog" aria-modal="true">
        <div className="big-ico">
          <Icon name="checkCircle" strokeWidth={2} />
        </div>
        <h3>{d.apply.successTitle}</h3>
        <p>
          {d.apply.successBody(text.name)}
          <br />
          {d.apply.reference}{' '}
          <strong className="ref" style={{ color: 'var(--text)' }}>
            {reference}
          </strong>
          <br />
          {d.apply.trackHint}
        </p>
        <div className="btn-row">
          <button className="btn ghost" onClick={onClose} type="button">
            <span>{d.common.done}</span>
          </button>
          <button
            className="btn"
            type="button"
            onClick={() => {
              onClose();
              router.push('/requests');
            }}
          >
            <Icon name="list" />
            <span>{d.apply.track}</span>
          </button>
        </div>
      </div>

      <Lightbox
        items={lightboxItems}
        index={preview}
        onIndex={setPreview}
        onClose={() => setPreview(null)}
      />
    </>
  );
}
