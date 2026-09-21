import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { LOGO_PNG_BASE64 } from './invoice-logo';
import { FOUNDATION } from './invoice-pdf';
import { narrationFor } from './charity-narrations';
import { DONATION_LABEL, asDonationType } from './donation-types';

/**
 * The receipt a donor is given for what they gave.
 *
 * Deliberately not the same document as the grant receipt, though it shares
 * the house style. That one is an accounting record of money leaving; this is
 * a thank-you that happens to also be a record. A donor keeps it, and for
 * Khums or Zakat may well need it — so it states the kind of giving as plainly
 * as it states the amount.
 *
 * Kept apart from the route so it can be built and inspected without an HTTP
 * request or a signed-in session.
 */

/* House colours, matched to the portal so a printed receipt looks like the app. */
const GREEN = rgb(0.043, 0.502, 0.357);
const GOLD = rgb(0.847, 0.686, 0.247);
const INK = rgb(0.106, 0.133, 0.149);
const DIM = rgb(0.42, 0.455, 0.478);
const RULE = rgb(0.886, 0.902, 0.91);

const A4 = { w: 595.28, h: 841.89 };
const MARGIN = 56;

/** Pakistan keeps one offset all year, so this is exact rather than close. */
const pkDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Karachi',
  });

/**
 * WinAnsi cannot encode what a Pakistani name may well contain — an Urdu
 * spelling, or a curly apostrophe pasted out of Word. pdf-lib throws on those
 * rather than dropping them, which would fail an entire receipt over one
 * character, so anything unencodable is replaced before it reaches the page.
 */
const safe = (s: string | null | undefined) =>
  (s ?? '')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s\-,;:]+|[\s\-,;:]+$/g, '')
    .trim();

/**
 * A reference a donor can quote on the telephone.
 *
 * Built from the donation's own id rather than a counter, because a counter
 * would need a column, a sequence and a migration to produce a number that is
 * no more useful than this one.
 */
export const donationReference = (id: string, receivedOn: string) =>
  `DON-${new Date(receivedOn).getFullYear().toString().slice(2)}-${id.replace(/-/g, '').slice(0, 6).toUpperCase()}`;

export interface DonationReceiptData {
  id: string;
  donorName: string | null;
  donorContact: string | null;
  amount: number;
  donationType: string | null;
  receivedOn: string;
  /** The month the gift counts toward, which is not always the day it arrived. */
  month: string;
  note: string | null;
}

