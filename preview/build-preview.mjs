/**
 * Builds two self-contained pages from the real app source:
 *
 *   preview/design-review.html  — annotated walk-through of every screen
 *   preview/prototype.html      — clickable prototype (EN / اردو, no backend)
 *
 *   node preview/build-preview.mjs
 *
 * Both inline the app's own stylesheet and SVG assets, so they need no server
 * and no network. The prototype's copy is read straight out of src/lib/i18n,
 * so the two never drift apart.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

const ASSETS = ['bg-mesh.svg', 'pattern-geo.svg', 'header-wave.svg', 'logo.svg'];

const dataUri = (file) =>
  `data:image/svg+xml;base64,${Buffer.from(readFileSync(file, 'utf8'), 'utf8').toString('base64')}`;

/* ---------- stylesheet with the assets inlined ---------- */
let css = readFileSync(resolve(root, 'src/app/globals.css'), 'utf8');
for (const name of ASSETS) {
  css = css.split(`/img/${name}`).join(dataUri(resolve(root, 'public/img', name)));
}
// the preview frames size the phone themselves
css = css.replace(/height: 100vh;\n  max-height: 932px;/, 'height: 100%;');

const logoUri = dataUri(resolve(root, 'public/img/logo.svg'));

/* ---------- dictionaries, loaded from the TypeScript source ---------- */
function loadDict(file) {
  const src = readFileSync(resolve(root, 'src/lib/i18n', file), 'utf8');
  const body = src
    .slice(src.indexOf('{', src.indexOf('const ')))
    .replace(/\nexport default \w+;?\s*$/, '')
    .trim()
    .replace(/;\s*$/, '');

  const js = body
    .replace(/ as '[^']*'(?:\s*\|\s*'[^']*')*/g, '') // `as 'ltr' | 'rtl'`
    .replace(/\s+as const/g, '') // `as const`
    .replace(/:\s*(number|string)\b/g, ''); // parameter annotations

  try {
    return new Function(`return (${js})`)();
  } catch (e) {
    throw new Error(`Could not evaluate ${file}: ${e.message}`);
  }
}

const en = loadDict('en.ts');
const ur = loadDict('ur.ts');

/* ---------- fund copy (mirrors supabase/seed.sql + 0003_urdu.sql) ---------- */
const FUND_COPY = {
  en: {
    monthly: {
      name: 'Monthly Fund',
      desc: 'Recurring monthly support for registered families',
      doc: 'Income / need proof (optional)',
    },
    accidental: {
      name: 'Accidental Fund',
      desc: 'Emergency help after an accident or medical event',
      doc: 'Medical report, prescription or hospital bill',
    },
    grocery: {
      name: 'Grocery Fund',
      desc: 'Ration and household grocery assistance',
      doc: 'Grocery estimate or shop bill',
    },
    electricity: {
      name: 'Electricity Bill Fund',
      desc: 'Help clearing an outstanding electricity bill',
      doc: 'Latest electricity bill',
    },
  },
  ur: {
    monthly: {
      name: 'ماہانہ فنڈ',
      desc: 'رجسٹرڈ خاندانوں کے لیے ہر ماہ باقاعدہ امداد',
      doc: 'آمدنی یا ضرورت کا ثبوت (اختیاری)',
    },
    accidental: {
      name: 'حادثاتی فنڈ',
      desc: 'حادثے یا طبی ایمرجنسی کے بعد فوری مدد',
      doc: 'میڈیکل رپورٹ، نسخہ یا ہسپتال کا بل',
    },
    grocery: {
      name: 'راشن فنڈ',
      desc: 'گھریلو راشن اور اشیائے خوردونوش کی امداد',
      doc: 'راشن کا تخمینہ یا دکان کا بل',
    },
    electricity: {
      name: 'بجلی بل فنڈ',
      desc: 'بقایا بجلی کا بل ادا کرنے میں مدد',
      doc: 'تازہ ترین بجلی کا بل',
    },
  },
};

/** Functions can't go through JSON, so serialise them as source. */
function toJs(value, indent = 0) {
  const pad = '  '.repeat(indent);
  if (typeof value === 'function') return value.toString();
  if (Array.isArray(value)) {
    return `[${value.map((v) => toJs(v, indent + 1)).join(', ')}]`;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value).map(
      ([k, v]) => `${pad}  ${JSON.stringify(k)}: ${toJs(v, indent + 1)}`
    );
    return `{\n${entries.join(',\n')}\n${pad}}`;
  }
  return JSON.stringify(value);
}

const DICT = toJs({
  en: { ...en, funds: FUND_COPY.en },
  ur: { ...ur, funds: FUND_COPY.ur },
});

/* ---------- shared icon sprite, lifted from the review template ---------- */
const reviewTemplate = readFileSync(resolve(here, 'template.html'), 'utf8');
const sprite = reviewTemplate.match(/<symbol[\s\S]*<\/symbol>/)[0];

/* ---------- write both pages ---------- */
function build(templateFile, outFile, extra = {}) {
  let html = readFileSync(resolve(here, templateFile), 'utf8');
  html = html.replace('<!--APP_CSS-->', () => css);
  html = html.replace('<!--SPRITE-->', () => sprite);
  if (extra.dict) html = html.replace('<!--DICT-->', () => extra.dict);
  html = html.split('PV_LOGO').join(logoUri);

  const out = resolve(here, outFile);
  writeFileSync(out, html, 'utf8');
  console.log(`${outFile} — ${(html.length / 1024).toFixed(0)} KB`);
}

build('template.html', 'design-review.html');
build('prototype.template.html', 'prototype.html', { dict: DICT });
