'use client';

import { useState } from 'react';
import Icon from './Icon';
import { useI18n } from './LocaleProvider';
import { useToast } from './Toast';
import { bytes, dateLabel } from '@/lib/format';
import type { Attachment } from '@/lib/types';

/**
 * Private documents are never linked directly — we mint a short-lived signed
 * URL on click, so the file is only reachable by someone storage RLS allows.
 */
export default function DocumentLink({ attachment }: { attachment: Attachment }) {
  const toast = useToast();
  const { d } = useI18n();
  const [busy, setBusy] = useState(false);

  async function open() {
    setBusy(true);
    try {
      const res = await fetch(`/api/documents?path=${encodeURIComponent(attachment.path)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? d.docs.failed);
      window.open(json.url, '_blank', 'noopener,noreferrer');
    } catch (e) {
      toast((e as Error).message, 'bad');
    } finally {
      setBusy(false);
    }
  }

  const isImage = attachment.mime_type?.startsWith('image/');

  return (
    <button className="list-row" onClick={open} disabled={busy} type="button" title={d.docs.open}>
      <span className="li">
        <Icon name={isImage ? 'image' : 'file'} />
      </span>
      <span className="lmid">
        <span className="lt" style={{ display: 'block' }} dir="ltr">
          {attachment.file_name}
        </span>
        <span className="ld" style={{ display: 'block' }}>
          {attachment.kind} · {bytes(attachment.size_bytes)} · {dateLabel(attachment.created_at)}
        </span>
      </span>
      <span className="chev">{busy ? <span className="spin dark" /> : <Icon name="eye" />}</span>
    </button>
  );
}
