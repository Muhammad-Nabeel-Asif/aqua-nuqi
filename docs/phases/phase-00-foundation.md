# Phase 0 — Foundation, Shell & Platform Services

**Goal:** a running, packaged, empty-but-real application. No business features yet, but every
cross-cutting mechanism that later phases depend on must exist and be proven to work.

**Depends on:** nothing. **Blocks:** everything.

Read `AGENT-BRIEF.md` first.

---

## Scope

Requirements covered: FR-SY-01, FR-SY-02, FR-SY-07 (infrastructure), FR-SY-08 (infrastructure),
FR-SY-09, FR-SY-13, NFR-05, NFR-06, NFR-07.

### 0.1 Project scaffold
- Initialise the repository with the exact stack and folder structure from
  `02-architecture-and-stack.md` §1 and §3.
- `electron-vite` project with three entry points (main, preload, renderer), TypeScript `strict`.
- Path aliases: `@main/*`, `@shared/*`, `@renderer/*`.
- ESLint + Prettier + a pre-commit hook (lint-staged) .
- Scripts: `dev`, `build`, `start:prod`, `typecheck`, `lint`, `test`, `db:generate`, `db:migrate`,
  `package:win`.
- `electron-builder.yml` producing an NSIS installer and a portable exe for Windows x64, with app
  id, product name "Aqua Nuqi", icon, and per-user install (no admin rights).
- Verify `better-sqlite3` native module rebuilds correctly for the packaged Electron version.

### 0.2 Database layer
- `src/main/db/client.ts`: open SQLite at `<userData>/data/aqua-nuqi.db`, apply the pragmas from
  §5 of the architecture doc, export a Drizzle instance.
- Drizzle schema files + `drizzle-kit` config; migrations output to `drizzle/`.
- `migrate.ts`: at boot, take a pre-migration backup, run pending migrations in a transaction,
  record `schema_version` in `app_meta`. On failure, restore the backup and show a fatal-error
  window with instructions.
- **Implement the boot sequence in `docs/07-data-lifecycle-and-upgrades.md` §4 exactly.** It is
  short, and every step of it exists because of a specific way client data gets destroyed. In
  particular:
  - Assert the resolved database path is under `app.getPath('userData')` and **not** inside the
    install directory or `process.resourcesPath` — fatal error if it is.
  - Assert `appId`, `productName` and `package.json` `name` match frozen constants — fatal error
    if not. These values must never change after the first stable release, because `userData` is
    derived from them and renaming makes all the client's data appear to vanish.
  - If `app_meta.schema_version` is **higher** than the highest migration bundled in the running
    build, **refuse to open the database** and show the "this app is older than your data" screen
    (§3.4). Never migrate downwards.
  - Record every successful upgrade as an `audit_log` entry with action `app_upgrade` and a
    summary like `Upgraded 0.6.12 → 0.9.31, schema 14 → 19`. Add `'app_upgrade'` to the
    `audit_log.action` CHECK constraint.
  - Pre-migration backups must be exempt from retention pruning.
- Create tables in this phase (from `03-data-model.md` §A): `app_meta`, `settings`, `users`,
  `audit_log`, `closed_periods`, `backup_log`, `sequences`.
- `seed.ts`: default settings values, default expense categories, the default `19 L Bottle`
  product row and its table (create `products` here too so seeding is not split across phases).
- A dev-only `db:reset` script.

