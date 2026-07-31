# Aqua Nuqi — Master Functional Requirements

> This is the complete requirement catalogue for the whole product. Individual build phases pick
> a subset of these requirements. Requirement IDs (`FR-xx-nn`) are referenced from the phase docs
> and from acceptance criteria — never renumber them.

Priority legend: **M** = must have for v1, **S** = should have, **C** = could have (v1.1+).

---

## FR-CU — Customers

| ID | Pri | Requirement |
|---|---|---|
| FR-CU-01 | M | Create, view, edit and deactivate customers. Never hard-delete; deactivating hides them from pickers but keeps history. |
| FR-CU-02 | M | Each customer has an auto-generated, human-readable code (`C-0001`) that is unique and shown on invoices. |
| FR-CU-03 | M | Fields: name, customer type (residential / commercial / walk-in), primary phone, secondary phone, WhatsApp number, full address, area, route, delivery notes, joining date. |
| FR-CU-04 | M | Each customer has a **rate per bottle**. Rates are stored with `effective_from` / `effective_to` so old invoices keep their old rate. Changing a rate creates a new rate row, it never overwrites. |
| FR-CU-05 | M | Support two billing modes: **per-bottle** (qty × rate) and **monthly package** (fixed monthly amount, optionally with N bottles included and an excess rate beyond N). |
| FR-CU-06 | M | Record **security deposit** held against the customer's bottles, with a history of deposit taken and refunded. |
| FR-CU-07 | M | Record **opening balance** (money the customer already owed on the day we go digital) and **opening bottles with customer**, so migration from paper is accurate. |
| FR-CU-08 | M | Show a live **bottles with customer** count and flag customers holding more bottles than their deposit covers. |
| FR-CU-09 | M | Customer status: active / paused (e.g. gone abroad for a month) / inactive. Paused customers are hidden from the daily entry list but keep their balance. |
| FR-CU-10 | S | Optional **delivery schedule** per customer (e.g. Mon & Thu, or "every 3 days", or "on call") used to pre-fill the day's delivery plan. |
| FR-CU-11 | S | Customer detail page shows: profile, current balance, bottles held, last 12 months delivery summary, all invoices, all payments, full ledger. |
| FR-CU-12 | S | Bulk import customers from CSV/Excel (name, phone, address, area, rate, opening balance, opening bottles). |
| FR-CU-13 | C | Attach photos/documents (CNIC copy, shop photo) to a customer. |
| FR-CU-14 | M | Global search (Ctrl+K) finds a customer by name, code, phone or address. |

## FR-PR — Products & pricing

| ID | Pri | Requirement |
|---|---|---|
| FR-PR-01 | M | A `products` table exists. Seeded with one product: **"19 L Bottle", returnable, unit = 1**. All v1 UI can assume this default product but must not hard-code it out of the schema. |
| FR-PR-02 | S | Support additional products: non-returnable small bottles (1.5 L / 6 L packs), water dispensers/coolers (sale), dispenser rental (recurring monthly charge). |
| FR-PR-03 | M | Global default rate per product, overridable per customer. |
| FR-PR-04 | S | Bulk rate change tool: "increase rate for all residential customers in Area X from 1 Aug by Rs 10", creating dated rate rows. |

## FR-DL — Delivery tracking (the core module)

