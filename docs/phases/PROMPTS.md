# Copy-Paste Agent Prompts

One prompt per phase, plus the utility prompts you need between phases. Each is self-contained:
open a **fresh agent context**, paste the prompt, let it run.

## How to use this file

1. Start a new agent context (new chat) for each phase. Do not continue a previous one.
2. Paste the phase prompt exactly as written.
3. When the agent finishes, run the **Phase Review** prompt (§R1) in *another* fresh context before
   moving on. An independent reviewer catches what the builder rationalised away.
4. Fix anything it finds with §R2, then move to the next phase.

Why the prompts repeat the same six rules inline even though they are in the docs: agents skim.
The rules that cost money if broken are worth the duplication.

**Do not reorder the phases.** Each one assumes the previous exists. The only flexible choice is
stopping after Phase 4 to get client feedback before continuing.

---

## P0 — Foundation

```text
You are implementing Phase 0 of the Aqua Nuqi project, an offline Electron + SQLite
desktop app for a water-bottle delivery business in Pakistan.

Read these files completely, in this order, before writing any code:
1. docs/phases/AGENT-BRIEF.md
2. docs/00-project-overview.md
3. docs/02-architecture-and-stack.md
4. docs/03-data-model.md  (section A: system and settings; skim the rest for context)
5. docs/04-ui-ux-guidelines.md
6. docs/07-data-lifecycle-and-upgrades.md  (all of it - section 4 is mandatory)
7. docs/phases/phase-00-foundation.md

Then implement Phase 0 completely and exactly as specified.

This phase builds no business features. It builds the platform every later phase
depends on: the Electron scaffold, SQLite with Drizzle migrations, the typed IPC
layer, auth and roles, settings, the audit service, the period lock, a minimal
backup service, the app shell UI, the first-run wizard, and a working Windows
installer.

Non-negotiable rules:
- Money is an integer in paisa. Rs 60.00 is 6000. Never a float, never a string.
- Business dates are TEXT in YYYY-MM-DD. Never a JS Date object in the database.
- Nothing is ever hard-deleted. Soft deletes and voids only.
- Every schema change is a committed Drizzle migration. Never edit the DB by hand.
- Every IPC channel needs a Zod contract in src/shared/contracts and a role restriction.
- Business logic lives in src/main/services with no Electron imports, and is unit-tested.
- The database must resolve under app.getPath('userData'), never inside the install
  directory. appId, productName and the package.json name are frozen constants.
- The first-run wizard must offer "Restore from a backup" as well as "Set up a new
  business". This is how the client moves to a new laptop; it is not optional.

Do not use any library that is not listed in docs/02-architecture-and-stack.md
section 1. If you believe one is genuinely needed, implement the closest compliant
alternative and record the concern in PROGRESS.md under "Escalations".

Do not begin any work belonging to Phase 0B or later.

When finished:
- Verify every acceptance criterion in the phase file yourself, by running the app.
- Run: npm run typecheck && npm run lint && npm run test && npm run build
- All four must pass with zero errors.
- Append your entry to docs/phases/PROGRESS.md using the template in that file. The
  "What the next phase must know" section is the most important thing you will write -
  include the exact defineHandler signature, the AppError code list, the settings
  accessor API, and the audit helper signature.
- Add a line to docs/CHANGELOG.md.
```

---

## P0B — CI/CD & releases

