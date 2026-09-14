'use client';

import { useEffect, useMemo, useState } from 'react';
import Icon from './Icon';
import Lightbox, { type LightboxItem } from './Lightbox';
import { useI18n } from './LocaleProvider';
import { useToast } from './Toast';
import { bytes, dateLabel } from '@/lib/format';
import type { Attachment } from '@/lib/types';

/**
 * Attached documents, shown as a thumbnail grid rather than a list of file
 * names — the point of a bill or a report is what it looks like.
 *
 * Every file is private: the URLs are signed on mount and expire in ten
 * minutes, so nothing here is reachable without the viewer's own session.
 */
export default function DocumentGallery({ attachments }: { attachments: Attachment[] }) {
  const { d } = useI18n();
  const toast = useToast();

  const [urls, setUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;

    (async () => {
      const entries = await Promise.all(
        attachments.map(async (a) => {
          try {
            const res = await fetch(`/api/documents?path=${encodeURIComponent(a.path)}`);
            const json = await res.json();
            if (!res.ok) throw new Error(json.error);
            return [a.id, json.url as string] as const;
          } catch {
            return [a.id, ''] as const;
          }
        })
      );
      if (!alive) return;
      setUrls(Object.fromEntries(entries));
      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, [attachments]);

  const items: LightboxItem[] = useMemo(
    () =>
      attachments.map((a) => ({
        url: urls[a.id] ?? '',
        name: a.file_name,
        isImage: Boolean(a.mime_type?.startsWith('image/')),
      })),
    [attachments, urls]
  );

  if (attachments.length === 0) {
    return (
      <div className="card center">
        <p className="muted mb-0" style={{ fontSize: 13 }}>
          {d.detail.noDocuments}
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="doc-gallery">
        {attachments.map((a, i) => {
          const url = urls[a.id];
          const isImage = a.mime_type?.startsWith('image/');
          return (
            <button
              key={a.id}
              type="button"
              className="doc-tile"
              title={a.file_name}
              onClick={() => {
                if (!url) {
                  toast(d.docs.failed, 'bad');
                  return;
                }
                setOpen(i);
              }}
            >
              <span className="dt-shot">
                {loading ? (
                  <span className="sk" style={{ width: '100%', height: '100%' }} />
                ) : isImage && url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={url} alt="" loading="lazy" />
                ) : (
                  <span className="dt-file">
                    <Icon name="file" />
                  </span>
                )}
                <span className="dt-zoom">
                  <Icon name="eye" />
                </span>
              </span>
              <span className="dt-name" dir="ltr">
                {a.file_name}
              </span>
              <span className="dt-meta">
                {a.kind} · {bytes(a.size_bytes)} · {dateLabel(a.created_at)}
              </span>
            </button>
          );
        })}
      </div>

      <Lightbox items={items} index={open} onIndex={setOpen} onClose={() => setOpen(null)} />
    </>
  );
}
