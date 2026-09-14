import { cookies } from 'next/headers';
import { DEFAULT_LOCALE, LOCALE_COOKIE, getDict, isLocale, isRTL, type Locale } from './index';

/** Reads the chosen language from the cookie. Server Components only. */
export async function getLocale(): Promise<Locale> {
  const store = await cookies();
  const value = store.get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

/** Convenience: locale + dictionary + direction in one call. */
export async function getI18n() {
  const locale = await getLocale();
  return { locale, d: getDict(locale), rtl: isRTL(locale) };
}