```text
You are implementing Phase 0B of the Aqua Nuqi project. Phase 0 is complete.

Read these files completely, in this order, before writing any code:
1. docs/phases/AGENT-BRIEF.md
2. docs/00-project-overview.md
3. docs/02-architecture-and-stack.md
4. docs/07-data-lifecycle-and-upgrades.md  (all of it)
5. docs/phases/PROGRESS.md
6. docs/phases/phase-00b-ci-cd-and-releases.md

Then implement Phase 0B completely and exactly as specified.

Goal: every push to main automatically builds a Windows .exe and an Ubuntu
.AppImage + .deb, publishes them to GitHub Releases behind permanent download links,
and never ships a build that fails typecheck, lint or tests.

The phase file contains the full electron-builder configuration and the full GitHub
Actions workflow. Use them as written - they are adapted from a pipeline already
proven in this developer's MA Traders project. The table in section 0B.2 explains why
each difference from that pipeline exists; do not undo those changes.

Critical correctness points:
- Fixed artifact names (Aqua-Nuqi-Setup.exe, Aqua-Nuqi.AppImage) are what make the
  permanent /releases/latest/download/ links work. Do not include the version in the
  file name.
- Pushes publish as pre-release (dev channel). Only a manual stable run moves the
  client's download link.
- Upload latest.yml, latest-linux.yml and the blockmaps so Phase 9 can enable
  electron-updater without changing this pipeline.
- deleteAppDataOnUninstall is one-click-installer-only and we use the assisted
  installer, so it is inert. Do not rely on it. The real protections are the automated
  tests in section 0B.4.

Also produce:
- scripts/release-notes.mjs (no dependencies)
- docs/CLIENT-INSTALL-GUIDE.md - one page, non-technical, sendable over WhatsApp
- A .gitignore that excludes node_modules, out, dist, release, *.db, *.sqlite*, data/,
  .env*, logs, attachments and backups. Never commit a database file.

When finished:
- Verify every acceptance criterion in the phase file.
- Run: npm run typecheck && npm run lint && npm run test && npm run build
- Trigger a real build and confirm both installers appear on a GitHub Release.
- Append to docs/phases/PROGRESS.md: the repository URL, both permanent download
  links, and the versioning scheme actually used.
- Add a line to docs/CHANGELOG.md.
```

---

## P1 — Customers & master data

```text
You are implementing Phase 1 of the Aqua Nuqi project. Phases 0 and 0B are complete.

Read these files completely, in this order, before writing any code:
1. docs/phases/AGENT-BRIEF.md
2. docs/00-project-overview.md
3. docs/02-architecture-and-stack.md
4. docs/03-data-model.md  (sections A, B, C and J)
5. docs/04-ui-ux-guidelines.md
6. docs/phases/PROGRESS.md
7. docs/phases/phase-01-customers-and-master-data.md

Then implement Phase 1 completely and exactly as specified.

Goal: the owner can put his entire customer book into the app - areas, routes,
products, customers, per-customer rates with history, opening balances and opening
bottle counts - so Phase 2 can record deliveries against real data.

The single most important design point in this phase: rates are dated. Changing a
customer's rate closes the current customer_rates row and inserts a new one. It never
updates a rate in place. Every other module prices deliveries through one function,
rateService.getRateFor(customerId, productId, onDate). An invoice printed in July must
still print identically in December after a price rise. Do not "simplify" this into a
single rate column on the customer.

Non-negotiable rules (repeated because they cost money if broken):
- Money is an integer in paisa. Rs 60.00 is 6000.
- Business dates are TEXT in YYYY-MM-DD.
- Nothing is hard-deleted. Soft deletes and voids only.
- Every mutation writes an audit entry and respects the period lock.
- Every IPC channel needs a Zod contract and a role restriction.

Also required in this phase:
- A CSV/Excel import with a column-mapping step, a validation preview that reports
  errors by row number, and an all-or-nothing transactional import. The client has
  200-500 customers on paper and this is how they get in.
- customer_balances as a materialised summary table, plus a recalculate function, plus
  a unit test asserting the summary always equals the live aggregate.
- A dev-only seed generating around 200 realistic customers across 6 areas and 10
  routes, so the next phase can test performance.

Do not begin any Phase 2 work: no deliveries, no invoices, no payments beyond the
opening-balance ledger entry.

When finished:
- Verify every acceptance criterion in the phase file, especially the rate-history
  ones (criteria 3 and 4).
- Run: npm run typecheck && npm run lint && npm run test && npm run build
- Append to docs/phases/PROGRESS.md: the rateService.getRateFor signature, whether
  ledger_entries was created in this phase, how customer_balances is kept in sync, and
  the customer DTO shape.
- Bump the minor version in package.json, add a CHANGELOG line, and push.
```

---

## P2 — Delivery tracking

