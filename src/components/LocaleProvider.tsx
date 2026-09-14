'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { getDict, isRTL, localeTag, type Dict, type Locale } from '@/lib/i18n';

interface Ctx {
  locale: Locale;
  d: Dict;
  rtl: boolean;
  tag: string;
}

const LocaleCtx = createContext<Ctx>({
  locale: 'en',
  d: getDict('en'),
  rtl: false,
  tag: 'en-GB',
});

/** Client components read the active language from here. */
export function useI18n() {
  return useContext(LocaleCtx);
}

export default function LocaleProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: ReactNode;
}) {
  return (
    <LocaleCtx.Provider
      value={{ locale, d: getDict(locale), rtl: isRTL(locale), tag: localeTag(locale) }}
    >
      {children}
    </LocaleCtx.Provider>
  );
}