/** Wrap a sentence to a width, in the font it will actually be drawn in. */
function wrapText(
  text: string,
  font: { widthOfTextAtSize: (s: string, size: number) => number },
  size: number,
  maxWidth: number
): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';

  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export async function buildDonationReceipt(d: DonationReceiptData): Promise<Uint8Array> {
  const reference = donationReference(d.id, d.receivedOn);
  const kind = DONATION_LABEL[asDonationType(d.donationType)];
  const donor = safe(d.donorName) || 'A donor';

  const pdf = await PDFDocument.create();
  pdf.setTitle(`Donation receipt ${reference}`);
  pdf.setAuthor(FOUNDATION);
  pdf.setSubject(`${kind} received from ${donor}`);
  pdf.setProducer(FOUNDATION);

  const page = pdf.addPage([A4.w, A4.h]);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const body = await pdf.embedFont(StandardFonts.Helvetica);
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);
  const logo = await pdf.embedPng(Buffer.from(LOGO_PNG_BASE64, 'base64'));

  /* ---- header band ---- */
  const bandH = 116;
  page.drawRectangle({ x: 0, y: A4.h - bandH, width: A4.w, height: bandH, color: GREEN });
  page.drawRectangle({ x: 0, y: A4.h - bandH - 3, width: A4.w, height: 3, color: GOLD });

  const logoSize = 56;
  page.drawImage(logo, {
    x: MARGIN,
    y: A4.h - bandH + (bandH - logoSize) / 2,
    width: logoSize,
    height: logoSize,
  });

  page.drawText(FOUNDATION, {
    x: MARGIN + logoSize + 18,
    y: A4.h - 58,
    size: 19,
    font: bold,
    color: rgb(1, 1, 1),
  });
  page.drawText('WELFARE  •  RELIEF  •  DIGNITY', {
    x: MARGIN + logoSize + 18,
    y: A4.h - 76,
    size: 8.5,
    font: body,
    color: rgb(0.85, 0.93, 0.89),
  });

  /* ---- title row ---- */
  let y = A4.h - bandH - 56;

  page.drawText('DONATION RECEIPT', { x: MARGIN, y, size: 15, font: bold, color: INK });

  const refLabel = `Receipt no. ${reference}`;
  page.drawText(refLabel, {
    x: A4.w - MARGIN - body.widthOfTextAtSize(refLabel, 10),
    y: y + 2,
    size: 10,
    font: body,
    color: DIM,
  });

  y -= 30;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: A4.w - MARGIN, y }, thickness: 1, color: RULE });

  /* ---- the details ---- */
  y -= 34;

  const monthLabel = new Date(`${d.month}T00:00:00Z`).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

  const rows: [string, string][] = [
    ['Donor', donor],
    ['Contact', safe(d.donorContact) || '-'],
    ['Kind of donation', kind],
    ['Received on', pkDate(d.receivedOn)],
    ['Counted toward', monthLabel],
  ];
  if (d.note) rows.push(['Note', safe(d.note)]);

  for (const [label, value] of rows) {
    page.drawText(label, { x: MARGIN, y, size: 10, font: body, color: DIM });
    page.drawText(value, { x: MARGIN + 170, y, size: 11, font: bold, color: INK });
    y -= 17;
    page.drawLine({
      start: { x: MARGIN, y: y + 5 },
      end: { x: A4.w - MARGIN, y: y + 5 },
      thickness: 0.5,
      color: RULE,
    });
    y -= 15;
  }

  /* ---- the amount, given its own weight ---- */
  y -= 14;
  const boxH = 72;
  page.drawRectangle({
    x: MARGIN,
    y: y - boxH,
    width: A4.w - MARGIN * 2,
    height: boxH,
    color: rgb(0.953, 0.976, 0.965),
    borderColor: GREEN,
    borderWidth: 1,
  });

  page.drawText(`TOTAL ${kind.toUpperCase()} RECEIVED`, {
    x: MARGIN + 20,
    y: y - 28,
    size: 9,
    font: body,
    color: DIM,
  });
  page.drawText(`PKR ${d.amount.toLocaleString('en-GB')}`, {
    x: MARGIN + 20,
    y: y - 56,
    size: 25,
    font: bold,
    color: GREEN,
  });

  y -= boxH + 44;

  /* ---- the thank you ---- */
  page.drawText('Thank you', { x: MARGIN, y, size: 13, font: bold, color: INK });
  y -= 20;

  const thanks =
    `${donor.split(' ')[0]}, the foundation has received your ${kind.toLowerCase()} and is grateful for it. ` +
    'What you have given goes to families in this community — a bill cleared, a fee paid, ' +
    'a month of groceries, medicine after an accident. Every rupee is accounted for and ' +
    'nothing is spent outside the purpose it was given for.';

  for (const line of wrapText(thanks, body, 10.5, A4.w - MARGIN * 2)) {
    page.drawText(line, { x: MARGIN, y, size: 10.5, font: body, color: INK });
    y -= 15;
  }

  /* ---- the narration ----
     Set apart on its own, against a gold rule rather than the brand green, so
     it reads as something quoted rather than as more of the foundation's own
     text. */
  y -= 22;
  const narration = narrationFor(d.id);
  const quoteLines = wrapText(`"${narration.text}"`, italic, 12, A4.w - MARGIN * 2 - 26);
  const quoteH = quoteLines.length * 17 + 34;

  page.drawRectangle({ x: MARGIN, y: y - quoteH + 14, width: 3, height: quoteH, color: GOLD });

  let qy = y;
  for (const line of quoteLines) {
    page.drawText(line, { x: MARGIN + 18, y: qy, size: 12, font: italic, color: INK });
    qy -= 17;
  }

  qy -= 4;
  page.drawText(`— ${safe(narration.said)}`, {
    x: MARGIN + 18,
    y: qy,
    size: 9.5,
    font: bold,
    color: GREEN,
  });
  qy -= 13;
  page.drawText(safe(narration.source), {
    x: MARGIN + 18,
    y: qy,
    size: 8.5,
    font: body,
    color: DIM,
  });

  /* ---- footer ---- */
  page.drawText(`Issued ${pkDate(new Date().toISOString())} • ${FOUNDATION}`, {
    x: MARGIN,
    y: 54,
    size: 8.5,
    font: body,
    color: DIM,
  });
  page.drawText(
    'This receipt confirms a donation received by the foundation. Please keep it for your records.',
    { x: MARGIN, y: 40, size: 8.5, font: body, color: DIM }
  );

  return pdf.save();
}
