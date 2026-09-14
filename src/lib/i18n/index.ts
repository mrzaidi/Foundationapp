import en from './en';
import ur from './ur';

export const LOCALES = ['en', 'ur'] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';
export const LOCALE_COOKIE = 'shf_locale';

const DICTS = { en, ur } as const;

export type Dict = typeof en;

export function getDict(locale: Locale): Dict {
  return DICTS[locale] ?? en;
}

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

export function isRTL(locale: Locale) {
  return locale === 'ur';
}

export function dirOf(locale: Locale) {
  return isRTL(locale) ? 'rtl' : 'ltr';
}

/** Locale-aware number/date formatting. Urdu keeps Western digits, as PKR
 *  amounts are written in Pakistan — only the surrounding text changes. */
export function localeTag(locale: Locale) {
  return locale === 'ur' ? 'ur-PK' : 'en-GB';
}