| ID | Pri | Requirement |
|---|---|---|
| FR-DL-01 | M | Record for a given date and customer: quantity of filled bottles delivered, number of empties collected back, rate snapshot, amount, optional cash collected on the spot, delivering employee, note. |
| FR-DL-02 | M | **Customer Card view** — the digital twin of the paper card. Pick a customer + month, see a grid of all days of that month, type units directly into a day cell. Shows month total units and month total amount. |
| FR-DL-03 | M | **Daily Entry view** — pick a date (defaults to today), see all active customers (filterable by route/area), and enter units for each in one keyboard-driven list. Enter/Tab moves to the next customer. Autosaves per row. |
| FR-DL-04 | M | **Month Matrix view** — customers as rows, days 1–31 as columns, editable cells, row totals and column totals. Filter by route/area. This is the fastest way to review a whole month. |
| FR-DL-05 | M | At most **one delivery row per (customer, date, product)**. Entering a second delivery on the same day adds to the existing quantity. A note field records details if needed. |
| FR-DL-06 | M | Entering `0` or clearing a cell removes the delivery for that day (soft delete / void). |
| FR-DL-07 | M | Empties collected default to the quantity delivered (the normal case: swap 2 for 2), but must be individually editable, including 0. |
| FR-DL-08 | M | Deliveries in a **closed period** cannot be edited. The app shows a lock indicator and requires the owner to explicitly reopen the period. |
| FR-DL-09 | M | Deliveries already attached to an issued invoice cannot be edited; the user must void the invoice or add a credit/debit note. |
| FR-DL-10 | S | Mark a delivery as **free / complimentary** (amount 0) with a reason. |
| FR-DL-11 | S | Record a **damaged / lost bottle charge** against a customer as an adjustment. |
| FR-DL-12 | S | Quick "walk-in sale" entry: cash sale to a non-registered customer, no invoice, recorded as revenue immediately. |
| FR-DL-13 | M | Every delivery edit is written to the audit log with before/after values and the user who did it. |
| FR-DL-14 | S | "Missed delivery" indicator: customers on a schedule who have no delivery in the last N days. |

## FR-BL — Billing, invoices & customer ledger

| ID | Pri | Requirement |
|---|---|---|
| FR-BL-01 | M | Generate a **monthly invoice** for one customer: previous outstanding (carry forward) + this month's deliveries + adjustments − payments received = closing balance. |
| FR-BL-02 | M | **Batch invoice generation**: generate invoices for all active customers for a chosen month in one action, with a preview list and per-customer opt-out. |
| FR-BL-03 | M | Invoice numbering is sequential, gapless, configurable prefix (e.g. `INV-2026-07-0042`). |
| FR-BL-04 | M | Invoice line items: one line per delivery date (date, units, rate, amount), plus separate lines for package charge, dispenser rent, damaged-bottle charge, discount, deposit, and carry-forward balance. |
| FR-BL-05 | M | Invoice states: draft → issued → partially paid → paid, plus void. Only `draft` invoices can be edited; issued invoices can only be voided (with reason) or adjusted with a credit/debit note. |
| FR-BL-06 | M | **Customer ledger**: an append-only list of debits (invoices, charges) and credits (payments, discounts, write-offs) with a running balance. This is the single source of truth for "how much does he owe". |
| FR-BL-07 | M | Record **payments**: date, amount, method (cash / bank transfer / JazzCash / Easypaisa / cheque / other), reference number, received by, note. Payments can be partial and can exceed the due amount (becoming customer credit). |
| FR-BL-08 | M | Auto-allocate a payment to the oldest unpaid invoices (FIFO), with the ability to manually re-allocate. |
| FR-BL-09 | M | **Receivables report**: every customer with a non-zero balance, sorted by amount, with ageing buckets (current, 1–30, 31–60, 60+ days). |
| FR-BL-10 | S | Apply a **discount** or **write-off** to a customer with a reason, recorded in the ledger. |
| FR-BL-11 | S | Credit note / debit note documents for corrections after an invoice is issued. |
| FR-BL-12 | S | Configurable **due date** (e.g. 10 days after issue) and an overdue flag. |
| FR-BL-13 | C | Late-payment reminder list with one-click "mark as reminded" and reminder history. |
| FR-BL-14 | M | Deposit received/refunded must be tracked separately from revenue — a deposit is a liability, not income, and must not inflate profit. |

## FR-PD — PDF documents, printing & sharing

