'use client';

import dynamic from 'next/dynamic';
import { useI18n } from './LocaleProvider';
import animation from '@/lib/loading-animation.json';

/**
 * The loading state for a whole screen: one Lottie mark, dead centre.
 *
 * `LottieSvg` rather than the full `Lottie` — this animation is shapes and
 * strokes, so the svg-only build is all it needs and carries a smaller copy of
 * the engine. It loads client-side only because lottie-web reaches for
 * `document` as it initialises, and the animation is bundled rather than
 * fetched: a loader that waits on the network shows nothing for exactly as
 * long as it matters.
 *
 * Reduced motion needs no handling here — lottie-react declines to autoplay on
 * a device that asks for it, and the mark still renders on its first frame.
 */
const LottieSvg = dynamic(() => import('lottie-react').then((m) => m.LottieSvg), {
  ssr: false,
  // The engine is a separate chunk, so the very first loader on a cold visit
  // would otherwise be an empty box. A plain CSS ring covers that gap.
  loading: () => <span className="cl-fallback" aria-hidden="true" />,
});

export default function CenterLoader({
  label,
  size = 132,
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
          <LottieSvg src={animation} loop autoplay className="cl-anim" />
        </div>
        <p className="cl-text">{label ?? d.common.loading}</p>
      </div>
    </div>
  );
}
