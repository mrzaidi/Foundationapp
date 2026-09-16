/**
 * How this foundation's system actually works, written down.
 *
 * The assistant answers questions about figures from the database. This is for
 * the other kind of question — "what happens when I reject an application?",
 * "who can see the donor list?", "why can't I transfer more than the fund?" —
 * which no query can answer because the answer is about the software.
 *
 * A language model asked those without this would describe a plausible welfare
 * portal rather than yours, and sound equally confident either way. So it is
 * given this and told to answer only from it.
 *
 * Keep it true. Everything here is a fact about the deployed system, and when
 * the system changes this has to change with it — a stale description is worse
 * than none, because it is believed.
 */

export const SYSTEM_GUIDE = `
THE FOUNDATION
The Mohammad Husnain Foundation collects donations from members and pays
grants to members who apply for them. Everything runs on Pakistan time
(Asia/Karachi), and all amounts are Pakistani rupees.

MEMBERS
People register themselves in the member app, or an administrator adds them
from Members > Add member. An administrator sets the password and hands it
over in person, because many members have no email of their own.
A member cannot apply for a fund until their bank details are on file. The
database refuses the application otherwise.

FUNDS
There are several fund types — Monthly, Accidental, Grocery, Electricity Bill,
School Fees. Each has a minimum and maximum amount, and can require a document.
A Master Admin edits them under Funds. Approving a Monthly Fund application
enrols that member for an automatic monthly application.

APPLYING
A member picks a fund, gives an amount and a reason, and attaches documents.
Each application gets a reference like SHF-26-01001.

THE PIPELINE
An application moves: requested -> review -> accepted -> transferred.
It can be rejected at any point, and a rejection requires a reason, which the
member is shown.
Only a Master Admin can approve, reject or transfer.
The requested amount can be corrected by a Master Admin until the money moves,
for cases where it was typed wrongly at the office.

MONEY IN
The month's fund is the donations recorded against that month. Nothing else
adds to it. It cannot be typed in — the only way it goes up is a donor
actually giving. Donors are members; recording a donation from someone adds
them to the donor list automatically.

MONEY OUT
A transfer cannot exceed what is left in the month's fund. The database itself
refuses it, not just the screen. When a transfer is recorded, the
administrator says whether it was cash or a bank transfer, and may attach a
receipt image. A PDF receipt can then be generated for the member.

WHO CAN SEE WHAT
Master Admin: everything, and the only level that can approve, transfer, or
change what someone is.
Admin 1: member records and report exports. No budget, no donors, no
applications.
Admin 2: member records and the month's budget totals. No donor details, no
exports, no applications.
Every administrator sees the same dashboard.
These limits are enforced by the database as well as the interface, so they
hold even if somebody calls the API directly.

EMAILS
Members are emailed automatically when an application is approved, when it is
rejected, and when money is transferred. The transfer email carries the PDF
receipt. Nothing else is emailed.

THE ASSISTANT
It answers questions about the foundation's own figures, read live from the
database. It can also make changes — record a donation, approve or reject an
application, block a member, add a member — but it always shows what it is
about to do and waits for Confirm. It never changes anything on its own.
`.trim();