| ID | Pri | Requirement |
|---|---|---|
| FR-PD-01 | M | Generate a **PDF invoice** for any customer for any month, at any time (not only at month end) — including a mid-month "bill to date". |
| FR-PD-02 | M | The invoice PDF contains: business name/logo/address/phone (from settings), invoice number, issue date, period, customer name/code/address/phone, per-date line items with units and rate, subtotal, adjustments, previous balance, total payable, bottles held by customer, payment instructions/bank details, and a footer note. |
| FR-PD-03 | M | Batch export: generate PDFs for all customers of a month into a chosen folder, named `INV-<no>-<customer-code>-<customer-name>.pdf`. |
| FR-PD-04 | M | Print directly to a printer (A4) and open the system print preview. |
| FR-PD-05 | M | **Share via WhatsApp**: open WhatsApp (Desktop or Web) with the customer's number and a pre-filled message containing the bill summary, and reveal the saved PDF in the file explorer so the owner can attach it in one drag. (See `05-open-questions-and-recommendations.md` §WhatsApp for why full automation is not offered.) |
| FR-PD-06 | S | **Delivery slip / receipt** PDF for a single delivery or a payment receipt (thermal 80 mm and A5 layouts). |
| FR-PD-07 | S | PDF export of any report shown on screen (receivables, P&L, expense summary). |
| FR-PD-08 | S | Excel/CSV export of any table on screen. |
| FR-PD-09 | S | Invoice template customisation from settings: logo upload, colour, footer text, terms, show/hide bottle balance. |

## FR-EX — Expense management

| ID | Pri | Requirement |
|---|---|---|
| FR-EX-01 | M | Record an expense: date, category, amount, payment method, paid-to / vendor, description, reference number, optional receipt image. |
| FR-EX-02 | M | Manage expense categories. Seed with: Electricity, Water/Raw water, Fuel, Vehicle maintenance, Bottle purchase, Caps & seals, Filter/RO membrane, Plant maintenance, Rent, Salaries, Employee advance, Government/licence fees, Mobile & internet, Marketing, Miscellaneous. Owner can add more. |
| FR-EX-03 | M | Expense list with filters: date range, category, payment method, vendor; with a running total. |
| FR-EX-04 | M | Payroll payments automatically create expenses in the "Salaries" category so profit is correct **without double counting** — payroll-generated expenses are read-only in the expense screen. |
| FR-EX-05 | S | **Recurring expenses** (rent, electricity) with a monthly reminder on the dashboard: "3 recurring expenses not yet recorded this month". |
| FR-EX-06 | S | Attach an expense to a specific vehicle or employee (for fuel/repair analysis). |
| FR-EX-07 | S | Monthly expense breakdown by category with a comparison against the previous month. |
| FR-EX-08 | C | Simple cash-book: opening cash, cash in (collections), cash out (expenses), closing cash, and a daily cash-position reconciliation. |

## FR-EM — Employees, attendance & payroll

| ID | Pri | Requirement |
|---|---|---|
| FR-EM-01 | M | Employee records: code, name, phone, CNIC, address, photo, role (delivery / plant / admin), joining date, status, emergency contact. |
| FR-EM-02 | M | Salary structure per employee: monthly fixed, daily wage, or fixed + commission per bottle delivered. Salary changes are dated (history preserved). |
| FR-EM-03 | M | **Attendance**: mark present / absent / half-day / leave / holiday per employee per day, with a month calendar view and a fast "mark all present" action. |
| FR-EM-04 | M | **Salary advances**: money given to an employee mid-month, recorded with date, amount and reason; automatically deducted from that month's payroll. |
| FR-EM-05 | M | **Monthly payroll run**: for the chosen month, compute per employee — base salary, absence deduction, overtime, commission on bottles delivered, bonus, advances deducted, other deductions → **net payable**. Review, adjust, then finalise. |
| FR-EM-06 | M | Record salary payment (full or partial) with date and method; finalising creates the matching Salaries expense entries. |
| FR-EM-07 | S | **Salary slip PDF** per employee. |
| FR-EM-08 | S | Employee performance view: bottles delivered, customers served, cash collected, cash shortfalls, per month. |
| FR-EM-09 | C | Loan/instalment tracking for larger amounts recovered over several months. |

