# Changelog

All notable changes to Aqua Nuqi. Each phase appends its entry here.

## [Unreleased]

## [0.7.0] — 2026-08-01

### Added

- **Phase 5 — Expense management:** categorised expenses with quick-add (<5 s keyboard entry),
  receipt attachments under `userData/attachments/expenses/<year>/`, system categories (Salaries /
  Employee Advance), category merge, recurring expense inbox (confirm-before-create), Recharts
  insights, and an informational cash book. Payroll/purchase-sourced expenses are read-only here
  so Phase 8 profit cannot double-count. Migration `0007_moaning_kitty_pryde`.

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
