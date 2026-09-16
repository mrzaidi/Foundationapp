/**
 * Regenerates every raster form of the logo from public/img/logo.svg.
 *
 *   node scripts/build-icons.mjs
 *
 * The SVG is the only place the mark is drawn. The PWA icons and the receipt
 * logo are outputs of it, so editing the vector and running this keeps the
 * three from drifting apart — which is what happens when a logo is redrawn
 * separately for each place it appears.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const svg = readFileSync(resolve(root, 'public/img/logo.svg'));

// Rendered at high density then scaled down, so curves stay clean at 192px.
const png = (size) => sharp(svg, { density: 600 }).resize(size, size).png({ compressionLevel: 9 });

for (const size of [192, 512]) {
  const out = resolve(root, `public/icons/icon-${size}.png`);
  await png(size).toFile(out);
  console.log(`icon-${size}.png`);
}

/*
 * The receipt embeds the logo as base64 rather than reading public/ or
 * fetching over HTTP: a serverless function does not reliably ship the public
 * directory, and fetching the deployment through its own front door breaks the
 * moment deployment protection is turned on.
 */
const buf = await png(256).toBuffer();
const b64 = buf.toString('base64');
const lines = b64
  .match(/.{1,96}/g)
  .map((l) => `  '${l}'`)
  .join(' +\n');

writeFileSync(
  resolve(root, 'src/lib/invoice-logo.ts'),
  `/**
 * The foundation mark, for the payment receipt.
 *
 * Generated from public/img/logo.svg by scripts/build-icons.mjs — do not edit
 * by hand. Inlined rather than read from public/ or fetched over HTTP, because
 * a serverless function does not reliably ship the public directory and
 * fetching the deployment through its own front door breaks the moment
 * deployment protection is turned on.
 */
export const LOGO_PNG_BASE64 =
${lines};
`
);

console.log(`invoice-logo.ts (${Math.round(b64.length / 1024)} kB base64)`);