## FR-IN — Inventory & trip reconciliation

| ID | Pri | Requirement |
|---|---|---|
| FR-IN-01 | M | Track total bottle stock in three states/locations: **filled at plant**, **empty at plant**, **with customers**, plus **in van** during an open trip. |
| FR-IN-02 | M | Every delivery automatically moves bottles: filled plant/van → customer, and customer → empty plant/van for empties collected. No manual double entry. |
| FR-IN-03 | M | Record **new bottle purchases** (adds to stock, creates an expense) and **damaged / lost / scrapped** bottles with a reason. |
| FR-IN-04 | S | **Production entry**: on date D, N empty bottles were washed and filled (empty → filled). |
| FR-IN-05 | S | **Trip / van reconciliation**: at start of day record filled bottles loaded; at end of day record filled returned, empties brought back, and cash collected. App computes expected cash vs actual and highlights the **variance**. This is the main theft-control feature. |
| FR-IN-06 | S | Vehicle register (name, registration number) so fuel/repair expenses and trips can be attributed. |
| FR-IN-07 | M | **Bottle balance report**: total bottles owned, where they are, and a customer-wise list of bottles held, sorted descending — the owner's asset recovery list. |
| FR-IN-08 | C | Low-stock alert when filled bottles at plant drop below a configured threshold. |

## FR-DB — Dashboard & reports

| ID | Pri | Requirement |
|---|---|---|
| FR-DB-01 | M | Home dashboard: today's deliveries (units and value), month-to-date units, month-to-date revenue, month-to-date expenses, month-to-date profit, total outstanding receivables, bottles out with customers, and quick-action buttons. |
| FR-DB-02 | M | **Profit & Loss report** for any period: revenue (invoiced), other income, minus expenses by category (including salaries) = net profit, with a margin percentage. |
| FR-DB-03 | M | The P&L must offer both **accrual** (billed) and **cash** (actually collected) views, clearly labelled, because these differ a lot in this business. |
| FR-DB-04 | M | Monthly comparison chart: revenue vs expenses vs profit for the last 12 months. |
| FR-DB-05 | M | Sales report: units delivered per day / per month, per area, per route, per employee. |
| FR-DB-06 | M | Top customers by revenue and by units; inactive/declining customers (delivered last month, not this month). |
| FR-DB-07 | M | Receivables ageing report (see FR-BL-09). |
| FR-DB-08 | S | Expense breakdown pie/bar by category for a period. |
| FR-DB-09 | S | Cost per bottle: total expenses ÷ bottles delivered, trended monthly. |
| FR-DB-10 | S | Every report is exportable to PDF and Excel and printable. |

## FR-SY — System, settings, security, data safety