### 0.3 IPC framework
- `preload/index.ts` exposing `window.api.invoke(channel, payload)` and `window.api.on(...)`
  with `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
- `main/ipc/router.ts`: a `defineHandler({ channel, input, output, roles, handler })` helper that
  registers the channel, validates input with Zod, checks the session role, catches errors and
  maps them to `{ code, message, details }`.
- `AppError` class with a typed code union. Initial codes: `VALIDATION_FAILED`, `NOT_FOUND`,
  `UNAUTHORIZED`, `FORBIDDEN`, `CONFLICT`, `PERIOD_LOCKED`, `INTERNAL`.
- `renderer/lib/api.ts`: typed client. A thin generated-by-hand object mapping domains to channels.
- TanStack Query provider with sensible defaults (no window-focus refetch, 30 s stale time).

### 0.4 Auth & session
- `auth.service.ts`: create user, verify password (argon2id via `@node-rs/argon2` or bcrypt),
  login, logout, change password, set PIN.
- Session held in the main process (single active session object), not in the renderer.
- Roles `owner` / `operator` / `viewer` enforced by the IPC router.
- Login screen; auto-lock overlay after `security.autoLockMinutes` of no input; unlock with
  password or PIN.
- Login/logout events go to the audit log.

### 0.5 Settings service
- Typed get/set over the `settings` table with defaults from `03-data-model.md` §A.
- `settings:get`, `settings:setMany` channels (owner only for business/backup/security groups).
- Settings UI shell with tabs: **Business profile**, **Localisation**, **Users**, **About**.
  (Invoice, Backup, Master data tabs are added by later phases — leave placeholders.)

### 0.6 Audit service
- `auditService.record({ userId, action, entityTable, entityId, summary, before, after })`,
  callable inside an existing transaction.
- A helper `withAudit(tx, ...)` used by later services.
- No UI yet beyond a raw list in Settings → About (the full viewer is Phase 9).

### 0.7 Period lock service
- `periodService.isClosed(period)`, `guardPeriodOpen(dateOrPeriod)` throwing `PERIOD_LOCKED`,
  `close(period)`, `reopen(period, reason)` (owner only, audit-logged).
- No UI yet beyond owner-only close/reopen buttons in Settings → About.

### 0.8 Minimal backup service (full version in Phase 9)
- `backupService.createBackup(kind)` using `VACUUM INTO '<path>'` for a consistent snapshot,
  writing a `backup_log` row with size and SHA-256 checksum.
- Called automatically before migrations and on app exit.
- Backup folder default `<userData>/backups`, configurable.

### 0.9 App shell UI
- Layout from `04-ui-ux-guidelines.md` §1: top bar, collapsible sidebar, content area.
- Routes registered for all future screens rendering an "Coming in Phase N" placeholder so
  navigation is testable.
- Dashboard placeholder with static cards.
- Global toast system, confirm-dialog helper, error boundary, `<Money>` component,
  `<DateText>` component, page-header component, empty-state component, skeletons.
- Command palette (Ctrl+K) shell with navigation entries only.

### 0.10 First-run wizard
- Detects an empty database and offers **two paths**:
  1. **Set up a new business** — welcome → business profile → currency/date format →
     data & backup folder → create owner account → done.
  2. **Restore from a backup** — pick a backup file, restore it, run pending migrations, continue.
- Path 2 is not optional and is not a Phase 9 feature. It is how the client moves to a new laptop
  (`docs/07-data-lifecycle-and-upgrades.md` §6). Without it he is stranded when his laptop dies.
  Phase 0 only needs to restore the database file produced by `backupService`; Phase 9 extends it
  to the full zip with attachments.
- Cannot be skipped; writes settings and the first user, then logs in.

### 0.11 Logging & diagnostics
- `electron-log` with rotating files in `<userData>/logs`.
- Global handlers for `uncaughtException` and `unhandledRejection`.
- Settings → About shows app version, schema version, DB path, DB size, and an
  "Export diagnostics" button that zips logs + a redacted settings dump to a chosen folder.

---

## Out of scope for this phase
Customers, deliveries, invoices, expenses, employees, inventory, reports, PDFs, auto-update.

## Acceptance criteria

1. `npm run dev` opens the app; a fresh profile shows the first-run wizard.
2. Completing the wizard creates the database, the owner user, and logs in.
3. Restarting the app shows the login screen; wrong password is rejected; correct password enters.
4. Leaving the app idle past the auto-lock timeout locks the screen.
5. Creating an `operator` user and logging in as them hides owner-only sidebar items, and calling
   an owner-only IPC channel from the console returns a `FORBIDDEN` error rather than data.
6. Sending an invalid payload to any channel returns `VALIDATION_FAILED` and does not crash.
7. `npm run db:migrate` on an older database applies migrations and leaves a pre-migration backup
   file on disk with a `backup_log` row, plus an `app_upgrade` audit entry.
7b. Manually setting `app_meta.schema_version` above the bundled maximum makes the app refuse to
   open the database and show the "this app is older than your data" screen, leaving the file
   unmodified.
7c. Pointing the database path at the install directory triggers a fatal startup error.
7d. The first-run wizard's "Restore from a backup" path produces a working app with the restored
   data.
8. Closing the app creates a backup file; `VACUUM INTO` output opens correctly in a SQLite viewer.
9. Closing period `2026-06` then calling `guardPeriodOpen('2026-06-15')` throws `PERIOD_LOCKED`.
10. `npm run package:win` produces an installer that installs and runs on a clean Windows machine
    with no admin rights and no external runtime.
11. `typecheck`, `lint`, `test`, `build` all pass.
12. `PROGRESS.md` and `CHANGELOG.md` updated.

## Notes for the next phase
Record in `PROGRESS.md`: the exact `defineHandler` signature, the `AppError` code list, the
settings accessor API, and the audit helper signature — Phase 1 will use all four immediately.

**The next phase is 0B (CI/CD), not Phase 1.** Phase 0B turns the local `package:win` result into
an automated pipeline producing Windows and Ubuntu installers on every push. Leave
`electron-builder.yml` in a state that is easy to extend: per-user NSIS install, output to
`release/`, and **`deleteAppDataOnUninstall: false`** already set — the client's data must never be
removable by an installer.
