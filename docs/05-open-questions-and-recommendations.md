# Gaps, Risks & Questions to Take Back to the Client

This document exists because the brief, as described, would have produced a good-looking app that
quietly breaks this business within six months. Below are the things that were **not** mentioned in
the meeting but that matter, grouped by how badly they hurt if ignored.

Take the **A-list** to the client before writing code. The **B-list** can be decided during
Phases 1–3. The **C-list** is nice-to-have.

---

## A. Things that will break the business if we skip them

### A1. Empty bottle tracking is not optional — it is half the business
The brief only mentioned bottles *going out*. In this business the bottles come back, and they are
the owner's most valuable movable asset. A 19 L bottle costs roughly Rs 300–500. A plant with 400
customers holding 2–3 bottles each has Rs 300,000–600,000 of inventory sitting in other people's
kitchens.

Without tracking returns, the owner cannot tell that a customer who left last year still has 4
bottles, or that a driver is "losing" 5 bottles a month. This is designed in from Phase 2
(`empties_collected`) and Phase 7 (the bottles-out recovery list).

**Ask the client:**
- How many bottles does he own in total right now?
- Does he take a **security deposit** per bottle? How much? Is it refundable?
- What does he do today when a customer breaks or loses a bottle?

### A2. Partial payments and running balances
The brief says "at month end he calculates the total and sends the bill". Real customers pay
Rs 2,000 against a Rs 3,500 bill, pay for two months together, or pay in advance. If the app only
stores "this month's bill", the numbers stop matching reality in month two.

That is why the design uses a **customer ledger** (Phase 3) rather than standalone invoices, and
why every invoice carries the previous balance forward.

**Ask the client:** how does he currently track who has paid and who hasn't?

### A3. Rates change, and old bills must not change with them
When he raises the rate from Rs 60 to Rs 70, every invoice already printed must still show Rs 60.
Handled by dated `customer_rates` rows and by snapshotting the rate onto each delivery. Do not let
anyone "simplify" this into a single rate column on the customer.

**Ask the client:** do all customers pay the same rate, or do commercial customers/bulk buyers get
different rates? Does he ever give a discount?

### A4. Deposits and employee advances are not income and not expenses
- A **security deposit** received is cash in, but it is money he owes back. If it is counted as
  revenue, his profit is inflated and he will make bad decisions.
- An **employee advance** is cash out, but it is not a new expense — it is next month's salary paid
  early. If it is counted as an expense *and* the full salary is counted again at month end, his
  costs are double-counted.

Both are explicitly handled (Phase 3 §3.3, Phase 6 §6.5) with unit tests. This is the single most
common way small business apps produce wrong profit numbers.

### A5. Data loss risk is concentrated on one laptop
One file, one machine, no server. Realistic threats: laptop stolen, hard disk fails, ransomware,
laptop spilled on, Windows reinstall by a shop.

The plan (Phase 9) covers scheduled zipped backups, a second destination and a tested restore. But
somebody must actually **configure the second destination** on the client's machine.

**Ask the client:**
- Does he have a spare USB drive or external hard disk?
- Does he have Google Drive or OneDrive installed, or a reliable internet connection?
- Would he accept a small monthly cost for automatic cloud backup?

Also decide: what happens if his laptop dies at 11 pm on the 31st? The handover doc must answer it.

### A6. Migration from paper on day one
The app is useless until his existing 200–500 customers are inside it, with the right opening
balance and the right number of bottles already with them. If this is not planned, "go live" turns
into three weeks of chaos and the client blames the software.

**Plan for it explicitly:** Phase 1 includes CSV import and opening balances. Budget 2–5 days of
data entry, ideally starting on the 1st of a month, and run paper + app in parallel for one month.

**Ask the client:** how many active customers does he have? Are their details written anywhere he
can hand over (a register, a phone contact list, a notebook)?

### A7. Who actually types the data, and when? — **ANSWERED**
**Confirmed: the owner enters everything himself, each evening, from the drivers' paper slips.**

This is the single biggest risk to adoption. If entering a day's deliveries takes him 20 minutes,
he will stop using the app within a month and go back to paper. Consequences now baked into the
plan:

- The daily entry screen (Phase 2) gets a hard performance target: **100 customers in under
  4 minutes, keyboard only, no mouse.** Phase 2 must measure this with a stopwatch and record the
  result in `PROGRESS.md`. If it misses, Phase 2 is not done.
- Route ordering, "copy from previous delivery day", and schedule-based pre-fill are not
  nice-to-haves — they are what make the target achievable.
- A future phone app for the drivers would remove this burden entirely. Out of scope for v1, but
  the data model is designed so it can be added.

**Also confirmed: single plant, single laptop.** No `branch_id`, no multi-machine sync.

> **Hard limitation to state in writing:** a local SQLite file is single-machine. Two people can use
> it on the same laptop with separate logins, but not on two laptops. Putting the file in a shared
> Dropbox/Drive folder to "share" it **will corrupt the database** — do not let anyone try it.
> If he later hires a clerk who needs their own machine, that is a v2 architecture change
> (a small local server or a hosted database), not a setting.

> **Hard limitation to state in writing:** a local SQLite file is single-machine. Two people can use
> it on the same laptop with separate logins, but not on two laptops. Putting the file in a shared
> Dropbox/Drive folder to "share" it **will corrupt the database** — do not let anyone try it.

---

## B. Decisions needed during Phases 1–3

### B1. What exactly does he sell besides 19 L bottles?
Most water plants also sell: 6 L / 1.5 L packs, water dispensers/coolers (sold or rented), bulk
tanker water. The schema supports a `products` table and rental charges, but the UI is being built
around the single default 19 L bottle.

