# Changelog

All notable changes to Aqua Nuqi. Each phase appends its entry here.

## [Unreleased]

### Added

- **Phase 1 — Customers & master data:** areas, routes, products management; customer CRUD with
  dated rate history (`rateService.getRateFor`); opening balances via `ledger_entries`;
  materialised `customer_balances` + recalculate; CSV/Excel import with column mapping and
  all-or-nothing commit; bulk rate change; Ctrl+K customer search; ~200-customer dev seed.

### Dependencies

- Added `xlsx`, `@tanstack/react-table`, `@tanstack/react-virtual` for import/export and list
  virtualisation (noted in `PROGRESS.md`).

### Fixed

- **Phase 1 review:** join-based customer list (NFR-02); full Master Data / customer /
  bulk-rate UI; openings/schedules no longer hard-deleted; `deposit_received` ledger;
  full audit before/after + export audit; monthly_package import columns; WhatsApp E.164;
  Ctrl+K Enter prefers customers; closed-period rate confirm.
- **Customer list filters:** selecting “All statuses/types” (or clearing a filter) no longer
  blanks the table — empty select values are omitted instead of sent as `""` to Zod.
- **CI Linux publish:** attach AppImage/deb via `gh release upload` then undraft (avoids
  softprops duplicate-tag failure).
- **Windows packaged install:** frozen identity check failed with
  `package.json name must be "aqua-nuqi" (frozen). Found ""` because the app looked for
  `package.json` in the wrong folder under `resources/`. Resolve from the app root and always
  include `package.json` in the installer payload.

### Changed

- Phase 0B review hardening: draft-until-Linux publish, separate stable concurrency, quality runs
  `npm run build`, release notes ignore stale `[Unreleased]` on dig builds.

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
