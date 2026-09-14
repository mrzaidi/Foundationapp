import type { Locale } from './i18n';
import type { FundType } from './types';

/** Fund copy is data, not code — pick the column for the active language. */
export function fundText(fund: FundType | null | undefined, locale: Locale) {
  if (!fund) {
    return { name: '', description: '', documentLabel: '' };
  }

  const ur = locale === 'ur';
  return {
    name: (ur && fund.name_ur) || fund.name,
    description: (ur && fund.description_ur) || fund.description || '',
    documentLabel: (ur && fund.document_label_ur) || fund.document_label,
  };
}
