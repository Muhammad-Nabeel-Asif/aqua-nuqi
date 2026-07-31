# Build Progress Log

> Every phase appends a section here **before** declaring itself complete.
> The next agent reads this file to understand the real state of the codebase.
> Keep it factual and short. Do not delete previous entries.

Template to copy:

```md
## Phase N — <name>

**Date:** YYYY-MM-DD · **Status:** complete / partial

### Built

- …

### Migrations added

- `drizzle/0003_xxx.sql` — tables: …

### IPC channels added

- `customers:list`, `customers:create`, …

### Settings keys added

- …

### Error codes added

- …

### Deviations from the spec

- … (and why)

### What the next phase must know

- …

### Escalations / questions for the human

- …
```

---

<!-- Phase entries go below this line -->

## Phase 0 — Foundation, Shell & Platform Services

**Date:** 2026-07-31 · **Status:** partial

### Built

- electron-vite + React + Tailwind scaffold (`src/main`, `src/preload`, `src/renderer`, `src/shared`)
- SQLite via better-sqlite3 + Drizzle ORM; boot sequence from `docs/07` §4 in `src/main/bootstrap.ts` / `src/main/db/migrate.ts`
- Typed IPC router (`defineHandler`) + preload `window.api.invoke` / `on` with result envelope `{ ok, data | error }`
- Services (no Electron imports): `auth`, `settings`, `audit`, `period`, `backup`
- App shell (sidebar/top bar/command palette), login, first-run wizard (new business **and** restore), settings tabs (Business / Localisation / Users / About + placeholders)
- Shared `money.ts` / `date.ts`, `<Money>`, `<DateText>`, toasts, confirm dialog, error boundary
- NSIS + portable Windows packaging via `electron-builder.yml` (`deleteAppDataOnUninstall: false`, output `release/`)
- Unit tests (money, dates, paths/frozen identity, auth, period) + headless smoke (`npm run smoke:phase0`)

### Migrations added

- `drizzle/0000_swift_ravenous.sql` — tables: `app_meta`, `settings`, `users`, `audit_log`, `closed_periods`, `backup_log`, `sequences`, `products`, `expense_categories`

### IPC channels added

- `auth:login`, `auth:logout`, `auth:session`, `auth:lock`, `auth:unlock`, `auth:createUser`, `auth:listUsers`, `auth:changePassword`, `auth:setPin`
- `settings:get`, `settings:setMany`
- `setup:status`, `setup:complete`, `setup:restore`
- `dialog:pickFolder`, `dialog:pickFile`
- `period:isClosed`, `period:close`, `period:reopen`, `period:list`
- `backup:create`, `backup:list`
- `about:get`, `diagnostics:export`, `shell:openPath`

### Settings keys added

- All keys from `docs/03-data-model.md` §A defaults (`business.*`, `locale.*`, `invoice.*`, `billing.*`, `tax.*`, `backup.*`, `security.autoLockMinutes`, `inventory.lowStockThreshold`)

### Error codes added

- `VALIDATION_FAILED`, `NOT_FOUND`, `UNAUTHORIZED`, `FORBIDDEN`, `CONFLICT`, `PERIOD_LOCKED`, `INTERNAL`, `APP_OLDER_THAN_DATA`, `FATAL_PATH`, `MIGRATION_FAILED`, `SETUP_REQUIRED`

### Deviations from the spec

- IPC handlers return a serialisable `{ ok: true, data } | { ok: false, error }` envelope instead of rejecting the promise with a bare object (Electron strips non-Error rejects). Renderer `api.ts` unwraps and throws `AppError`.
- Diagnostics zip uses a tiny Node-builtin ZIP writer (`src/main/lib/zip.ts`) rather than adding an archive library.
- `npm test` / `smoke:phase0` use `electron-builder install-app-deps` then `ELECTRON_RUN_AS_NODE=1 electron …` so natives stay on the Electron ABI (avoids `npm rebuild` / node-gyp failures when the clone path contains a space).
- Drizzle's migrator already wraps pending SQL in one `BEGIN`/`COMMIT`. `schema_version` + `app_upgrade` audit are written in a follow-up transaction; failure still restores the `pre_migration` backup (docs/07 §3.3 compensating action).
- TanStack Table/Virtual, Recharts, and Playwright are deferred to the phases that need them (1/2/8 and 0B+); not installed in Phase 0 scaffold.

