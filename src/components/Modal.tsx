'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * A modal that escapes whatever it was rendered inside.
 *
 * `position: fixed` is only relative to the viewport while no ancestor has a
 * transform, filter or will-change — any one of those makes that ancestor the
 * containing block instead. The fund editor lived inside a `.kpi` card, which
 * lifts on hover with `transform: translateY(-2px)` and clips with
 * `overflow: hidden`: the moment you clicked Edit, the overlay was measured
 * against a 270px card and clipped to it, so the dialog came out narrow, cut
 * off at the top, with its Save button somewhere below the fold.
 *
 * Rendering into `document.body` puts it back on the viewport for good, wherever
 * the trigger happens to sit.
 */
export default function Modal({
  onClose,
  busy = false,
  children,
  className = '',
  label,
}: {
  onClose: () => void;
  /** While true the backdrop and Escape are inert — a save is in flight. */
  busy?: boolean;
  children: React.ReactNode;
  className?: string;
  label?: string;
}) {
  // Portals cannot render during SSR; wait for the client before mounting.
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  useEffect(() => {
    if (busy) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  // The page behind must not scroll while a dialog is over it.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  if (!ready) return null;

  return createPortal(
    <div className="amodal-back" onClick={busy ? undefined : onClose}>
      <div
        className={`amodal ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body
  );
}