```text
You are implementing Phase 2 of the Aqua Nuqi project. Phases 0, 0B and 1 are complete.

Read these files completely, in this order, before writing any code:
1. docs/phases/AGENT-BRIEF.md
2. docs/00-project-overview.md
3. docs/02-architecture-and-stack.md
4. docs/03-data-model.md  (sections C, D and J)
5. docs/04-ui-ux-guidelines.md  (section 3 twice - it decides whether this phase works)
6. docs/phases/PROGRESS.md
7. docs/phases/phase-02-delivery-tracking.md

Then implement Phase 2 completely and exactly as specified.

This is the phase the entire product is judged on. It replaces the paper card the
owner uses today.

HARD PERFORMANCE TARGET: the business owner personally types every day's deliveries in
the evening from the drivers' paper slips. Entering 100 customers must take under 4
minutes, keyboard only, with no mouse contact at any point. Time this yourself against
the seeded dataset and record the measured number in PROGRESS.md. If it misses the
target, this phase is not complete - fix the interaction design, not the target. If
data entry is slow, he will go back to paper within a month and none of the remaining
phases will matter.

Build all three entry surfaces described in the phase file: the Daily Entry list, the
Month Matrix, and the per-customer Monthly Card. Autosave per cell with optimistic
updates. Arrow keys move, Enter saves and moves down, Tab moves right, Esc cancels.

Key business rules:
- At most one recorded delivery row per (customer, date, product). A second entry for
  the same day updates the same row. Enforced by a partial unique index.
- Empties collected default to the quantity delivered, but must be independently
  editable, including zero, and including quantity 0 with empties 5 (a customer
  returning bottles and stopping service).
- The rate is snapshotted from rateService.getRateFor at insert time. A later rate
  change must never alter the amount stored on an existing delivery.
- Setting a quantity to 0 voids the row; it is never deleted.
- Writes must fail with PERIOD_LOCKED in a closed month, and must be rejected if the
  delivery is already attached to an issued invoice.
- Maintain bottles_with_customer per the formula in docs/03-data-model.md section J.

Do NOT write stock_movements rows in this phase. Phase 7 adds them together with a
backfill for historical deliveries. Say so explicitly in PROGRESS.md.

Extend the dev seed with 3 to 6 months of realistic deliveries so month boundaries and
performance can be verified.

When finished:
- Verify every acceptance criterion, including the timed test.
- Run: npm run typecheck && npm run lint && npm run test && npm run build
- Append to docs/phases/PROGRESS.md: the delivery DTO, the getMonthGrid response
  shape, how invoice_id locking is enforced, the measured entry time, and confirmation
  that stock movements are deliberately deferred to Phase 7.
- Bump the minor version, add a CHANGELOG line, and push.
```

---

## P3 — Billing, ledger & payments

```text
You are implementing Phase 3 of the Aqua Nuqi project. Phases 0 through 2 are complete.

Read these files completely, in this order, before writing any code:
1. docs/phases/AGENT-BRIEF.md
2. docs/00-project-overview.md
3. docs/02-architecture-and-stack.md
4. docs/03-data-model.md  (sections C, D, E and J - read J carefully)
5. docs/04-ui-ux-guidelines.md
6. docs/phases/PROGRESS.md
7. docs/phases/phase-03-billing-ledger-and-payments.md

Then implement Phase 3 completely and exactly as specified.

Goal: turn recorded deliveries into money - monthly invoices, a correct running
account per customer, payment recording, and an actionable receivables view.

Accuracy matters more than features here. Every number on an invoice must be
reproducible months later.

Build the ledger service FIRST. Everything else sits on it. It is append-only:
corrections are new entries, never updates or deletes. Inserting a back-dated entry
recomputes balance_after for all later rows of that customer inside the same
transaction. Write the unit test described in section 3.2 (1,000 randomly ordered
entries including back-dated ones) before building anything on top.

Three accounting rules that are the most common way apps like this produce wrong
numbers. Implement all three and unit-test them:
1. A security deposit received is cash in, but it is money the business owes back.
   It is NOT revenue. It appears as its own invoice line, changes the ledger balance,
   and must never appear in revenue_accrual or revenue_cash.
2. When issuing an invoice, append a ledger entry for invoice_total only, never for
   total_payable. The opening balance is already in the ledger; adding it again
   double-counts it. This is the classic bug in this design.
3. Voiding an invoice or payment does not delete ledger rows. It appends reversal
   entries with the opposite amounts, and restores the balance exactly to its
   pre-invoice value.

Other key rules:
- Invoice numbers come from the sequences table inside the transaction, so they are
  gapless even if batch generation is cancelled halfway.
- Only draft invoices can be edited. Issued invoices can only be voided with a reason,
  or corrected with a credit/debit note.
- Payments can be partial, can exceed the amount due (becoming customer credit that
  auto-applies to the next invoice), and auto-allocate FIFO to the oldest unpaid
  invoices.
- Generating the same period twice for one customer is rejected with INVOICE_EXISTS.
- Do not silently create payments from cash collected at delivery. Implement the
  end-of-day "post today's collected cash as payments" action described in section
  3.7 instead, and document what you chose.

Do not begin Phase 4 work: no PDF rendering, no WhatsApp sharing. Wire the buttons and
leave them disabled with a TODO(phase-4) marker.

When finished:
- Verify every acceptance criterion. Criteria 1 through 8 are arithmetic; check them
  by hand, not by trusting the code.
- Run: npm run typecheck && npm run lint && npm run test && npm run build
- Append to docs/phases/PROGRESS.md: the InvoicePreview and Invoice DTO shapes (Phase
  4 renders them), the invoice numbering format actually implemented, and how
  cash-at-delivery was handled.
- Bump the minor version, add a CHANGELOG line, and push.
```

