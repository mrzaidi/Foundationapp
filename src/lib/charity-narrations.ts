/**
 * Narrations on charity, printed on a donor's receipt.
 *
 * Kept in their own file, away from the layout code, for one reason: these are
 * religious texts attributed to the Prophet and the Ahlul Bayt, and a person
 * at the foundation must be able to read the whole list, check every
 * attribution, and correct it without going anywhere near a PDF library.
 *
 * Widely reported narrations only, each carrying the source it is usually
 * cited from. If a scholar at the foundation disputes a wording or an
 * attribution, change it here — the receipt takes whatever this file says.
 */

export interface Narration {
  /** The narration itself, in English. */
  text: string;
  /** Who it is reported from. */
  said: string;
  /** Where it is commonly cited from. */
  source: string;
}

export const CHARITY_NARRATIONS: Narration[] = [
  {
    text: 'Charity does not decrease wealth.',
    said: 'The Prophet Muhammad (peace be upon him and his family)',
    source: 'Sahih Muslim',
  },
  {
    text: 'Every act of kindness is charity.',
    said: 'The Prophet Muhammad (peace be upon him and his family)',
    source: 'Sahih al-Bukhari',
  },
  {
    text: 'Give charity without delay, for it stands in the way of calamity.',
    said: 'The Prophet Muhammad (peace be upon him and his family)',
    source: 'Sunan al-Tirmidhi',
  },
  {
    text: 'When you are in need, trade with God through charity.',
    said: 'Imam Ali ibn Abi Talib (peace be upon him)',
    source: 'Nahj al-Balagha',
  },
  {
    text: 'Charity given in secret extinguishes the anger of the Lord.',
    said: 'Imam Ja’far al-Sadiq (peace be upon him)',
    source: 'al-Kafi',
  },
  {
    text: 'Treat your sick by giving charity.',
    said: 'The Prophet Muhammad (peace be upon him and his family)',
    source: 'Reported in al-Kafi and Sunan al-Bayhaqi',
  },
];

/**
 * Pick one, the same one every time for the same receipt.
 *
 * A receipt is a record. Somebody who downloads theirs twice, or prints it
 * after emailing it, must get the same document both times — so the choice is
 * derived from the donation's own id rather than from chance or from the
 * clock.
 */
export function narrationFor(id: string): Narration {
  let sum = 0;
  for (let i = 0; i < id.length; i++) sum = (sum * 31 + id.charCodeAt(i)) >>> 0;
  return CHARITY_NARRATIONS[sum % CHARITY_NARRATIONS.length];
}