| ID | Pri | Requirement |
|---|---|---|
| FR-SY-01 | M | First-run setup wizard: business profile (name, logo, address, phone, bank details), currency, default rate, data folder location, backup folder, owner account creation. |
| FR-SY-02 | M | **Login** with username + password (or a 4–6 digit PIN for the owner). Roles: **owner** (everything), **operator** (customers, deliveries, payments; no profit, expenses, payroll, settings), **viewer** (read only). Auto-lock after N minutes idle. |
| FR-SY-03 | M | **Automatic backups**: on app close, daily, and weekly (configurable), to a configurable local folder; keep the last N daily / M weekly copies; each backup is a consistent SQLite snapshot with a checksum. |
| FR-SY-04 | M | **Manual backup now** and **restore from backup** with a confirmation flow that first takes a safety backup of the current database. |
| FR-SY-05 | M | Backup health indicator in the UI: "Last backup: 2 hours ago" — turns red if older than the configured interval. |
| FR-SY-06 | S | Optional copy of each backup to an external drive / user-selected cloud-synced folder (Google Drive / OneDrive desktop folder). Optional password-protected (encrypted) backup archive. |
| FR-SY-07 | M | **Audit log** of all create/update/void/delete/login/settings/backup/restore actions, with user, timestamp, entity and before/after values, viewable and filterable by the owner. |
| FR-SY-08 | M | **Period close**: lock a month after billing. Locked months reject writes. Reopening is an owner-only action that is audit-logged. |
| FR-SY-09 | M | Database migrations run automatically and safely on version upgrade, taking a pre-migration backup first. |
| FR-SY-10 | S | Settings screen: business profile, invoice template, numbering, tax, backup schedule, users, categories, areas/routes, products & default rates, language, date/currency format. |
| FR-SY-11 | S | Application auto-update (electron-updater) with a manual "check for updates". |
| FR-SY-12 | S | Global keyboard shortcuts and a searchable command palette (Ctrl+K). |
| FR-SY-13 | S | Crash/error logging to a local rotating log file, plus an "Export diagnostics" button that zips logs for the developer. |
| FR-SY-14 | C | Tax/GST support: configurable tax rate, tax number on invoice, tax report. Off by default. |
| FR-SY-15 | M | Nothing is ever hard-deleted; all "delete" actions are voids/soft deletes and remain in reports for the period they belong to. |

## FR-CI — Build, release & distribution

Introduced in Phase 0B. Full detail in `docs/phases/phase-00b-ci-cd-and-releases.md`.

| ID | Pri | Requirement |
|---|---|---|
| FR-CI-01 | M | Every push to `main` builds installers for Windows x64 and Ubuntu x64 automatically. |
| FR-CI-02 | M | Builds publish to GitHub Releases with fixed asset names, giving permanent "always latest" download URLs for the developer and the client. |
| FR-CI-03 | M | A build is published only if typecheck, lint, tests and the production build all pass. |
| FR-CI-04 | M | Version numbers auto-increment; no manual bumping per build. |
| FR-CI-05 | M | Release notes are generated from `docs/CHANGELOG.md` and the commits in the release, with plain-language install instructions appended for the client. |
| FR-CI-06 | M | Two channels: **dev** (every push, pre-release, developer only) and **stable** (deliberate, marked latest, what the client downloads). |
| FR-CI-07 | M | Installing a new build over an existing one must never delete or corrupt the user's database. Uninstalling keeps the data folder. |
| FR-CI-08 | S | The release feed is `electron-updater`-compatible so FR-SY-11 needs no pipeline change. |
| FR-CI-09 | S | A one-page non-technical download-and-install guide for the client. |
| FR-CI-10 | S | Builds can be triggered manually from the GitHub Actions tab. |

---

## Non-functional requirements

| ID | Requirement |
|---|---|
| NFR-01 | App cold start ≤ 3 s on a 4 GB RAM Windows laptop with an HDD. |
| NFR-02 | Any list/report screen renders in ≤ 500 ms with 1,000 customers and 5 years of deliveries (~1.5 M delivery rows). Use indexed queries and virtualised tables. |
| NFR-03 | Saving a delivery cell must feel instant (< 100 ms) and must not block typing in the next cell. |
| NFR-04 | Fully functional with no internet connection. No telemetry, no external API calls at runtime. |
| NFR-05 | All database writes that span multiple tables run inside a single transaction. |
| NFR-06 | `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. The renderer never touches the filesystem or database directly. |
| NFR-07 | Every IPC payload is validated with a schema on the main-process side before touching the database. |
| NFR-08 | The installer must work for a non-admin user and must not require any external runtime (no separate Node, no separate DB server). |
| NFR-09 | Target platform Windows 10/11 x64 primarily; the codebase must stay cross-platform (no Windows-only APIs) so a macOS/Linux build is possible. |
| NFR-10 | UI at 1366×768 minimum resolution without horizontal scrolling on primary screens. |