---

## P4 — PDF documents & sharing

```text
You are implementing Phase 4 of the Aqua Nuqi project. Phases 0 through 3 are complete.

Read these files completely, in this order, before writing any code:
1. docs/phases/AGENT-BRIEF.md
2. docs/00-project-overview.md
3. docs/02-architecture-and-stack.md
4. docs/04-ui-ux-guidelines.md
5. docs/phases/PROGRESS.md
6. docs/phases/phase-04-pdf-documents-and-sharing.md

Then implement Phase 4 completely and exactly as specified.

Goal: the owner can produce a professional bill for any customer at any time, print
it, save it, and send it on WhatsApp in a couple of clicks.

Use Electron's webContents.printToPDF on a pooled hidden BrowserWindow rendering React
templates. Do not add Puppeteer, pdfmake, jsPDF or any other PDF library - Electron is
already a headless Chrome and the templates must reuse our React and Tailwind stack so
the on-screen preview is identical to the printed output.

Bundle fonts locally (Noto Sans plus Noto Nastaliq Urdu or equivalent). Customer names
may be in Urdu script and must not render as boxes. No CDN font requests at runtime -
this app must work with no internet.

Deliver these templates: invoice (A4), payment receipt (A5 and 80mm thermal), delivery
slip (80mm thermal), customer statement, printable monthly delivery card, and print
layouts for the bottles-out and receivables reports.

Also required:
- numberToWords using the Pakistani lakh/crore system, unit-tested including zero,
  paisa remainders and large values.
- Batch export with a progress dialog, a cancel button and a summary. 300 invoices
  must generate sequentially in the pooled window - do not spawn 300 windows.
- A generic exportTable and exportExcel used to wire up the export buttons that
  Phases 1 to 3 left in place.

On WhatsApp: implement only the shell.openExternal approach with a wa.me link, a
pre-filled message from a configurable template, plus shell.showItemInFolder to
highlight the PDF for a one-drag attach. Do NOT implement whatsapp-web.js, Baileys or
any unofficial automation library - they risk getting the client's phone number banned
by WhatsApp. This restriction is deliberate and is explained in
docs/05-open-questions-and-recommendations.md.

When finished:
- Verify every acceptance criterion. Actually open the generated PDFs and look at
  them; check pagination at 60 line items and Urdu name rendering.
- Run: npm run typecheck && npm run lint && npm run test && npm run build
- Append to docs/phases/PROGRESS.md: the pdf.service API, the template registry, the
  exportTable signature, and the Excel library chosen.
- Bump the minor version, add a CHANGELOG line, and push.

Note: this completes the minimum shippable product. After this release, the client can
replace his paper cards and hand-written bills entirely.
```

---

## P5 — Expense management

