# Phase 9 — Backup & Restore, Audit, Hardening and Release

**Goal:** make the app safe to depend on for years. The client's entire business record will live
in one file on one laptop. Losing it must be impossible in practice.

**Depends on:** all previous phases. **Blocks:** nothing — this ships the product.

Read `AGENT-BRIEF.md` first.

---

## Scope

Requirements: FR-SY-03…07, FR-SY-10…15, plus final polish.

### 9.1 Full backup system — `/settings/backup`
Upgrade Phase 0's minimal service.

- **What a backup contains**: the SQLite database (via `VACUUM INTO`, so it is consistent even
  with WAL active) **plus** the attachments folders (expense receipts, employee photos, logo).
  Package them into a single `.zip` named
  `aquanuqi-backup-<YYYYMMDD-HHmm>-<kind>.zip` with a `manifest.json` inside recording app
  version, schema version, row counts per table, and a SHA-256 of the database file.
- **Schedules**: on app exit, daily (at a configurable time or on first launch of the day), and
  weekly. Each independently toggleable.
- **Retention**: keep the last N daily and M weekly backups; prune older ones, but never prune the
  most recent successful backup and never prune `pre_migration` / `pre_restore` backups.
- **Destinations**: primary folder plus an optional secondary folder (external drive or a
  Google Drive / OneDrive desktop-sync folder). If the secondary destination is unavailable, log a
  warning, do not fail the backup, and surface it in the UI.
- **Optional encryption**: password-protected zip (AES). If enabled, warn loudly that a lost
  password means unrecoverable backups, and require the password to be entered twice plus a
  confirmation checkbox.
- **UI**: backup list (date, kind, size, destination, status), "Backup now", "Open folder",
  "Verify backup" (checks the archive and the checksum), storage used, next scheduled backup, and
  a large freshness indicator.
- **Freshness chip** in the top bar (FR-SY-05), red when the last successful backup is older than
  the configured interval, clicking it opens this screen.
- Backup runs must not block the UI — run in a `utilityProcess` or worker, with progress events.

### 9.2 Restore
- Wizard: choose a backup file (or pick from the list) → the app validates the manifest and
  checksum and shows what it contains (date, app/schema version, row counts) → **takes a
  `pre_restore` backup of the current data** → closes the database → replaces the database and
  attachments → runs any pending migrations → restarts the app.
- If the backup's schema version is newer than the app's, refuse and tell the user to update the
  app first.
- Requires typing the word `RESTORE` to confirm, is owner-only, and is audit-logged (the log entry
  survives because it is written to the pre-restore snapshot and re-appended after restart).
- Also support "Restore to a new location for inspection" — open a backup read-only without
  touching live data. Very useful for "what did this customer's balance look like in March".

### 9.3 Data integrity tools — Settings → Maintenance
- **Integrity check**: `PRAGMA integrity_check`, `PRAGMA foreign_key_check`, plus business-rule
  checks — ledger `balance_after` chain consistency, `customer_balances` vs aggregates, stock
  movements vs `bottles_with_customer`, invoices with no lines, deliveries pointing at void
  invoices, orphaned attachments. Produce a report with a "Fix" action where a fix is safe
  (recalculate balances, rebuild summaries) and a clear explanation where it is not.
- **Compact database** (`VACUUM`) with before/after size.
- **Rebuild all summary tables**.
- Show DB size, row counts per table, oldest and newest transaction dates.

### 9.4 Audit log viewer — `/settings/audit`
- Filters: date range, user, action, entity type, free-text on the summary.
- Row expansion shows a readable before/after diff (field, old value, new value) — not raw JSON.
- Export to Excel/PDF.
- Retention setting (default: keep everything; optional archive of entries older than N years into
  a separate file before deletion).
- Owner-only.

### 9.5 Users & security — Settings → Users
- Full user management: create, edit, deactivate, reset password, set/clear PIN, force logout.
- Password policy: minimum 8 characters; strength meter; no plaintext anywhere, ever.
- Failed-login throttling (progressive delay after 5 failures) and an audit entry.
- Auto-lock configuration, and lock-on-minimise option.
- A "there must always be at least one active owner" guard.
- Optional: a recovery code generated at setup and shown once, allowing an owner password reset.
  Without it, the only recovery is a backup — state this in the setup wizard.

### 9.6 Settings completion (FR-SY-10)
Consolidate every settings tab: Business profile, Localisation, Invoice & documents, Billing
defaults, Master data (areas, routes, products, expense categories), Payroll basis, Backup,
Users & security, Maintenance, About. Each with inline help text.

### 9.7 In-app auto-update (FR-SY-11)
The build pipeline and release feed already exist from **Phase 0B**, which publishes
`latest.yml`, `latest-linux.yml` and the blockmaps alongside the installers. This section only
wires the app to that feed — **do not rebuild the pipeline here**.

