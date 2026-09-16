import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { LOGO_PNG_BASE64 } from './invoice-logo';

/**
 * The payment receipt handed to a member after a grant is transferred.
 *
 * Kept apart from the route so the document can be built and inspected without
 * an HTTP request or a signed-in session — a receipt is a record the
 * foundation issues in its own name, and "it renders" is not something to
 * discover in production.
 */

/** The name the foundation issues receipts under. */
export const FOUNDATION = 'Mohammad Husnain Foundation';

/* House colours, matched to the portal so a printed receipt looks like the app. */
const GREEN = rgb(0.043, 0.502, 0.357);
const GOLD = rgb(0.847, 0.686, 0.247);
const INK = rgb(0.106, 0.133, 0.149);
const DIM = rgb(0.42, 0.455, 0.478);
const RULE = rgb(0.886, 0.902, 0.91);

const A4 = { w: 595.28, h: 841.89 };
const MARGIN = 56;

const METHOD: Record<string, string> = { cash: 'Cash', bank: 'Bank transfer' };

/** Pakistan keeps one offset all year, so this is exact rather than close. */
const pkDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Karachi',
  });

const pkTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
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
    // Removing a word can strand the punctuation that joined it on.
    .replace(/\s+/g, ' ')
    .replace(/^[\s\-,;:]+|[\s\-,;:]+$/g, '')
    .trim();

export interface ReceiptData {
  reference: string;
  receiverName: string | null;
  receiverNumber: string | null;
  fundType: string | null;
  amount: number;
  paymentMethod: string | null | undefined;
  paidAt: string;
  transferRef: string | null;
}

export async function buildReceipt(d: ReceiptData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Payment receipt ${d.reference}`);
  pdf.setAuthor(FOUNDATION);
  pdf.setSubject(`Grant paid to ${safe(d.receiverName)}`);
  pdf.setProducer(FOUNDATION);

  const page = pdf.addPage([A4.w, A4.h]);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const body = await pdf.embedFont(StandardFonts.Helvetica);
  const logo = await pdf.embedPng(Buffer.from(LOGO_PNG_BASE64, 'base64'));

  /* ---- header band ---- */
  const bandH = 116;
  page.drawRectangle({ x: 0, y: A4.h - bandH, width: A4.w, height: bandH, color: GREEN });
  // A thin gold rule under the band, the same accent the portal uses.
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

  page.drawText('PAYMENT RECEIPT', { x: MARGIN, y, size: 15, font: bold, color: INK });

  const refLabel = `Receipt no. ${safe(d.reference)}`;
  page.drawText(refLabel, {
    x: A4.w - MARGIN - body.widthOfTextAtSize(refLabel, 10),
    y: y + 2,
    size: 10,
    font: body,
    color: DIM,
  });

  y -= 30;
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: A4.w - MARGIN, y },
    thickness: 1,
    color: RULE,
  });

  /* ---- the details ---- */
  y -= 34;

  const rows: [string, string][] = [
    ['Receiver name', safe(d.receiverName) || '-'],
    ['Receiver number', safe(d.receiverNumber) || '-'],
    ['Fund type', safe(d.fundType) || '-'],
    ['Payment type', d.paymentMethod ? METHOD[d.paymentMethod] : 'Not recorded'],
    ['Payment date', `${pkDate(d.paidAt)} at ${pkTime(d.paidAt)} PKT`],
  ];

  // A bank transfer has a reference worth quoting; cash in hand does not.
  if (d.transferRef) rows.push(['Transfer reference', safe(d.transferRef)]);

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

  page.drawText('TOTAL TRANSFERRED AMOUNT', {
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

  y -= boxH + 46;

  /* ---- signature, because a paper receipt gets signed ---- */
  const sigW = 190;
  page.drawLine({
    start: { x: A4.w - MARGIN - sigW, y },
    end: { x: A4.w - MARGIN, y },
    thickness: 0.75,
    color: DIM,
  });
  page.drawText('Authorised signature', {
    x: A4.w - MARGIN - sigW,
    y: y - 13,
    size: 9,
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
    'This receipt confirms a welfare grant paid by the foundation. Keep it for your records.',
    { x: MARGIN, y: 40, size: 8.5, font: body, color: DIM }
  );

  return pdf.save();
}
