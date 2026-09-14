'use client';

import { useEffect } from 'react';
import Icon from './Icon';
import { useI18n } from './LocaleProvider';

export interface LightboxItem {
  url: string;
  name: string;
  isImage: boolean;
}

/**
 * Full-screen viewer for attached documents. A bill or a medical report is the
 * evidence behind a request — it deserves to be looked at properly rather than
 * opened in a stray browser tab.
 */
export default function Lightbox({
  items,
  index,
  onIndex,
  onClose,
}: {
  items: LightboxItem[];
  index: number | null;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const { d } = useI18n();
  const openIdx = index ?? -1;
  const current = openIdx >= 0 ? items[openIdx] : null;

  useEffect(() => {
    if (!current) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' && openIdx < items.length - 1) onIndex(openIdx + 1);
      if (e.key === 'ArrowLeft' && openIdx > 0) onIndex(openIdx - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current, openIdx, items.length, onIndex, onClose]);

  if (!current) return null;

  return (
    <div className="lightbox" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="lb-bar" onClick={(e) => e.stopPropagation()}>
        <span className="lb-name" dir="ltr">
          {current.name}
        </span>
        {items.length > 1 && (
          <span className="lb-count num">
            {openIdx + 1} / {items.length}
          </span>
        )}
        <a className="lb-btn" href={current.url} target="_blank" rel="noopener noreferrer" title={d.docs.open}>
          <Icon name="download" />
        </a>
        <button className="lb-btn" onClick={onClose} aria-label={d.common.close} type="button">
          <Icon name="x" />
        </button>
      </div>

      <div className="lb-stage" onClick={(e) => e.stopPropagation()}>
        {openIdx > 0 && (
          <button
            className="lb-nav lb-prev"
            onClick={() => onIndex(openIdx - 1)}
            aria-label="Previous"
            type="button"
          >
            <Icon name="chevronLeft" />
          </button>
        )}

        {current.isImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={current.url} alt={current.name} />
        ) : (
          <div className="lb-file">
            <Icon name="file" />
            <p>{current.name}</p>
            <a className="btn" href={current.url} target="_blank" rel="noopener noreferrer">
              <Icon name="eye" />
              <span>{d.docs.open}</span>
            </a>
          </div>
        )}

        {openIdx < items.length - 1 && (
          <button
            className="lb-nav lb-next"
            onClick={() => onIndex(openIdx + 1)}
            aria-label="Next"
            type="button"
          >
            <Icon name="chevronRight" />
          </button>
        )}
      </div>
    </div>
  );
}