```text
You are implementing Phase 5 of the Aqua Nuqi project. Phases 0 through 4 are complete.

Read these files completely, in this order, before writing any code:
1. docs/phases/AGENT-BRIEF.md
2. docs/00-project-overview.md
3. docs/02-architecture-and-stack.md
4. docs/03-data-model.md  (section F)
5. docs/04-ui-ux-guidelines.md
6. docs/phases/PROGRESS.md
7. docs/phases/phase-05-expense-management.md

Then implement Phase 5 completely and exactly as specified.

Goal: every rupee leaving the business is recorded and categorised, so Phase 8 can
show a truthful profit figure.

The quick-add form at the top of the expenses page is the feature that decides whether
this module gets used. Recording an expense must take under 5 seconds: date, category,
amount, description, method. Enter submits and returns focus to the amount field for
the next entry.

Key rules:
- Expenses with source != 'manual' (created by payroll in Phase 6 or by bottle
  purchases in Phase 7) are read-only in this screen, with a banner explaining where
  to edit them. This is what prevents double-counting in the profit report.
- Salaries and Employee Advance are system categories: they cannot be renamed or
  deleted.
- Category merge must move all expenses and leave totals unchanged.
- guardPeriodOpen on the expense date.
- Receipt attachments are copied into userData/attachments/expenses/<year>/ and must
  be included in backups. Note this folder in PROGRESS.md so Phase 9 knows about it.

Seed the category list from docs/03-data-model.md section F, but treat it as a
placeholder: the real list will come from the client and will be adjusted later.

Implement the cash book (section 5.9) only if everything else in the phase is done.
If you skip it, say so in PROGRESS.md.

Do not begin Phase 6 work: no employees, no payroll.

When finished:
- Verify every acceptance criterion.
- Run: npm run typecheck && npm run lint && npm run test && npm run build
- Append to docs/phases/PROGRESS.md: the createExpense signature and exactly how
  source and source_ref_* should be populated. Phase 6 must create salary expenses
  through this same service or the profit report will double-count.
- Bump the minor version, add a CHANGELOG line, and push.
```

---

## P6 — Employees & payroll

```text
You are implementing Phase 6 of the Aqua Nuqi project. Phases 0 through 5 are complete.

Read these files completely, in this order, before writing any code:
1. docs/phases/AGENT-BRIEF.md
2. docs/00-project-overview.md
3. docs/02-architecture-and-stack.md
4. docs/03-data-model.md  (sections F and G)
5. docs/04-ui-ux-guidelines.md
6. docs/phases/PROGRESS.md
7. docs/phases/phase-06-employees-and-payroll.md

Then implement Phase 6 completely and exactly as specified.

Goal: staff records, attendance, mid-month advances, and a monthly payroll run that
feeds salary cost into the expense ledger correctly.

THE MOST IMPORTANT RULE IN THIS PHASE - read section 6.5 twice. An employee advance is
cash paid out early, not a new expense on top of salary. Implement it as:
- Paying an advance creates an "Employee Advance" expense immediately (real cash left
  the business).
- Finalising payroll creates a "Salaries" expense equal to the NET amount actually
  paid at payroll time, not the gross salary.
- Total salary cost for the month is therefore Employee Advance + Salaries, which
  equals gross pay, counted exactly once.
Write the unit test specified in section 6.5: a Rs 30,000 salary with a Rs 10,000
advance must produce Employee Advance = 10,000, Salaries = 20,000, total cost 30,000,
and no double-counting in the profit report.

Other key rules:
- Salary structures are dated, like customer rates. Changing a salary closes the
  current employee_salaries row and inserts a new one. August payroll must use the
  August salary.
- The working-days basis (calendar days, fixed 26, or actual working days) materially
  changes the maths. Store it in settings as payroll.workingDaysBasis, default
  fixed_26, and display it on the payroll screen so it is never ambiguous.
- Commission is computed from the sum of delivery quantities where employee_id matches
  in that month. Document what happens when a delivery has no employee set.
- Net payable cannot be negative. If advances exceed the salary, cap the deduction,
  carry the remainder to next month, and show a warning.
- Finalising creates one Salaries expense per paid employee with source = 'payroll',
  via the expense service from Phase 5. Voiding a run reverses them and un-settles the
  advances.
- Salary slip PDFs use the Phase 4 PDF engine.

Do not add statutory deductions (EOBI, social security). The client has not asked for
them; note it as an open question instead.

When finished:
- Verify every acceptance criterion, especially 3, 4, 5 and 6 - check the arithmetic
  by hand.
- Run: npm run typecheck && npm run lint && npm run test && npm run build
- Append to docs/phases/PROGRESS.md: the working-days basis implemented, how
  commission is attributed when a delivery has no employee, and the exact rule used
  for the Salaries expense amount.
- Bump the minor version, add a CHANGELOG line, and push.
```

