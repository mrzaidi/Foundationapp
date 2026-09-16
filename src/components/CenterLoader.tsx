'use client';

import { useI18n } from './LocaleProvider';

/**
 * The loading state for a whole screen: the foundation's mark, drawing itself.
 *
 * This was a Lottie animation until it was measured. The animation file is
 * 3 KB; the engine that plays it is 242 KB of JavaScript, in a separate chunk
 * that has to arrive before anything moves — so the loader was the slowest
 * thing on a slow connection, which is exactly backwards. It is now inline SVG
 * and CSS: nothing to download, nothing to parse, and it paints on the first
 * frame of the page that needs it.
 *
 * `prefers-reduced-motion` is honoured in the stylesheet, where the strokes
 * simply hold still rather than pulsing.
 */
export default function CenterLoader({
  label,
  size = 108,
}: {
  /** Overrides the dictionary's wording — the admin portal names the section. */
  label?: string;
  size?: number;
}) {
  const { d } = useI18n();

  return (
    <div className="center-loader" role="status" aria-live="polite">
      <div className="cl-inner">
        <div className="cl-art" style={{ width: size, height: size }}>
          <svg className="cl-mark" viewBox="0 0 120 120" aria-hidden="true">
            {/* The ring: a single dashed circle, rotating. */}
            <circle className="cl-track" cx="60" cy="60" r="50" />
            <circle className="cl-sweep" cx="60" cy="60" r="50" />

            {/* Two hands holding a figure — the mark, reduced to what still
                reads at this size. */}
            <g className="cl-hands">
              <path d="M60 86c-9-1-17-6-22-14" />
              <path d="M60 86c9-1 17-6 22-14" />
              <circle cx="60" cy="44" r="7" />
              <path d="M49 70v-4c0-6 5-11 11-11s11 5 11 11v4" />
            </g>
          </svg>
        </div>
        <p className="cl-text">{label ?? d.common.loading}</p>
      </div>
    </div>
  );
}
