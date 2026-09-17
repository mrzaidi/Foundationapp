/**
 * What the member portal actually does, written down.
 *
 * The admin assistant has system-guide.ts for the same reason: a language
 * model asked how a piece of software works will describe a plausible version
 * of it, confidently, including buttons that do not exist. Handing it the real
 * description and forbidding anything outside it is the only way an answer can
 * be trusted.
 *
 * This one is read by members, not staff, so it is deliberately narrower: it
 * describes what a member can see and do and says nothing about budgets,
 * donors, other members or how decisions are made inside the office.
 *
 * Keep it true. If the portal changes, this changes in the same commit.
 */

export const MEMBER_GUIDE = `
THE MOHAMMAD HUSNAIN FOUNDATION MEMBER PORTAL

WHAT IT IS
A phone-shaped web application where a member of the foundation applies for
help from a fund, and follows what happens to that application. It works in a
phone browser and can be installed to the home screen. It is available in
English and Urdu; the language is switched with the EN/اردو toggle.

SIGNING IN
A member signs in with their email address and password at the sign-in screen.
Accounts are created either by the member registering, or by an administrator
at the foundation office, who hands over the password in person. There is no
self-service password reset in the portal — a member who has lost their
password contacts the office.

THE FOUR SCREENS
The bar along the bottom has four places:
- Home: the funds available to apply to, and a short summary of the member's
  own applications.
- Requests: every application the member has made, newest first, each with its
  reference and current status. Opening one shows its full history.
- Help: how the process works, what to have ready before applying, and the
  foundation's helpline and office email.
- Profile: the member's own details, their bank details, and their family
  details.
The round "+" button in the middle of that bar starts a new application from
any screen.

BANK DETAILS COME FIRST
Before a member can apply for anything, three bank details must be on file:
the bank name, the account title, and the account number. This is where an
approved grant is transferred. If they are missing, the application flow stops
and asks for them first, and they are also editable at any time on the Profile
screen. Nothing can be applied for until they are saved.

MAKING AN APPLICATION
1. Choose a fund. Each fund has its own purpose, its own smallest and largest
   amount, and some require a supporting document.
2. Enter the amount. It must be at least the fund's minimum, and no more than
   its maximum where the fund sets one.
3. Give a reason, in a sentence or two. This is optional but it is read by the
   committee, and an application that explains itself is easier to approve.
4. Attach documents. A photo of a bill, a medical report, a fee voucher —
   whatever the fund asks for. Some funds will not accept an application
   without one. Up to 8 files, each no larger than 10 MB. Photographs taken
   with the phone camera are fine.
5. Submit. The application is given a reference like SHF-26-01001. That
   reference identifies it in every later conversation with the office.

WHAT THE STATUSES MEAN
- Requested: submitted and waiting to be looked at. Nothing is wrong; it is in
  the queue.
- Under review: the committee is considering it. They may be checking the
  documents or the circumstances.
- Approved: the committee has agreed to it, and the amount is settled. The
  money has not moved yet.
- Transferred: the money has been sent, either by bank transfer or handed over
  in cash. A receipt is issued and is attached to the application.
- Rejected: it could not be approved this time. The reason the committee gave
  is shown on the application. A member is welcome to apply again.
An application moves forward only when a member of staff moves it. There is no
fixed number of days, and the portal does not promise one.

EMAILS
The foundation sends an email when an account is created, when an application
is approved or rejected, and when money is transferred. The transfer email
carries the receipt as a PDF attachment. Emails go to the address the member
signs in with, so that address must be one they actually read.

ATTACHING SOMETHING LATER
Documents can be added to an application after it has been submitted, for
example when the office asks for a bill that was missed. They are filed
against the same application and the committee sees them alongside the rest.

RECEIPTS
When an application reaches Transferred, the foundation issues a receipt
recording the reference, the fund, the amount, how it was paid and the date.
It is attached to the application and is also emailed. A member keeps it as
their record of what was received.

MONTHLY FUNDS
Some funds are monthly rather than one-off. When an application to one of them
is approved, the member is enrolled and the application for the following
months is raised automatically, at the same amount, without the member having
to apply again. It still goes through the same approval each month.

PROFILE AND FAMILY DETAILS
A member can correct their own name, age, city, mobile number and bank
details. Family details — dependants and household circumstances — are also
recorded here, and the committee reads them when weighing an application. An
email address cannot be changed by the member; the office changes it.

WHAT A MEMBER CANNOT SEE
The foundation's budget, who donates and how much, other members, and other
members' applications. A member sees only their own record.

GETTING HELP FROM A PERSON
The Help screen carries the foundation's helpline number and office email
address. Anything the portal cannot settle — a lost password, a changed email
address, a question about a decision — is settled by the office.
`.trim();
