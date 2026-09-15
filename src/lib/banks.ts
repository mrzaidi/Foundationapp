/**
 * Where the foundation sends money.
 *
 * Three groups, because they are three different things to a member: a branch
 * bank, a microfinance bank, and a mobile wallet. Many of the families the
 * foundation supports have no branch account at all and are paid into
 * Easypaisa or JazzCash, so leaving the wallets out would push those members
 * into picking something untrue.
 *
 * The name is stored verbatim on the profile — there is no bank table to join
 * against, and an account number is meaningless without the name beside it.
 */

export interface BankGroup {
  /** Dictionary key on d.bank.groups — the label the member sees. */
  key: 'commercial' | 'microfinance' | 'wallet';
  banks: string[];
}

export const BANK_GROUPS: BankGroup[] = [
  {
    key: 'commercial',
    banks: [
      'Al Baraka Bank (Pakistan) Limited',
      'Allied Bank Limited (ABL)',
      'Askari Bank Limited',
      'Bank Alfalah Limited',
      'Bank Al Habib Limited',
      'Bank Makramah Limited (formerly Summit Bank)',
      'Bank of Punjab (BOP)',
      'BankIslami Pakistan Limited',
      'Citibank N.A. Pakistan',
      'Deutsche Bank AG Pakistan',
      'Dubai Islamic Bank Pakistan Limited',
      'Faysal Bank Limited',
      'First Women Bank Limited',
      'Habib Bank Limited (HBL)',
      'Habib Metropolitan Bank Limited',
      'Industrial and Commercial Bank of China (ICBC)',
      'JS Bank Limited',
      'MCB Bank Limited',
      'MCB Islamic Bank Limited',
      'Meezan Bank Limited',
      'National Bank of Pakistan (NBP)',
      'Samba Bank Limited',
      'Silkbank Limited',
      'Sindh Bank Limited',
      'SME Bank Limited',
      'Soneri Bank Limited',
      'Standard Chartered Bank (Pakistan) Limited',
      'The Bank of Azad Jammu & Kashmir',
      'The Bank of Khyber (BOK)',
      'United Bank Limited (UBL)',
      'Zarai Taraqiati Bank Limited (ZTBL)',
    ],
  },
  {
    key: 'microfinance',
    banks: [
      'Advans Pakistan Microfinance Bank',
      'Apna Microfinance Bank',
      'FINCA Microfinance Bank',
      'HBL Microfinance Bank',
      'Khushhali Microfinance Bank',
      'Mobilink Microfinance Bank',
      'NRSP Microfinance Bank',
      'Sindh Microfinance Bank',
      'Telenor Microfinance Bank',
      'U Microfinance Bank (UBank)',
      'Waseela Microfinance Bank',
    ],
  },
  {
    key: 'wallet',
    banks: ['Easypaisa', 'JazzCash', 'NayaPay', 'SadaPay', 'UPaisa', 'HBL Konnect'],
  },
];

/** Flat list, used to check that a submitted value is one we offered. */
export const ALL_BANKS: string[] = BANK_GROUPS.flatMap((g) => g.banks);

export function isKnownBank(name: string): boolean {
  return ALL_BANKS.includes(name.trim());
}

/** Uppercase, no spaces or dashes — the form people paste is not the form we store. */
export function normalizeAccount(value: string): string {
  return value.replace(/[\s-]+/g, '').toUpperCase();
}

/**
 * IBAN check digits (ISO 13616 mod-97). A typo in a 24-character string is
 * otherwise invisible until a transfer bounces, which for this foundation
 * means a family waiting another week.
 */
function ibanValid(iban: string): boolean {
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;

  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const ch of rearranged) {
    const code = ch >= 'A' && ch <= 'Z' ? String(ch.charCodeAt(0) - 55) : ch;
    for (const digit of code) remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
}

export type AccountProblem = 'empty' | 'tooShort' | 'badChars' | 'badIban' | null;

/**
 * Accepts either a Pakistani IBAN or a plain account / wallet number.
 *
 * A value that *looks* like an IBAN is held to the IBAN standard — someone
 * typing "PK36SCBL…" means an IBAN, and a failed checksum there is a typo, not
 * a different kind of identifier.
 */
export function checkAccount(raw: string): AccountProblem {
  const v = normalizeAccount(raw);
  if (!v) return 'empty';
  if (!/^[A-Z0-9]+$/.test(v)) return 'badChars';
  if (/^PK/.test(v)) return ibanValid(v) ? null : 'badIban';
  if (v.length < 6) return 'tooShort';
  if (v.length > 34) return 'badChars';
  return null;
}

/** Group a stored IBAN into fours so a human can read it back off a screen. */
export function formatAccount(value: string | null | undefined): string {
  if (!value) return '';
  const v = normalizeAccount(value);
  return /^PK/.test(v) ? (v.match(/.{1,4}/g) ?? [v]).join(' ') : v;
}

/**
 * Server-side validation, in English.
 *
 * The API layer answers in English exactly like /api/auth/register does — the
 * member-facing screens validate in their own locale before they ever post, so
 * these messages surface only for a client that skipped that.
 */
const ACCOUNT_MESSAGE: Record<NonNullable<AccountProblem>, string> = {
  empty: 'Enter your IBAN or account number.',
  tooShort: 'That account number is too short.',
  badChars: 'Account numbers use letters and numbers only.',
  badIban: 'That IBAN is not valid.',
};

export interface BankProblem {
  /** Which column the caller should pin the message to. */
  field: 'bank_name' | 'bank_account_title' | 'bank_account_number';
  message: string;
}

export function validateBank(v: {
  bank_name: string;
  bank_account_title: string;
  bank_account_number: string;
}): BankProblem | null {
  if (!v.bank_name.trim()) return { field: 'bank_name', message: 'Select your bank.' };
  if (!isKnownBank(v.bank_name))
    return { field: 'bank_name', message: 'Choose a bank from the list.' };
  if (v.bank_account_title.trim().length < 3)
    return { field: 'bank_account_title', message: 'Enter the account holder name.' };

  const problem = checkAccount(v.bank_account_number);
  return problem ? { field: 'bank_account_number', message: ACCOUNT_MESSAGE[problem] } : null;
}

/** Does this profile have somewhere for money to land? */
export function hasBankDetails(p: {
  bank_name?: string | null;
  bank_account_title?: string | null;
  bank_account_number?: string | null;
}): boolean {
  return Boolean(
    p.bank_name?.trim() && p.bank_account_title?.trim() && p.bank_account_number?.trim()
  );
}
