/**
 * Generates src/lib/loading-animation.json.
 *
 *   node scripts/build-lottie.mjs
 *
 * Hand-authoring Lottie JSON is unreadable and hand-editing it is worse, so the
 * animation is described here — in the app's own brand colours — and the JSON
 * is a build artefact. No external download, no third-party animation to keep
 * in sync with a rebrand.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/* ---- brand palette, as Lottie's 0–1 RGBA ---- */
const rgb = (hex) => [
  parseInt(hex.slice(1, 3), 16) / 255,
  parseInt(hex.slice(3, 5), 16) / 255,
  parseInt(hex.slice(5, 7), 16) / 255,
  1,
];
const BRAND = rgb('#14b892');
const DEEP = rgb('#0e9d63');
const GOLD = rgb('#e0a52b');

const FR = 60;
const DUR = 120; // 2s loop

/* easing that reads as a deliberate sweep rather than a mechanical one */
const EASE = { i: { x: [0.62], y: [1] }, o: { x: [0.38], y: [0] } };
const LINEAR = { i: { x: [1], y: [1] }, o: { x: [0], y: [0] } };

const still = (k) => ({ a: 0, k });
const keys = (frames) => ({
  a: 1,
  k: frames.map((f, i) => (i === frames.length - 1 ? { t: f.t, s: f.s } : { ...(f.e ?? EASE), t: f.t, s: f.s })),
});

const transform = () => ({
  ty: 'tr',
  p: still([0, 0]),
  a: still([0, 0]),
  s: still([100, 100]),
  r: still(0),
  o: still(100),
  sk: still(0),
  sa: still(0),
});

/** One spinning arc: a circle, trimmed to a sweeping segment, stroked. */
function arc({ ind, name, size, width, color, spin, offset = 0, opacity = 100 }) {
  return {
    ddd: 0,
    ind,
    ty: 4,
    nm: name,
    sr: 1,
    ks: {
      o: still(opacity),
      r: keys([
        { t: 0, s: [offset], e: LINEAR },
        { t: DUR, s: [offset + spin] },
      ]),
      p: still([100, 100, 0]),
      a: still([0, 0, 0]),
      s: still([100, 100, 100]),
    },
    ao: 0,
    shapes: [
      {
        ty: 'gr',
        nm: name,
        it: [
          { ty: 'el', d: 1, s: still([size, size]), p: still([0, 0]), nm: 'circle' },
          {
            ty: 'tm',
            // The tail chases the head: the segment grows, then is eaten from
            // behind, which is what makes the loop feel continuous.
            s: keys([
              { t: 0, s: [0] },
              { t: DUR / 2, s: [0] },
              { t: DUR, s: [95] },
            ]),
            e: keys([
              { t: 0, s: [5] },
              { t: DUR / 2, s: [100] },
              { t: DUR, s: [100] },
            ]),
            o: still(0),
            m: 1,
            nm: 'trim',
          },
          {
            ty: 'st',
            c: still(color),
            o: still(100),
            w: still(width),
            lc: 2,
            lj: 2,
            nm: 'stroke',
          },
          transform(),
        ],
      },
    ],
    ip: 0,
    op: DUR,
    st: 0,
    bm: 0,
  };
}

/** The steady heart in the middle — a filled dot that breathes. */
function pulse({ ind, name, size, color }) {
  return {
    ddd: 0,
    ind,
    ty: 4,
    nm: name,
    sr: 1,
    ks: {
      o: keys([
        { t: 0, s: [100] },
        { t: DUR / 2, s: [55] },
        { t: DUR, s: [100] },
      ]),
      r: still(0),
      p: still([100, 100, 0]),
      a: still([0, 0, 0]),
      s: {
        a: 1,
        k: [
          { ...EASE, t: 0, s: [76, 76, 100] },
          { ...EASE, t: DUR / 2, s: [108, 108, 100] },
          { t: DUR, s: [76, 76, 100] },
        ],
      },
    },
    ao: 0,
    shapes: [
      {
        ty: 'gr',
        nm: name,
        it: [
          { ty: 'el', d: 1, s: still([size, size]), p: still([0, 0]), nm: 'circle' },
          { ty: 'fl', c: still(color), o: still(100), r: 1, nm: 'fill' },
          transform(),
        ],
      },
    ],
    ip: 0,
    op: DUR,
    st: 0,
    bm: 0,
  };
}

const animation = {
  v: '5.7.4',
  fr: FR,
  ip: 0,
  op: DUR,
  w: 200,
  h: 200,
  nm: 'SHF loading',
  ddd: 0,
  assets: [],
  // Back to front: gold outside, brand inside, a deep-green dot at the centre.
  layers: [
    pulse({ ind: 1, name: 'core', size: 34, color: DEEP }),
    arc({ ind: 2, name: 'inner', size: 88, width: 9, color: BRAND, spin: 360 }),
    arc({ ind: 3, name: 'outer', size: 140, width: 7, color: GOLD, spin: -360, offset: 40, opacity: 78 }),
  ],
  markers: [],
};

const out = resolve(here, '../src/lib/loading-animation.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(animation), 'utf8');
console.log(`loading-animation.json written — ${JSON.stringify(animation).length} bytes`);