- `electron-updater` pointed at the GitHub Releases provider configured in Phase 0B.
- Subscribe to the **stable** channel only. Pre-release dev builds must never be offered to the
  client's machine.
- Check on startup and via a manual "Check for updates" button; download in the background;
  prompt to install on quit.
- **Always take a backup before applying an update**, and surface the pre-migration backup that
  Phase 0's migration runner takes on first launch of the new version.
- Show the Phase 0B release notes in the update prompt.
- If the laptop is offline or the check fails, fail silently, log it, and never block startup.
- Add a settings toggle: automatic updates on/off, defaulting to on.

### 9.8 Error handling, logging, support (FR-SY-13)
- A friendly error screen for fatal errors with the error code, a "Copy details" button, and
  "Export diagnostics".
- Rotating logs (keep 14 days), never logging personal data or password hashes.
- "Export diagnostics" produces a zip with logs, the settings dump (secrets redacted), schema
  version, row counts and the last 200 audit entries — **not** the database.
- An in-app "Report a problem" that just prepares that zip and opens the containing folder.

### 9.9 Onboarding & help
- A short first-run tour highlighting: enter today's deliveries, add a customer, generate bills,
  record an expense, check backups.
- A Help page with a one-page workflow guide ("How a normal month works: enter deliveries daily →
  record payments → generate bills at month end → close the period → check profit"), keyboard
  shortcut list, and FAQ.
- Sample-data mode the owner can switch on to practise, and a clean "Clear sample data" action.

### 9.10 Release hardening & handover
The build and publish pipeline was built in **Phase 0B** and has been in daily use since. This
section is the final polish before declaring v1.0, not a rebuild.

- Bump to **1.0.0** in `package.json`, finalise `docs/CHANGELOG.md`, and cut a **stable** release.
- Add a **portable build** target for a USB stick (new; Phase 0B only produced installers).
- Confirm the uninstaller keeps the data folder, and add an explicit "also delete my data"
  checkbox that is **unticked** by default.
- Code signing if a certificate has been purchased; if not, verify the SmartScreen instructions in
  `docs/CLIENT-INSTALL-GUIDE.md` are still accurate and add screenshots.
- Test on clean Windows 10 **and** Windows 11 VMs: install, first run, restore a backup taken on
  another machine, apply an auto-update, uninstall, reinstall, data intact.
- A written **handover document** for the client: where the data lives, where backups go, how to
  restore, how to move to a new laptop, how updates arrive, and what to do if the laptop dies.

### 9.11 Final QA pass
- Full end-to-end scenario test: 2 months of operation with 50 customers — deliveries, payments,
  adjustments, invoices, expenses, payroll, trips, period close, reports, backup, restore, verify
  every number still matches.
- Performance test at 1,000 customers × 3 years.
- Keyboard-only walkthrough of the daily workflow.
- Check every screen at 1366×768 and at 125% Windows display scaling.
- Verify the app works with the system clock changed (month rollover) and across a DST-free
  timezone change.

---

## Acceptance criteria

1. A backup created on machine A restores completely on machine B, including attachments, with
   identical row counts and identical report numbers.
2. Killing the app during a backup leaves no corrupt file and the next backup succeeds.
3. Restoring takes a pre-restore snapshot first, and cancelling midway leaves the live data intact.
4. Deleting the database file and restoring from the most recent backup loses at most one day of
   data with default settings.
5. The freshness chip turns red when the last backup is older than the configured interval.
6. Integrity check detects a deliberately corrupted `customer_balances` row and its Fix action
   repairs it.
7. The audit log shows a readable before/after diff for a delivery edit, an invoice void, a rate
   change and a payroll finalisation.
8. Five failed logins introduce a delay and are logged; the last active owner cannot be
   deactivated.
9. The installer installs without admin rights on a clean Windows 11 VM, and uninstalling keeps
   the data folder by default.
9b. An in-app auto-update from the previous stable release downloads, installs on quit, runs
   migrations, and leaves all data intact — and a pre-release dev build is never offered.
10. The end-to-end scenario in §9.11 produces the same numbers before backup and after restore.
11. `typecheck`, `lint`, `test`, `build` pass; `PROGRESS.md` and `CHANGELOG.md` finalised.

## Handover checklist
- [ ] Installer + portable build delivered
- [ ] Handover document (data location, backup, restore, new laptop migration)
- [ ] Client trained on: daily entry, month-end billing, expenses, backups
- [ ] Backup destination configured on the client's machine, including an external drive or a
      cloud-synced folder
- [ ] Real opening data loaded (customers, opening balances, opening bottles, opening stock)
- [ ] Owner password set by the client, recovery code stored somewhere safe
- [ ] Support arrangement agreed (how bugs are reported, response expectations)