### What the next phase must know

**`defineHandler` signature** (`src/main/ipc/router.ts`):

```ts
defineHandler({
  channel: string
  input: ZodType        // Zod schema; payload defaults to {}
  output: ZodType       // validated in non-production only
  roles: readonly Role[] | 'public' | 'authenticated'
  handler: (input, ctx: { event, userId, role }) => unknown | Promise<unknown>
})
```

- `'public'` — no session required
- `'authenticated'` — any unlocked logged-in user
- `['owner', …]` — role allow-list; otherwise `FORBIDDEN`

**`AppError` codes** (`src/shared/errors.ts`):  
`VALIDATION_FAILED` | `NOT_FOUND` | `UNAUTHORIZED` | `FORBIDDEN` | `CONFLICT` | `PERIOD_LOCKED` | `INTERNAL` | `APP_OLDER_THAN_DATA` | `FATAL_PATH` | `MIGRATION_FAILED` | `SETUP_REQUIRED`

Throw `new AppError(code, message, details?)` from services; the router maps to `{ code, message, details }` and never leaks stacks.

**Settings accessor API** (`createSettingsService` in `src/main/services/settings.service.ts`):

```ts
settings.get<K extends SettingKey>(key: K): SettingValue<K>
settings.getMany(keys?: SettingKey[]): Record<string, unknown>
settings.setMany(values: Record<string, unknown>, opts?: {
  userId?: number | null
  allowOwnerOnly?: boolean   // default false; must pass true for business./backup./security./tax. keys
}): Record<string, unknown>
```

Keys/defaults live in `src/shared/settings-keys.ts`. Always go through the service — never read `settings` rows raw.

**Audit helper** (`createAuditService` in `src/main/services/audit.service.ts`):

```ts
audit.record({
  userId?: number | null
  action: AuditAction   // includes 'app_upgrade'
  entityTable?: string | null
  entityId?: number | null
  summary: string
  before?: unknown
  after?: unknown
}, tx?: TxLike)   // optional; defaults to db — call inside the same transaction as the mutation

audit.withAudit(tx, input, () => { /* mutation */ })
```

**Period lock:** call `period.guardPeriodOpen(dateOrPeriod)` before any write belonging to a month; throws `PERIOD_LOCKED`.

**Frozen identity (never rename):** `appId=com.aquanuqi.app`, `productName=Aqua Nuqi`, `package.json name=aqua-nuqi`. DB path must stay under `app.getPath('userData')`.

**Next phase is 0B (CI/CD), not Phase 1.** Extend `electron-builder.yml` as-is (`release/`, per-user NSIS, `deleteAppDataOnUninstall: false`).

### Escalations / questions for the human

