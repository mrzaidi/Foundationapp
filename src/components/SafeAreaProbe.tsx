'use client';

import { useEffect } from 'react';

/**
 * Marks the document when the device actually reports safe-area insets.
 *
 * CSS can consume `env(safe-area-inset-top)` but cannot branch on whether it is
 * zero, and one thing does need to branch: the simulated status bar. In a
 * browser tab it sells the app feel; inside the Android shell there is a real
 * status bar a few pixels above it, and two clocks is worse than none.
 *
 * Measured rather than sniffed — a user agent string does not tell you whether
 * this particular window has an inset, and a foldable or a rotation can change
 * the answer without a reload.
 */
export default function SafeAreaProbe() {
  useEffect(() => {
    const probe = document.createElement('div');
    probe.style.cssText =
      'position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;' +
      'padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)';
    document.body.appendChild(probe);

    const read = () => {
      const s = getComputedStyle(probe);
      const top = parseFloat(s.paddingTop) || 0;
      const bottom = parseFloat(s.paddingBottom) || 0;

      const root = document.documentElement;
      if (top > 0) root.setAttribute('data-safe-area', 'top');
      else root.removeAttribute('data-safe-area');
      root.style.setProperty('--inset-bottom', `${bottom}px`);
    };

    read();
    window.addEventListener('resize', read);
    window.addEventListener('orientationchange', read);

    return () => {
      window.removeEventListener('resize', read);
      window.removeEventListener('orientationchange', read);
      probe.remove();
    };
  }, []);

  return null;
}
