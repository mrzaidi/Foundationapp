#!/usr/bin/env node
/**
 * Bring the household intake forms into the families table.
 *
 *   node scripts/import-families.mjs "<path to the .xlsx>"            # dry run
 *   node scripts/import-families.mjs "<path to the .xlsx>" --write    # writes
 *
 * The form is filled in by hand, so most answers are not the shape a column
 * expects. Twenty-two of twenty-seven income answers are not numbers. This
 * parses what can be read without guessing, leaves the rest null, and keeps
 * every original answer in `source_row` so nothing collected is lost and any
 * figure can be checked against what the family wrote.
 *
 * A figure a committee decides money on must not be invented. "Under 50000"
 * is not 50000, "500k+" is not 500000, and "£5000" is not 5000 rupees — all
 * three come through as no figure at all, and are named in `intake_notes`.
 *
 * Re-running is safe: a household already imported from the same form
 * response is updated rather than added again.
 */
import xlsx from 'xlsx';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

const args = process.argv.slice(2);
const FILE = args.find((a) => !a.startsWith('--'));
const WRITE = args.includes('--write');

if (!FILE) {
  console.error('\n  Give me the spreadsheet:\n    node scripts/import-families.mjs "<file.xlsx>"\n');
  process.exit(1);
}

const env = Object.fromEntries(
  readFileSync(resolve(ROOT, '.env.local'), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
    })
);
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

/* ------------------------------------------------------------------ columns */
const Q = {
  timestamp: 'Timestamp',
  head: '1. خاندان کے سربراہ کا نام',
  father: '2. والد کا نام',
  mobile: '3. موبائل نمبر',
  address: '4. مکمل پتہ',
  children: 'بچوں کی تعداد',
  women: 'خواتین کی تعداد',
  men: 'مردوں کی تعداد',
  incomeSource: 'آمدن کا ذریعہ',
  income: 'Family کی ماہانہ Income',
  expense: 'Family کے ماہانہ خرچ',
  house: 'اپنے گھر یا کرائے پر؟',
  housingNote: 'رہائش کی مزید تفصیل',
  hasBank: 'کیا خاندان کے پاس Bank Account ہے؟',
  iban: 'Family Bank Account Number / IBAN',
  accountTitle: 'Bank Account Holder Name',
  bankName: 'Bank Name',
  wallet: 'Easypaisa / JazzCash نمبر',
  electricity: 'بجلی کا ماہانہ خرچ',
  rent: 'کرایہ',
  education: 'بچوں کی تعلیم کا خرچ',
  medical: 'دوائی / علاج کا خرچ',
  problem: 'کوئی خاص مسئلہ / بیماری',
  verifier: 'تصدیق کنندہ کا نام',
  verifiedOn: 'تاریخ',
};

/* ------------------------------------------------------------- the parsers */
const text = (v) => {
  const s = v === null || v === undefined ? '' : String(v).trim();
  return s && !/^(n\/?a|none|-|—|null)$/i.test(s) ? s : null;
};

/** Words that mean "nothing", as opposed to "not answered". */
const isZero = (s) => /^(zero|none|nil|کوئی نہیں|کچھ نہیں|0)$/i.test(s.trim());

/**
 * A money answer, or nothing.
 *
 * Reads what is unambiguous — 100,000 · 50k · 54 thousand · 2 lakh · دو لاکھ —
 * and refuses everything else. "Under 50000" is a ceiling, "500k+" is a floor,
 * "£5000" is another currency, and a sentence describing two incomes is not a
 * figure. Each of those comes back { value: null, why } and is written down
 * rather than rounded into something that looks decided.
 */