**Ask:** does he sell anything else today? Does he rent out dispensers for a monthly fee?

### B2. Fixed monthly package customers
Some customers pay a flat monthly amount regardless of consumption. Supported as `monthly_package`
with an included quantity and an excess rate.

**Ask:** does he have any such customers? What are the packages?

### B3. Delivery charges and distance
**Ask:** is the rate inclusive of delivery, or does he charge extra for far-off areas or for
single-bottle deliveries?

### B4. Billing cycle
The brief says monthly. **Ask:**
- Does the month always run 1st to end of month, or from the customer's joining date?
- Are all bills raised on the same day, or a few customers on different cycles?
- Do commercial customers get 15-day or weekly billing?
- What is the payment due date, and does he charge anything for late payment?

### B5. How does he want to send the bill?
See §WhatsApp below. **Ask:** does he currently hand a paper bill to the customer through the
driver, send a photo on WhatsApp, or both? Does he want a printed bill the driver carries?

### B6. Cash flow through drivers
Drivers usually collect cash. **Ask:**
- Do drivers collect payments, or does the customer pay the owner directly?
- Does the driver hand over cash daily? Who counts it?
- Has he had shortfalls? (If yes, the Phase 7 trip reconciliation becomes a top priority, not an
  optional feature.)

### B7. Salary details
**Ask:**
- Fixed monthly salary, daily wage, or per-bottle commission? Any mix?
- Is salary deducted for absences? On a 26-day or 30-day basis?
- Overtime? Bonuses (Eid bonus is common)?
- Any statutory deductions (EOBI, social security)? Usually not for small plants, but confirm.

### B8. Which expenses does he actually incur?
The seeded category list is a guess. **Ask him to list a month of real expenses** so the categories
match his mental model. Getting this right makes the P&L feel trustworthy on day one.

### B9. Tax and documentation
**Ask:** is he registered for sales tax / NTN? Does any customer (offices, companies) demand a
proper tax invoice with an NTN? This is off by default but the schema supports it.

### B10. Number of customers and growth
Sizing decisions (grid design, report performance) depend on it. **Ask:** how many customers now,
and how many does he expect in two years?

---

## C. Worth mentioning, decide later

- **SMS / WhatsApp payment reminders** — needs internet and a paid gateway; can be added as a
  simple "copy message, open chat" flow at zero cost.
- **Customer-facing view** — a monthly PDF statement covers 95% of this.
- ~~**Multiple plants / branches**~~ — **decided: no.** Single plant. No `branch_id` anywhere.
  Revisit only as a v2 migration if he actually opens a second plant.
- **Vehicle fuel logs and mileage** — partly covered by attributing expenses to vehicles.
- **Water quality / TDS test logs** — some plants must keep records for regulators.
- **Empty bottle wash/production batch records** — Phase 7 has a light version.
- **Loyalty or referral discounts.**
- **Barcode/QR on each bottle** — solves bottle loss precisely but needs scanners and discipline;
  almost certainly overkill.
- **Dark mode, Urdu UI** — Urdu is a real possibility if a clerk uses the app; the i18n scaffolding
  is in place from Phase 0.

---

## WhatsApp: what is actually possible

The client will ask for "send the bill on WhatsApp automatically". Be honest about the options:

| Option | Cost | Effort | Risk | Verdict |
|---|---|---|---|---|
| Open a WhatsApp chat with a pre-filled message; user attaches the PDF (2 clicks) | Free | Low | None | **Recommended for v1** (Phase 4) |
| Send the bill **summary as text** automatically via a chat link, PDF only on request | Free | Low | None | Good companion |
| WhatsApp Business Cloud API (official) | Per-message fee, needs a verified business, internet, and pre-approved message templates | Medium-high | Approval process | Only if he really wants it and will pay |
| Unofficial automation libraries (`whatsapp-web.js`, Baileys) | Free | Medium | **His number can be banned by WhatsApp** | Do not use without written acceptance of the risk |

Recommendation: ship option 1, and revisit the official API after a few months of real use.

---

## Risks to state in the proposal

| Risk | Impact | Mitigation |
|---|---|---|
| Client keeps using paper in parallel forever | App never becomes the source of truth | Set a go-live date; run parallel for exactly one month; train him personally |
| Data entry burden is higher than expected | Abandonment | Optimise the daily entry screen ruthlessly; measure how long entering 100 customers takes and report it |
| Laptop dies, backups were never configured | Total data loss, reputation damage | Configure a second backup destination during handover and verify a restore in front of him |
| Scope creep after he sees it working | Timeline blows out | Phase list is the contract; new requests go to a v2 list |
| Requirements discovered mid-build (e.g. dispenser rentals) | Rework | Ask the A- and B-list questions **before** Phase 1 |
| Single-machine limitation discovered late | Angry client | State it in writing in the proposal |
| Wrong profit numbers due to deposits/advances | Loss of trust in the whole app | Already designed for; unit tests are mandatory |

---

## Suggested go-live sequence

1. Phases 0–4 complete → **soft launch**. He can record deliveries and produce bills. This alone
   replaces the paper card and is worth paying for.
2. Run one month in parallel with paper. Compare the app's month-end totals against his manual
   ones, customer by customer. Fix discrepancies.
3. Phases 5–6 → expenses and payroll. Now he sees costs.
4. Phase 7 → bottle and cash reconciliation. Now he sees leakage.
5. Phase 8 → reports and profit. This is the "wow" moment; save it for when the data is real.
6. Phase 9 → hardening, backups, installer, training, handover.

Deliver a build to the client after every phase from 2 onwards. Feedback from real use will change
Phases 5–9 more than any document can predict.
