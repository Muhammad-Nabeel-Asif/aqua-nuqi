# Changelog

All notable changes to Aqua Nuqi. Each phase appends its entry here.

## [Unreleased]

### Fixed

- Daily entry now links to the only open van even when the driver is not tagged, so closing a trip
  no longer writes those bottles off as lost.
- Editing a customer phone no longer voids and re-posts the security deposit or opening bottles.
- A locked billing month no longer blocks creating a customer when openings and deposit are zero.
- Profit & Loss no longer treats salary advances as an operating cost.
- First-run setup keeps the wizard open and shows the recovery code before signing in.
- Unpaid bills refresh after Send. Ageing uses today when the selected month is still in progress.
- Leftover `window.prompt` calls (void, PIN, rename, holiday, deactivate) now use in-app dialogs.

### Changed

- Help uses this computer's data path, says bill the open month then lock, and talks about Given /
  Taken instead of Qty.
- Plant-owner wording across reports, dashboard, product/vehicle kinds, and skip reasons. Operator
  screens say Owner only instead of silently bouncing to the dashboard. Bad hashes show a 404, not
  a developer page.
- Daily entry and month matrix no longer steal focus into the first qty cell. Back navigation and
  breadcrumbs work from sub-pages. The first-run onboarding tour is removed.
- Employee detail can edit name, phone, and photo.

### Added

- **Brand identity rollout.** The official Aqua Nuqi logo now appears across every customer-facing
  surface: sidebar (full lockup expanded, square badge on the collapsed rail), boot splash, login,
  lock overlay, all four setup screens, Settings → About, Help, first-run tour, error boundary,
  fatal-error window, favicon and window/taskbar icons.
- **Branded documents.** Thermal delivery slips and thermal payment receipts now carry the logo
  (previously text only); multi-page PDFs print the business name in the page footer beside the
  page number; Excel exports gained a business header block and workbook metadata.
- **Centralised brand source.** All artwork is generated from a single source file by
  `scripts/generate-brand-assets.py`; code reaches it only through `@renderer/brand` (`AppLogo`,
  `BrandLockup`) or `@main/lib/brand-assets`. See `docs/08-branding.md`.
- **Branded installer.** NSIS header and sidebar graphics, plus regenerated `icon.ico` / `icon.png`
  from the new mark.

### Changed

- Documents with no uploaded business logo now fall back to the bundled Aqua Nuqi lockup instead of
  a single-letter square. An uploaded business logo still takes precedence, and the fallback also
  covers a deleted or corrupted upload.
- `createPdfPlatformFromElectron` is typed as `PdfPlatform` rather than an inline duplicate, so a
  new platform capability can no longer leave the adapter silently behind.

## [1.0.0] — 2026-08-02

### Added

- **Phase 9 — Backup, restore, audit, hardening and release:** Full backup archives
  (`VACUUM INTO` + attachments + logos + manifest with SHA-256 and row counts), schedules
  (exit / daily / weekly), retention that never prunes the latest success or
  `pre_migration` / `pre_restore`, optional secondary destination and AES password wrap.
  Restore wizard with typed `RESTORE`, schema-newer refusal, pre_restore snapshot, and
  read-only inspection. Integrity check + safe Fix for `customer_balances`. Audit log
  viewer with readable diffs and Excel export. Full user management (deactivate, reset
  password, PIN clear, force logout, last-owner guard), failed-login throttling, password
  policy (min 8), recovery code, lock-on-minimise. Settings tabs completed (Backup,
  Maintenance, Audit, Users & security, Billing). In-app auto-update via `electron-updater`
  on the **stable** channel only, with backup before install. Diagnostics zip includes
  row counts + last 200 audit entries; rotating logs (14 days); Help page + client
  handover doc. Portable Windows target (`Aqua-Nuqi-Portable.exe`) with separate
  `Aqua Nuqi Portable Data` folder; uninstall asks before deleting data (default No).

### Changed

- Version bumped to **1.0.0** (first production-stable release).
- First-run restore accepts `.zip` archives as well as legacy `.db` files.

### Fixed

- Phase 9 review: Backup/Audit screens no longer crash on ISO timestamps (`DateText`
  `kind="datetime"` + `resolveDisplayDateKind`); failed restore clears `pending-restore.json`
  so boot cannot record a false restore audit; published backup zips are never deleted after
  atomic rename. Billing edits `tax.rate`; audit retention setting drives `applyRetention`;
  failed-login throttle persists across restarts; stock-vs-bottles integrity is not marked
  Fixable; invoice void audit includes totals, deposit lines, and delivery ids.

## [0.10.0] — 2026-08-01

### Added

- **Phase 8 — Dashboard, Profit & Loss and Reports:** `report.service` with accrual/cash P&L,
  sales, receivables ageing, collections, expenses, cost-per-bottle, bottle loss, trip variance,
  and stock movement reports. Dashboard answers bottles/cash/revenue/profit/receivables/stock in
  one glance; operators see no profit, expense, or salary figures. Report hub at `/reports` with
  PDF/Excel export (filters in header). Customer statement batch at `/reports/customer-statements`.
  In-memory `reportCache` invalidated via audit write counter. Migrations `0012_report_indexes`,
  `0013_payment_purpose` (`payments.purpose`). Unit tests against a fixed hand-calculated fixture
  (voids, deposits, advances, walk-ins, salaries-once, custom/MTD accrual, write-offs, schedule
  match, ~1000×3yr cold perf).

### Fixed

- Phase 8 review: custom/MTD accrual uses delivery dates (full months keep invoice period
  membership); `payments.purpose` + deposit checkbox; write-offs reduce P&L net revenue; missed
  scheduled uses `scheduleMatchesDate`; Excel export writes filter headers; bottle-loss start =
  day before range; IPC contracts drop `z.any()`; trip variance cash formatted as Rs.
- Phase 7 review: trip close writes off filled/empty shortfalls (`van→scrap` lost) so missing
  bottles leave van stock and `totalOwned`; `bottle_variance` uses schema formula
  (loaded − returned − delivered); delivery/opening stock updates append opposite movements
  instead of DELETE; negative count adjustments use `none` (not scrap); production and trip
  load reject insufficient plant stock; inventory bottles-out PDF/Excel from stock report;
  movement history filters + export; opening stock can force-adjust after ops start.
- Phase 7 close-out: `voidTrip` reverses trip shortfall `lost` write-offs (append-only) so
  voiding a closed trip after unlinking deliveries restores van/plant/`totalOwned` and does
  not leave negative `filledInVans` or permanent scrap from the mistaken close.

## [0.9.0] — 2026-08-01

### Added

- **Phase 7 — Bottle inventory, vehicles & trip reconciliation:** append-only `stock_movements`
  ledger with derived balances (`filledAtPlant`, `emptyAtPlant`, `filledInVans`, `emptyInVans`,
  `withCustomers`, `scrapped`, `totalOwned`). Deliveries write plant↔customer (or van↔customer
  when a trip is linked) movements; updates use **append-only reversal**. Idempotent backfill for
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