---

## P7 — Inventory & trip reconciliation

```text
You are implementing Phase 7 of the Aqua Nuqi project. Phases 0 through 6 are complete.

Read these files completely, in this order, before writing any code:
1. docs/phases/AGENT-BRIEF.md
2. docs/00-project-overview.md
3. docs/02-architecture-and-stack.md
4. docs/03-data-model.md  (section H, including the movement recipes table, and J)
5. docs/04-ui-ux-guidelines.md
6. docs/phases/PROGRESS.md
7. docs/phases/phase-07-inventory-and-trip-reconciliation.md

Then implement Phase 7 completely and exactly as specified.

Goal: the owner knows how many bottles he owns, where every one of them is, and
whether the cash and bottles a driver brings back match what went out. Bottles are his
biggest recoverable asset and his biggest silent loss - roughly Rs 300-500 each, with
hundreds sitting in customers' kitchens.

stock_movements is an append-only ledger. Stock levels are always derived from it,
never stored as a mutable counter. Follow the movement recipes table in
docs/03-data-model.md section H exactly.

Two things in this phase modify earlier code - do them carefully:
1. Wire deliveryService.upsertDelivery (Phase 2) so every insert, update and void
   writes the corresponding stock movements inside the same transaction. For updates,
   reverse the previous movements and write new ones rather than computing deltas -
   it is far easier to reason about. Document which you chose.
2. Write an idempotent backfill migration that generates movements for all deliveries
   recorded before this phase, and log how many rows it created. Then add a
   consistency test: withCustomers derived from stock_movements must equal the sum of
   customer_balances.bottles_with_customer across all customers.

Trips are OPTIONAL by design. If the owner does not use them, deliveries must still
work and stock moves directly plant to customer. Do not make trips mandatory anywhere.

The trip close screen is the theft-control feature and the one most likely to pay for
this whole project. Show expected versus actual side by side for filled bottles,
empties and cash, highlight any variance, and require a note when a variance is
non-zero.

Bottle purchases create stock movements AND an expense in the "Bottle purchase"
category via the Phase 5 expense service with source = 'purchase'.

When finished:
- Verify every acceptance criterion, especially 2 through 5 (the stock arithmetic and
  the backfill consistency check).
- Run: npm run typecheck && npm run lint && npm run test && npm run build
- Append to docs/phases/PROGRESS.md: the getBalances shape, whether a stock_balances
  summary table was added, and how delivery updates write movements.
- Bump the minor version, add a CHANGELOG line, and push.
```

---

## P8 — Dashboard & reports

```text
You are implementing Phase 8 of the Aqua Nuqi project. Phases 0 through 7 are complete.

Read these files completely, in this order, before writing any code:
1. docs/phases/AGENT-BRIEF.md
2. docs/00-project-overview.md
3. docs/02-architecture-and-stack.md
4. docs/03-data-model.md  (section J - the canonical formulas - read it carefully)
5. docs/04-ui-ux-guidelines.md
6. docs/phases/PROGRESS.md
7. docs/phases/phase-08-dashboard-and-reports.md

Then implement Phase 8 completely and exactly as specified.

Goal: answer the owner's real questions in one glance - how much did I sell, how much
did I spend, how much did I actually make, who owes me money, and where are my bottles.

Wrong reports are worse than no reports. Every report function needs a unit test
against a fixed seeded dataset with hand-calculated expected numbers. Do not write a
test that simply re-implements the query.

Every report must respect these, and they must be individually tested:
- Voided rows excluded everywhere.
- Security deposits excluded from revenue in both accrual and cash views. They are a
  liability, not income.
- Employee advances not double-counted against salary expense.
- Walk-in sales included in revenue but excluded from receivables.
- Salaries appear exactly once in the profit and loss.

The profit and loss report must offer both an accrual (billed) and a cash (received)
basis, with a one-line plain-language explanation of the difference shown in the UI.
These differ a lot in this business and the owner will notice if they are conflated.

The dashboard must respect roles: an operator sees no profit, expense, or salary
figure anywhere, and cannot reach one by URL.

Performance: no report may take more than 2 seconds on the seeded dataset (1,000
customers, 3 years). Add indexes as needed. If a report needs a pre-aggregate, create
a summary table maintained on write with a rebuild function, and document it in
PROGRESS.md - Phase 9's integrity check must be able to rebuild it.

When finished:
- Verify every acceptance criterion. For criteria 1 through 7, calculate the expected
  numbers by hand from the seed data and compare.
- Run: npm run typecheck && npm run lint && npm run test && npm run build
- Append to docs/phases/PROGRESS.md: any summary tables added for performance and
  exactly how they are rebuilt.
- Bump the minor version, add a CHANGELOG line, and push.
```