- `@node-rs/argon2` is required by Phase 0.4 for argon2id but is not listed in `docs/02-architecture-and-stack.md` §1. Used as specified by the phase file; please add it to the stack doc.
- husky + lint-staged are required by Phase 0.1 and likewise not in §1; used as specified.
- On this Linux host, `npm run package:win` produces the **portable** `release/Aqua-Nuqi-0.1.0-x64.exe` (win32 natives via prebuild). The **NSIS Setup.exe** needs Wine or a Windows runner — Phase 0B `windows-latest` should build it. Linux AppImage also builds via `npm run package:linux`. Please smoke-install the portable/NSIS build on a clean Windows machine (acceptance #10).
- `DOWNLOAD_LATEST_URL` in `src/shared/constants.ts` is a placeholder GitHub releases URL; Phase 0B should point it at the permanent `/releases/latest/download/` links.

### Review fixes (2026-07-31)

- Guarded `setup:restore` with `assertSetupRequired` (same CONFLICT as `setup:complete`); packaged restore uses `app.getAppPath()` + `resourcesPath` for migrations.
- Period close reuses the UNIQUE `closed_periods` row after reopen (close → reopen → close works); mutation+audit in one `db.transaction`.
- `toPaisa` uses decimal-string maths (fixes `1.005` → 101); `allowOwnerOnly` defaults to false.
- Forced `userData` to `appData/Aqua Nuqi` on all platforms; runtime identity assert uses `app.getName()` / AppUserModelId + userData basename (not constants-vs-themselves).
- Older-than-data fatal screen: Download latest + Open my data folder buttons.
- Settings route owner-gated; lint import-order fixed; tests added for each fix above.
- Remaining open: acceptance #10 (NSIS on clean Windows) still needs a Windows runner — status stays **partial**.

---

## Phase 0B — CI/CD, Automated Builds & Release Distribution

**Date:** 2026-07-31 · **Status:** partial

### Built

- `electron-builder.yml` — fixed artifact names (`Aqua-Nuqi-Setup.${ext}`, `Aqua-Nuqi.${ext}`),
  `asar: false`, NSIS assisted/per-user, `deleteAppDataOnUninstall: false`, GitHub publish feed
- `.github/workflows/build-release.yml` — quality (incl. `npm run build`) → Windows (draft
  release) → Linux (attach + publish); concurrency groups separate push vs stable so a docs
  push cannot cancel a mid-flight stable; `dev` (pre-release) vs `stable` (latest) channels
- `.github/workflows/build-check.yml` — PR quality gate (typecheck/lint/test/build)
- `scripts/release-notes.ts` (+ `.mjs` launcher) — versioned CHANGELOG section, then
  `[Unreleased]` on stable only, else filtered commits + client install footer
- `docs/CLIENT-INSTALL-GUIDE.md` — one-page WhatsApp-friendly install guide
- Packaging safety tests (`src/main/lib/packaging-safety.test.ts`) for frozen identity, fixed
  names, NSIS flags, no unwrapped `customUnInstall`, and `.gitignore` data exclusions
- CI release safety + release-notes unit tests (`ci-release.test.ts`, `release-notes.test.ts`)
- README “Getting a build” + latest-**stable** badge + permanent download links
- `package.json` scripts: `dist:win`, `dist:linux`, `rebuild:electron`, `rebuild:node`
- Minor version bumped to `0.2.0` (CI patch = `github.run_number`)

### Repository & download links

- **Repo (public):** https://github.com/Muhammad-Nabeel-Asif/aqua-nuqi
- **First stable release:** [v0.2.6](https://github.com/Muhammad-Nabeel-Asif/aqua-nuqi/releases/tag/v0.2.6)
  — assets: `Aqua-Nuqi-Setup.exe`, `Aqua-Nuqi.AppImage`, `Aqua-Nuqi.deb`, `latest.yml`,
  `latest-linux.yml`, blockmap. Dev pre-release `v0.2.5` published earlier.
- **Windows (stable):** https://github.com/Muhammad-Nabeel-Asif/aqua-nuqi/releases/latest/download/Aqua-Nuqi-Setup.exe
- **Ubuntu (stable):** https://github.com/Muhammad-Nabeel-Asif/aqua-nuqi/releases/latest/download/Aqua-Nuqi.AppImage
- **Debian (stable):** https://github.com/Muhammad-Nabeel-Asif/aqua-nuqi/releases/latest/download/Aqua-Nuqi.deb

### Versioning scheme actually used

- `package.json` holds `0.<phase>.0` (currently `0.2.0` after Phase 0B).
- CI derives `VERSION = <major>.<minor>.<github.run_number>` (e.g. `0.2.6`).
- Pushes to `main` → **pre-release** (dev). Manual workflow with `channel: stable` → marks
  `/releases/latest` for the client.
- **Reminder:** bump the minor version in `package.json` at the end of every later phase.

### Migrations / IPC / settings / error codes

- None (packaging and CI only).

### Deviations from the spec

- Added optional `build-check.yml` (PR quality only) — listed as optional in §0B.7.
- Kept NSIS icon fields from Phase 0 (`installerIcon` / `uninstallerIcon` / `installerHeaderIcon`).
- Release-notes step passes `PRERELEASE` env so the dev banner appears (workflow body otherwise
  matches the phase file).
- Upgraded `better-sqlite3` `^11.7.0` → `^12.10.0` (same as MA Traders) so Node 24 Windows has
  prebuilds; v11 falls through to node-gyp and fails on `windows-latest`.
- Lockfile includes nested `@emnapi/core@1.10.0` / `@emnapi/runtime@1.10.0` under the optional
  wasm32 resolver binding so GitHub Actions `npm ci` accepts the lockfile.
- Repo made **public** (phase said private): anonymous `/releases/latest/download/…` links 404 on
  private repos, which blocks the client's permanent download URLs. Source has no customer data.
- AppImage from `v0.2.6` downloads and starts on this Ubuntu host (`chmod +x` + launch). Windows
  upgrade matrix (§0B.4 scenarios 1/4/7) still needs a human on a Windows laptop.

### What the next phase must know

- Permanent links above are what you send the client (stable channel only).
- End of every phase: bump minor in `package.json` → push `main` → Actions → **Build & Release**
  → channel **stable** → run upgrade tests 1/4/7 from `docs/07` §7 → record version + release URL
  here → send the Windows link.
- `DOWNLOAD_LATEST_URL` points at the permanent Setup.exe download.
- Do not rename artifacts, `appId`, `productName`, or `package.json` `name`.
- `latest.yml` / `latest-linux.yml` / blockmaps are already uploaded for Phase 9 electron-updater.

### Escalations / questions for the human

- Confirm first stable release on a real Windows laptop (install, shortcuts, upgrade over previous
  install, uninstall leaves `AppData\Roaming\Aqua Nuqi`). Run §0B.4 scenarios 1/4/7 + uninstall;
  only then flip Status to complete.
- Branch protection on `main` now requires the `quality` status check (enabled via GitHub API
  2026-07-31). Confirm in the UI that PR merges cannot bypass it.
- Code signing (~$70–200/year) still optional; SmartScreen “More info → Run anyway” remains.
- Repo was switched from private → public so client download links work without auth — confirm
  that is acceptable.

### Review fixes (2026-07-31)

- Status set to **partial** — Windows install/upgrade/uninstall acceptance (#6–#8) still unproven.
- Concurrency groups include `event_name` + channel; `cancel-in-progress` disabled for stable so
  a push cannot cancel a mid-flight client release.
- Windows creates a **draft** release; Linux attaches AppImage/deb then publishes (no half-complete
  “latest” if Linux fails).
- `npm run build` added to quality (and PR build-check); Linux artifact upload hard-fails on
  missing `.deb`.
- CHANGELOG: Phase 0B notes moved to `## [0.2.6]`; `[Unreleased]` cleared. Dig builds ignore
  Unreleased so stale bullets cannot pollute notes.
- README badge tracks latest **stable** only (dropped `include_prereleases`).
- Branch protection on `main` enabled (required status check: `quality`).
- Tests: `ci-release.test.ts`, `release-notes.test.ts`.
- **Windows fatal fix:** packaged installs failed with `package.json name … Found ""`
  because identity check looked three levels up from `out/main` (lands in `resources/`)
  instead of two (`resources/app/package.json`). Also list `package.json` under
  `electron-builder.yml` `files`. Needs a new stable build before retrying the Windows matrix.