function money(raw) {
  /*
   * Read the answer before text() strips it. "Zero" and "None" mean the same
   * thing on this form, but text() treats None as a blank and Zero as a word,
   * which had one household recorded as earning nothing and the next as not
   * having answered. Both are nothing, and both say where the nothing came
   * from, because a zero income is a strong claim to put in front of a
   * committee without showing the word it came from.
   */
  const written = raw === null || raw === undefined ? '' : String(raw).trim();
  if (/^(none|nil|zero|no|کوئی نہیں|کچھ نہیں)$/i.test(written))
    return { value: 0, why: `taken as nothing` };

  const s = text(raw);
  if (s === null) return { value: null, why: null };
  if (isZero(s)) return { value: 0, why: null };

  /*
   * Which currency the family answered in.
   *
   * These used to be refused outright, which left two households in pounds
   * looking as though they had told us nothing. The figure is theirs and it is
   * real; what was missing was somewhere to say it is not rupees.
   */
  const CURRENCIES = [
    [/£|\bgbp\b|\bpounds?\b/i, 'GBP'],
    [/€|\beur\b|\beuros?\b/i, 'EUR'],
    [/\$|\busd\b|\bdollars?\b/i, 'USD'],
    [/\bsar\b|\briyals?\b/i, 'SAR'],
    [/\baed\b|\bdirhams?\b/i, 'AED'],
  ];
  const found = CURRENCIES.find(([re]) => re.test(s));
  const currency = found ? found[1] : null;

  /*
   * A bound is still something the family told us.
   *
   * "Under 50000" and "500k+" were coming through as no answer at all, which
   * left eight households looking as though they had said nothing about their
   * income when they had said a good deal. The bound they gave is recorded,
   * and the record says it is a bound and which way it points — so a committee
   * reads "at least 500,000" rather than a figure pretending to be exact, and
   * never an empty box that reads as nothing.
   */
  const atMost = /\b(under|below|up to|less than|تک)\b/i.test(s);
  // The plus has to be attached to the number — "500k+" and "80k+" mean "or
  // more", while "75000 shop+ house" is one figure covering two things.
  const atLeast =
    /\b(more than|above|over|at least|se zyada|سے زیادہ)\b/i.test(s) || /\d\s*k?\s*\+/i.test(s);
  const bound = atMost ? 'at most' : atLeast ? 'at least' : null;

  // Currency and bound markers are not part of the figure.
  const cleaned = s
    .replace(/,/g, '')
    .replace(/[£€$+]/g, ' ')
    .replace(/\b(rs|pkr|rupees?|gbp|eur|usd|sar|aed|pounds?|euros?|dollars?)\b\.?:?/gi, ' ')
    .replace(/\b(under|below|up to|less than|more than|above|over|at least|se zyada)\b/gi, ' ')
    .replace(/روپیہ|روپے|سے زیادہ|تک/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  /** Wraps a parsed figure so a bound always says it is one. */
  const out = (value) =>
    bound === null
      ? { value, why: null, currency }
      : { value, why: `recorded as ${bound} this — the family gave a range`, currency };

  // 0.3 million · 2 million
  const million = cleaned.match(/^(\d+(?:\.\d+)?)\s*(million|m)\b/i);
  if (million) return out(Math.round(Number(million[1]) * 1000000));

  // 2 lakh · دو لاکھ
  if (/لاکھ|lakh/i.test(cleaned)) {
    const n = Number((cleaned.match(/(\d+(?:\.\d+)?)/) ?? [])[1]);
    if (Number.isFinite(n)) return out(Math.round(n * 100000));
    if (/^دو\s*لاکھ$/.test(cleaned)) return { value: 200000, why: null, currency };
    return { value: null, why: 'written in words', currency };
  }

  // 300k · 50 k
  const k = cleaned.match(/^(\d+(?:\.\d+)?)\s*k$/i);
  if (k) return out(Math.round(Number(k[1]) * 1000));

  // 54 thousand · 30000 thousend (a spelling of the number already given)
  const thousand = cleaned.match(/^(\d+(?:\.\d+)?)\s*(thousand|thousend|housend|ہزار)/i);
  if (thousand) {
    const n = Number(thousand[1]);
    // "30000 thousend" means 30000, not thirty million.
    return out(n >= 1000 ? Math.round(n) : Math.round(n * 1000));
  }

  const plain = cleaned.match(/^(\d+(?:\.\d+)?)$/);
  if (plain) return out(Math.round(Number(plain[1])));

  /*
   * One number and some words around it — "70000/مبلغ ستر ہزار روپیہ",
   * "Medicine 3000", "50000 /fifty thousend" — is that number. Exactly one:
   * the moment there are two the answer is describing more than one thing
   * ("Home electric bill 11 thousand/shop electric bill 28 thousand") and
   * which one belongs in the column is a guess.
   */
  const numbers = cleaned.match(/\d+(?:\.\d+)?/g) ?? [];
  if (numbers.length === 1) {
    const n = Number(numbers[0]);
    // A bare 10 beside the word for thousand was handled above; anything this
    // small standing alone in a sentence is more likely a count than money.
    if (n >= 100) return out(Math.round(n));
  }

  return { value: null, why: 'could not be read as a figure', currency };
}

/** A count, or nothing. */
function count(raw) {
  const s = text(raw);
  if (s === null) return { value: null, why: null };
  if (isZero(s)) return { value: 0, why: null };
  const n = s.match(/^(\d+)$/);
  if (n) return { value: Number(n[1]), why: null };
  return { value: null, why: `not a number — “${s}”` };
}

/** An age in whole years, or nothing. Months round down to 0. */
function age(raw) {
  const s = text(raw);
  if (s === null) return null;
  if (/month|ماہ/i.test(s)) return 0;
  // A field holding several people is a filling-in mistake, not an age.
  if ((s.match(/\d+/g) ?? []).length > 1 && /[A-Za-z؀-ۿ]{3,}/.test(s)) return null;
  const n = s.match(/(\d+)/);
  return n ? Math.min(Number(n[1]), 120) : null;
}

const SOURCES = [
  [/نوکری|job/i, 'job'],
  [/کاروبار|business/i, 'business'],
  [/پنشن|pension/i, 'pension'],
  [/مزدور|labour|labor/i, 'labour'],
  [/دیگر|other/i, 'other'],
];

const incomeSources = (raw) => {
  const s = text(raw);
  if (!s) return [];
  return [...new Set(SOURCES.filter(([re]) => re.test(s)).map(([, k]) => k))];
};

const houseType = (raw) => {
  const s = text(raw);
  if (!s) return null;
  if (/کرائے|rent/i.test(s)) return 'rent';
  if (/اپنا|own/i.test(s)) return 'own';
  return null;
};

const yesNo = (raw) => {
  const s = text(raw);
  if (!s) return null;
  if (/ہاں|yes/i.test(s)) return true;
  if (/نہیں|no/i.test(s)) return false;
  return null;
};

/** The form's m/d/yy, as a date. */
function formDate(raw) {
  const s = text(raw);
  if (!s) return null;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  const year = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3]);
  const d = new Date(Date.UTC(year, Number(m[1]) - 1, Number(m[2])));
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function stamp(raw) {
  const s = text(raw);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/* ------------------------------------------------------------------- import */
const rows = xlsx.utils.sheet_to_json(xlsx.readFile(FILE).Sheets['Form Responses 1'], {
  defval: null,
  raw: false,
});

console.log(`\n  ${rows.length} response(s) in ${FILE.split(/[\\/]/).pop()}`);
console.log(`  mode: ${WRITE ? 'WRITE' : 'dry run — nothing will be saved'}\n`);

const prepared = [];
const problems = [];

for (const [i, r] of rows.entries()) {
  const line = i + 2; // the row number a person would see in Excel
  const head = text(r[Q.head]);
  if (!head) {
    problems.push(`row ${line}: no head of the family — skipped`);
    continue;
  }

  const notes = [];
  /*
   * A household answers in one currency, so the currencies its money fields
   * carry are collected here rather than stored per amount. Two different ones
   * in the same household is a filling-in problem, not a fact, and is said so.
   */
  const currencies = new Set();

  const note = (label, res, original) => {
    if (res.currency) currencies.add(res.currency);
    if (res.why) notes.push(`${label}: ${res.why} — the form says “${String(original).trim()}”`);
    return res.value;
  };

  const kids = count(r[Q.children]);
  const women = count(r[Q.women]);
  const men = count(r[Q.men]);
  const c = note('Children', kids, r[Q.children]);
  const w = note('Women', women, r[Q.women]);
  const m = note('Men', men, r[Q.men]);

  const total = [c, w, m].every((v) => v === null) ? null : (c ?? 0) + (w ?? 0) + (m ?? 0);

  const members = [];
  for (let n = 1; n <= 4; n++) {
    const name = text(r[`فرد نمبر ${n} — نام`]);
    const relation = text(r[`فرد نمبر ${n} — رشتہ / کام`]);
    const ageRaw = r[`فرد نمبر ${n} — عمر`];
    if (!name && !relation && !text(ageRaw)) continue;
    const years = age(ageRaw);
    if (text(ageRaw) && years === null)
      notes.push(`Age of person ${n}: could not be read — the form says “${String(ageRaw).trim()}”`);
    members.push({ name, age: years, relation });
  }

  const sources = incomeSources(r[Q.incomeSource]);

  // Excel turns a long account number into a float. Two of these came through
  // as 5.3917E+13; the digits survive but any leading zero does not, so they
  // are called out rather than trusted. Noted here, before intake_notes is
  // built from this list — added afterwards it reached the console and never
  // reached the record, which is the half that matters.
  if (/E\+/i.test(String(r[Q.iban] ?? '')))
    notes.push('Account number: Excel stored this as a number — check it against the form.');

  const row = {
    head_name: head,
    father_name: text(r[Q.father]),
    /*
     * The form asks for one number, right after the father's name, and that
     * is the number the office means when it says the father's mobile. It
     * fills both: the household's contact, which is what the list shows, and
     * the father's, which is where staff look for it on the record.
     */
    contact: text(r[Q.mobile]),
    father_mobile: text(r[Q.mobile]),
    address: text(r[Q.address]),

    children_count: c,
    male_count: m,
    female_count: w,
    total_members: total,
    members,

    income_sources: sources,
    income_source_other: sources.includes('other') ? text(r[Q.incomeSource]) : null,
    monthly_income: note('Monthly income', money(r[Q.income]), r[Q.income]),
    monthly_expense: note('Monthly expense', money(r[Q.expense]), r[Q.expense]),

    house_type: houseType(r[Q.house]),
    housing_note: text(r[Q.housingNote]),

    has_bank_account: yesNo(r[Q.hasBank]),
    bank_name: text(r[Q.bankName]),
    bank_account_title: text(r[Q.accountTitle]),
    bank_account_number: text(r[Q.iban]),
    wallet_number: text(r[Q.wallet]),

    bill_ke: note('Electricity', money(r[Q.electricity]), r[Q.electricity]),
    rent: note('Rent', money(r[Q.rent]), r[Q.rent]),
    education_expense: note('Education', money(r[Q.education]), r[Q.education]),
    medical_expense: note('Medical', money(r[Q.medical]), r[Q.medical]),

    fund_reason: text(r[Q.problem]),
    verified_by: text(r[Q.verifier]),
    verified_on: formDate(r[Q.verifiedOn]),
    submitted_at: stamp(r[Q.timestamp]),

    source_row: r,
  };

  /*
   * Both of these are decided from what the money fields turned up, so they
   * are set after the row rather than inside it — a property that reads a list
   * the properties above it are still filling is a trap for whoever reorders
   * them next.
   */
  if (currencies.size === 1) {
    row.currency = [...currencies][0];
  } else if (currencies.size > 1) {
    row.currency = 'PKR';
    notes.push(
      `Currency: the form mixes ${[...currencies].join(' and ')} — left as PKR, please check.`
    );
  }

  row.intake_notes = notes.length ? notes.join('\n') : null;

  prepared.push({ line, head, row, notes });
}

/* -------------------------------------------------------------- the report */
const withNotes = prepared.filter((p) => p.notes.length);
const noIncome = prepared.filter((p) => p.row.monthly_income === null);

console.log(`  ${prepared.length} household(s) ready, ${problems.length} skipped\n`);
for (const p of problems) console.log(`    ${p}`);

console.log('  PARSED CLEANLY');
console.log(`    with a monthly income figure     ${prepared.length - noIncome.length}`);
console.log(`    with a household size            ${prepared.filter((p) => p.row.total_members !== null).length}`);
console.log(`    with bank details                ${prepared.filter((p) => p.row.bank_account_number).length}`);
console.log(`    with people listed               ${prepared.filter((p) => p.row.members.length).length}`);

console.log(`\n  NEEDS A HUMAN EYE — ${withNotes.length} household(s)`);
for (const p of withNotes) {
  console.log(`\n    ${p.head}  (row ${p.line})`);
  for (const n of p.notes) console.log(`      · ${n}`);
}

if (!WRITE) {
  console.log('\n  Nothing was written. Add --write to save.\n');
  process.exit(0);
}

/* -------------------------------------------------------------- the writing */
console.log('\n  WRITING\n');

/*
 * Only write columns the table actually has.
 *
 * The importer runs against whatever migrations have been applied, and a row
 * naming a column that is not there yet is rejected whole — so a household
 * would fail entirely over one field nobody has added. Anything missing is
 * dropped and named, and a later run fills it in.
 */
const probe = await db.from('families').select('*').limit(1);
const known = probe.data?.[0] ? new Set(Object.keys(probe.data[0])) : null;
const dropped = new Set();

const fit = (row) => {
  if (!known) return row;
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    if (known.has(k)) out[k] = v;
    else dropped.add(k);
  }
  return out;
};

let added = 0;
let updated = 0;
let failed = 0;

for (const p of prepared) {
  // The form's own timestamp identifies a response, so a second run updates
  // rather than duplicating.
  const { data: existing } = await db
    .from('families')
    .select('id')
    .eq('head_name', p.row.head_name)
    .eq('submitted_at', p.row.submitted_at)
    .maybeSingle();

  const { error } = existing
    ? await db.from('families').update(fit(p.row)).eq('id', existing.id)
    : await db.from('families').insert(fit(p.row));

  if (error) {
    console.log(`    FAILED  ${p.head}: ${error.message}`);
    failed++;
    continue;
  }
  existing ? updated++ : added++;
}

console.log(`\n    added ${added}, updated ${updated}, failed ${failed}`);
if (dropped.size)
  console.log(
    `    not written — no such column yet: ${[...dropped].join(', ')}\n` +
      `    run the migration that adds it, then this script again.`
  );
const { count: total } = await db.from('families').select('*', { count: 'exact', head: true });
console.log(`    families now holds ${total} household(s)\n`);