---

## P9 — Backup, audit, hardening & release

```text
You are implementing Phase 9 of the Aqua Nuqi project, the final phase. Phases 0
through 8 are complete.

Read these files completely, in this order, before writing any code:
1. docs/phases/AGENT-BRIEF.md
2. docs/00-project-overview.md
3. docs/02-architecture-and-stack.md
4. docs/07-data-lifecycle-and-upgrades.md  (all of it)
5. docs/04-ui-ux-guidelines.md
6. docs/phases/PROGRESS.md  (all entries - you are hardening everything built so far)
7. docs/phases/phase-09-backup-audit-hardening-and-release.md

Then implement Phase 9 completely and exactly as specified.

Goal: make the app safe to depend on for years. The client's entire business record
lives in one file on one laptop. Losing it must be impossible in practice.

Highest-value items, in order:
1. Full backup and restore. A backup is a single zip containing the database (via
   VACUUM INTO, consistent even with WAL active) plus all attachment folders, with a
   manifest recording app version, schema version, per-table row counts and a SHA-256
   checksum. Scheduled on exit, daily and weekly, with retention that never prunes the
   most recent successful backup or any pre_migration / pre_restore backup.
2. Restore wizard that takes a pre_restore snapshot first, validates the manifest,
   refuses a backup whose schema is newer than the app, and requires typing RESTORE.
   Also support opening a backup read-only for inspection without touching live data.
3. Integrity check with business-rule validations (ledger balance chain,
   customer_balances versus aggregates, stock movements versus bottles held, orphaned
   attachments) and safe Fix actions.

The build pipeline already exists from Phase 0B. Section 9.7 only wires
electron-updater to that existing feed - do not rebuild the pipeline. Subscribe to the
stable channel only; a pre-release dev build must never be offered to the client's
machine. Always take a backup before applying an update.

Section 9.10 is final polish, not a rebuild: bump to 1.0.0, add the portable build
target (which must use a separate, clearly labelled data folder), and verify the
uninstall behaviour.

Run the full upgrade test matrix in docs/07-data-lifecycle-and-upgrades.md section 7,
all 8 scenarios, and record the results in PROGRESS.md.

Also produce the client handover document: where the data lives, where backups go, how
to restore, how to move to a new laptop, how updates arrive, and what to do if the
laptop dies. Write it for a non-technical reader.

When finished:
- Verify every acceptance criterion, including the full end-to-end scenario in section
  9.11: two months of operation with 50 customers, then backup, restore, and confirm
  every number still matches.
- Run: npm run typecheck && npm run lint && npm run test && npm run build
- Finalise docs/phases/PROGRESS.md and docs/CHANGELOG.md.
- Cut a stable 1.0.0 release.
```

---

# Utility prompts

## R1 — Phase review (run in a fresh context after every phase)

