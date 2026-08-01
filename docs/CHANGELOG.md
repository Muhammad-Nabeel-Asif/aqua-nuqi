# Changelog

All notable changes to Aqua Nuqi. Each phase appends its entry here.

## [Unreleased]

## [0.9.0] — 2026-08-01

### Added

- **Phase 7 — Bottle inventory, vehicles & trip reconciliation:** append-only `stock_movements`
  ledger with derived balances (`filledAtPlant`, `emptyAtPlant`, `filledInVans`, `emptyInVans`,
  `withCustomers`, `scrapped`, `totalOwned`). Deliveries write plant↔customer (or van↔customer
  when a trip is linked) movements; updates use **reversal-by-replace**. Idempotent backfill for
  historical deliveries/openings/adjustments. Opening stock, purchase (creates read-only Bottle
  purchase expense), production, damage/loss/scrap, and manual adjustments. Vehicles CRUD +
  trip load-out / close with expected vs actual for filled, empties and cash (note required on
  variance). Bottles-out recovery report. Low-stock alert via `inventory.lowStockThreshold`.
  Migration `0011_inventory_trips`.

## [0.8.0] — 2026-08-01

### Added

- **Phase 6 — Employees, attendance & payroll:** employee master data with dated salary
  structures, attendance calendar (bulk mark-present / company holiday), mid-month advances that
  post an **Employee Advance** expense immediately, and monthly payroll runs. Finalising creates
  one read-only **Salaries** expense per employee equal to _net payable_ (not gross), so
  Advance + Salaries = gross once. Working-days basis setting `payroll.workingDaysBasis`
  (default `fixed_26`). Salary slip PDFs via the Phase 4 engine. Migration
  `0008_employees_payroll` (employees tables + deferred employee FKs).

### Fixed

- Phase 6 review: unmarked attendance counted as absent for payroll; finalize no longer marks
  items fully paid (`recordPayment` / Pay all); capped advances use `settled_amount` (no row
  split); regenerating a voided run soft-supersedes items; attendance Today panel + drag-fill;
  global advances list and employee comparison table; absence rounding; waive respects period
  lock. Migration `0009_payroll_review_fixes`.
- Multi-month capped advance void: `salary_advance_settlements` ledger so voiding an earlier
  payroll undoes only that month’s slice. Salary slip “Net paid” uses `paidAmount`. Migration
  `0010_advance_settlements`.

## [0.7.0] — 2026-08-01

### Added

- **Phase 5 — Expense management:** categorised expenses with quick-add (<5 s keyboard entry),
  receipt attachments under `userData/attachments/expenses/<year>/`, system categories (Salaries /
  Employee Advance), category merge, recurring expense inbox (confirm-before-create), Recharts
  insights, and an informational cash book. Payroll/purchase-sourced expenses are read-only here
  so Phase 8 profit cannot double-count. Migration `0007_moaning_kitty_pryde`.

### Fixed

- **Phase 5 review:** recurring manage UI (create/list/edit/deactivate); voiding a recurring
  confirmation restores the template due date; expenses UI no longer bypasses period lock via
  `forceClosedPeriod`; cash book excludes `[deposit]` receipts; sortable expense columns;
  dashboard `/expenses?recurring=<id>` deep-link prefill; export amounts via
  `paisaToDecimalString`; attachment open/preview Zod contracts in shared; prior-period range
  uses YYYY-MM-DD day helpers.

## [0.6.35] — 2026-08-01

### Fixed

- **Phase 4 review:** real InvoiceTemplate fits 26 lines on one A4 page; page numbers via
  `printToPDF` footerTemplate; thermal 80 mm MediaBox via `preferCSSPageSize` + CSS `@page`;
  WYSIWYG invoice preview (`pdf:getInvoicePrintPayload`); receipt balance from ledger as-of
  payment; issued invoice empties/deposit freeze; batch cancel test with slow renderer; thermal
  printer + default page-size settings wired; customers/matrix `exportTable`; orphan
  `lib/print-window.ts` removed; verifier uses `#/print/:template?fixture=…`.

### Added

- **Phase 4 — PDF documents, printing & sharing:** Electron `printToPDF` engine with a pooled
  hidden BrowserWindow rendering React + Tailwind templates (invoice A4, payment receipt A5/80 mm,
  delivery slip 80 mm, customer statement, monthly delivery card, bottles-out & receivables reports,
  generic `exportTable`). Pakistani `numberToWords` (lakh/crore); batch PDF export with progress /
  cancel; WhatsApp via `wa.me` + `showItemInFolder` (no unofficial automation); Settings → Invoice
  customisation (logo, accent, bottle box, WhatsApp template). Excel export via existing `xlsx`.
  Bundled Noto Sans + Noto Nastaliq Urdu for offline Urdu names. Completes the minimum shippable
  product for replacing paper cards and hand-written bills.

## [0.2.6] — 2026-07-31

### Added

- **Phase 0B — CI/CD & releases:** GitHub Actions quality gate + Windows/Linux packaging on every
  push to `main`; fixed artifact names (`Aqua-Nuqi-Setup.exe`, `Aqua-Nuqi.AppImage`);
  dev (pre-release) vs stable channels; `latest.yml` / `latest-linux.yml` / blockmaps for
  electron-updater; auto release notes; client install guide
  (`docs/CLIENT-INSTALL-GUIDE.md`). First stable release: **v0.2.6**.

## [0.1.0] — 2026-07-31

### Added

- **Phase 0 — Foundation:** Electron + React + SQLite shell with Drizzle migrations, typed IPC,
  auth/roles, settings, audit log, period lock, minimal `VACUUM INTO` backups, first-run wizard
  (new business + restore from backup), app shell UI, and Windows NSIS packaging
  (`com.aquanuqi.app` / Aqua Nuqi / `aqua-nuqi`).

### Documentation

- Initial requirement set: project overview, functional requirements, architecture, data model,
  UI/UX guidelines, client gap analysis, client questionnaire, and phase specifications.
- Added Phase 0B specification and the data lifecycle / upgrade contract: frozen app identity,
  userData-only storage, downgrade refusal, pre-migration backups, upgrade audit trail, and the
  new-laptop migration procedure.
