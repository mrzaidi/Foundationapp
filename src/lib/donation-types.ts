/**
 * What kind of giving a donation is.
 *
 * These are not categories somebody invented for a dropdown — they are
 * distinct obligations in Islamic law, with different rules about who may
 * receive them and what they may be spent on. Zakat cannot be spent the way a
 * general donation can; Khums is accounted for separately again. A foundation
 * that records "PKR 5,000 arrived" and nothing else cannot answer the question
 * its own committee will eventually be asked, and cannot answer it
 * retrospectively either — the information is gone.
 *
 * So the type is recorded with the money, from the first donation onward.
 *
 * The slugs are what the database stores and must not change once donations
 * exist against them. The labels are what people read and can.
 */

export const DONATION_TYPES = [
  'khums',
  'zakat',
  'zakat_al_fitr',
  'sadaqah',
  'fidyah',
  'kaffarah',
  'nadhr',
  'general',
] as const;

export type DonationType = (typeof DONATION_TYPES)[number];

/** Where an unlabelled donation lands, including every one recorded before this. */
export const DEFAULT_DONATION_TYPE: DonationType = 'general';

export const DONATION_LABEL: Record<DonationType, string> = {
  khums: 'Khums',
  zakat: 'Zakat',
  zakat_al_fitr: 'Zakat al-Fitr',
  sadaqah: 'Sadaqah',
  fidyah: 'Fidyah',
  kaffarah: 'Kaffarah',
  nadhr: 'Nadhr',
  general: 'General Donation',
};

export const DONATION_LABEL_UR: Record<DonationType, string> = {
  khums: 'خمس',
  zakat: 'زکوٰۃ',
  zakat_al_fitr: 'زکوٰۃ الفطر',
  sadaqah: 'صدقہ',
  fidyah: 'فدیہ',
  kaffarah: 'کفارہ',
  nadhr: 'نذر',
  general: 'عام عطیہ',
};

/**
 * A colour each, fixed.
 *
 * Fixed rather than assigned by position, so a type keeps its colour when a
 * month has no Fidyah in it — a chart where the colours move between months is
 * a chart nobody can read across months.
 */
export const DONATION_COLOUR: Record<DonationType, string> = {
  khums: '#0e7a52',
  zakat: '#1baf7a',
  zakat_al_fitr: '#63c9a2',
  sadaqah: '#2a78d6',
  fidyah: '#7a6ff0',
  kaffarah: '#d69e2e',
  nadhr: '#e07a5f',
  general: '#8a9a94',
};

/** Anything the database might hold, made safe to look up. */
export function asDonationType(value: unknown): DonationType {
  return DONATION_TYPES.includes(value as DonationType)
    ? (value as DonationType)
    : DEFAULT_DONATION_TYPE;
}

export const donationLabel = (value: unknown, locale?: string) =>
  (locale === 'ur' ? DONATION_LABEL_UR : DONATION_LABEL)[asDonationType(value)];