```text
You are reviewing the implementation of Phase N of the Aqua Nuqi project. You did not
write this code. Your job is to find what is wrong with it, not to praise it.

Read:
1. docs/phases/AGENT-BRIEF.md
2. docs/02-architecture-and-stack.md
3. docs/03-data-model.md  (the sections relevant to Phase N)
4. docs/phases/phase-NN-<name>.md
5. docs/phases/PROGRESS.md  (the Phase N entry in particular)

Then review the actual code against the spec and report:

1. Acceptance criteria: go through every numbered criterion in the phase file and mark
   it PASS, FAIL or UNVERIFIED, with the file and line that satisfies it. Run the app
   where a criterion needs it. Do not mark anything PASS on the basis of the code
   looking correct - check the behaviour.
2. Convention violations: money stored as a float or string; JS Date objects in the
   database; hard deletes; mutations that skip the audit log or the period lock; IPC
   channels missing a Zod contract or a role restriction; business logic that imports
   Electron; libraries not in the approved stack.
3. Correctness risks in the business maths: rounding, month boundaries, back-dated
   entries, void and reversal handling, and anything where deposits or advances could
   leak into a revenue or expense total.
4. Anything implemented from a later phase that should not exist yet.
5. Anything in the PROGRESS.md entry that does not match what the code actually does.
6. Missing tests, especially around money arithmetic.

Report findings as a numbered list ordered by severity, each with the file, the
problem, why it matters for this business, and a concrete fix. Do not fix anything
yet. If you find nothing serious, say so plainly rather than inventing issues.
```

## R2 — Fix review findings

```text
Fix the following issues found in the Phase N review of the Aqua Nuqi project.

Read docs/phases/AGENT-BRIEF.md and docs/phases/phase-NN-<name>.md first, then apply
the fixes below. Do not refactor anything unrelated. Do not add features.

<paste the review findings here>

For each fix, add or update a test that would have caught the problem. When done, run
npm run typecheck && npm run lint && npm run test && npm run build, and append a short
"Review fixes" note to the Phase N entry in docs/phases/PROGRESS.md.
```

## R3 — Resuming a phase that ran out of context

```text
You are continuing Phase N of the Aqua Nuqi project. A previous agent started this
phase and stopped partway through.

Read:
1. docs/phases/AGENT-BRIEF.md
2. docs/02-architecture-and-stack.md
3. docs/03-data-model.md  (sections relevant to Phase N)
4. docs/phases/PROGRESS.md
5. docs/phases/phase-NN-<name>.md

Then, before writing any code, inspect the repository and produce a short status
report: which parts of the phase scope are complete, which are partial, and which have
not been started. Check the migrations, the services, the IPC channels and the screens
against the phase file section by section.

Show me that report and wait for my confirmation. Then finish the remaining work,
following the same rules as the original phase prompt, and complete the phase properly
including the acceptance criteria, the four verification commands, and the PROGRESS.md
entry.
```

## R4 — Bug fix from client feedback

```text
The client reported a bug in Aqua Nuqi.

Report: <describe what he did, what happened, and what he expected>
Version: <version he is running>

Read docs/phases/AGENT-BRIEF.md, docs/02-architecture-and-stack.md, and the phase file
for the module involved.

Steps:
1. Reproduce the bug first. Do not start fixing until you have reproduced it and can
   describe the exact cause. If you cannot reproduce it, say so and tell me what
   additional information you need from the client.
2. Check whether the bug corrupted any stored data. If it did, write a repair
   migration and say clearly what it fixes - the client has real business data and it
   may already be wrong.
3. Fix the root cause, not the symptom.
4. Add a regression test that fails before your fix and passes after it.
5. Run npm run typecheck && npm run lint && npm run test && npm run build.
6. Bump the patch version, add a CHANGELOG line, and push.

Do not refactor unrelated code while you are in there.
```

## R5 — Applying answers from the client meeting

```text
I met the client and got answers to the open questions in
docs/05-open-questions-and-recommendations.md and
docs/06-client-questionnaire.md.

Here are his answers:
<paste the filled-in answers>

Update the documentation to match, in this order:
1. docs/03-data-model.md first, if anything changes the schema. This is the
   authoritative source and everything else follows from it.
2. docs/01-functional-requirements.md - adjust or add FR entries. Do not renumber
   existing IDs; add new ones at the end of their section.
3. The affected phase files in docs/phases/.
4. docs/05-open-questions-and-recommendations.md - mark answered items as resolved
   with the answer, rather than deleting them.
5. docs/CHANGELOG.md.

Do not write any application code. After updating, give me a short summary of what
changed and, specifically, whether any already-completed phase now needs rework.
```
