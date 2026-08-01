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

**Date:** 2026-07-31 · **Status:** complete

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
- **Current stable (Windows-tested):** [v0.2.11](https://github.com/Muhammad-Nabeel-Asif/aqua-nuqi/releases/tag/v0.2.11)
  — assets: `Aqua-Nuqi-Setup.exe`, `Aqua-Nuqi.AppImage`, `Aqua-Nuqi.deb`, `latest.yml`,
  `latest-linux.yml`, blockmap. Includes packaged `package.json` identity fix.
- **Windows (stable):** https://github.com/Muhammad-Nabeel-Asif/aqua-nuqi/releases/latest/download/Aqua-Nuqi-Setup.exe
- **Ubuntu (stable):** https://github.com/Muhammad-Nabeel-Asif/aqua-nuqi/releases/latest/download/Aqua-Nuqi.AppImage
- **Debian (stable):** https://github.com/Muhammad-Nabeel-Asif/aqua-nuqi/releases/latest/download/Aqua-Nuqi.deb

### Windows upgrade matrix (2026-07-31)

| Check                                           | Result      |
| ----------------------------------------------- | ----------- |
| #6 Fresh install (no admin, shortcuts, launch)  | **PASS**    |
| #7 Upgrade over previous (data/settings intact) | **PASS**    |
| #4 Downgrade refusal (older-than-data screen)   | **PENDING** |
| #8 Uninstall leaves `AppData\Roaming\Aqua Nuqi` | **PASS**    |

- **Installer used:** stable **v0.2.11** (after Windows `package.json` identity fix).
- **Business name used:** Aqua Nuqi.
- **#4 note:** not exercised on-device. All current `0.2.x` builds share schema `1`, so installing
  an older build over a newer one will not hit `APP_OLDER_THAN_DATA` until a later phase ships a
  real migration. Unit coverage for refused downgrade remains; **re-run scenario 4 on Windows after
  the next schema-bumping phase.**

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
- AppImage from `v0.2.6` downloads and starts on this Ubuntu host (`chmod +x` + launch).
- Windows matrix run on a real laptop against **v0.2.11** (see table above). Scenario **#4**
  deferred until a schema-bumping release (same schema across current 0.2.x).

### What the next phase must know

- Permanent links above are what you send the client (stable channel only). Current latest is
  **v0.2.11**.
- End of every phase: bump minor in `package.json` → push `main` → Actions → **Build & Release**
  → channel **stable** → run upgrade tests 1/4/7 from `docs/07` §7 → record version + release URL
  here → send the Windows link.
- **After the first Phase 1+ migration:** re-run Windows scenario #4 (install older over newer →
  “older than your data” screen).
- `DOWNLOAD_LATEST_URL` points at the permanent Setup.exe download.
- Do not rename artifacts, `appId`, `productName`, or `package.json` `name`.
- `latest.yml` / `latest-linux.yml` / blockmaps are already uploaded for Phase 9 electron-updater.
- **Next phase is Phase 1 (Customers & master data).**

### Escalations / questions for the human

- Scenario #4 (downgrade refusal) still PENDING on Windows — retest after next schema migration.
- Code signing (~$70–200/year) still optional; SmartScreen “More info → Run anyway” remains.
- Repo was switched from private → public so client download links work without auth — confirm
  that is acceptable.

### Review fixes (2026-07-31)

- Concurrency groups include `event_name` + channel; `cancel-in-progress` disabled for stable so
  a push cannot cancel a mid-flight client release.
- Windows creates a **draft** release; Linux attaches AppImage/deb then publishes (no half-complete
  “latest” if Linux fails).
- `npm run build` added to quality (and PR build-check); Linux artifact upload hard-fails on
  missing `.deb`.
- CHANGELOG: Phase 0B notes moved to `## [0.2.6]`; dig builds ignore Unreleased so stale bullets
  cannot pollute notes.
- README badge tracks latest **stable** only (dropped `include_prereleases`).
- Branch protection on `main` enabled (required status check: `quality`).
- Tests: `ci-release.test.ts`, `release-notes.test.ts`.
- **Windows fatal fix (shipped in v0.2.11):** packaged installs failed with
  `package.json name … Found ""` because identity check looked three levels up from `out/main`.
  Resolve from app root; include `package.json` in `electron-builder.yml` `files`.
- Windows matrix recorded; Status → **complete** (with #4 deferred as above).

---

## Phase 1 — Customers, Master Data & Pricing

**Date:** 2026-07-31 · **Status:** complete · **package.json:** `0.3.0` · **stable:** [v0.3.21](https://github.com/Muhammad-Nabeel-Asif/aqua-nuqi/releases/tag/v0.3.21)

### Windows upgrade matrix (2026-08-01)

| Check                                                           | Result   |
| --------------------------------------------------------------- | -------- |
| Fresh install / upgrade over previous (data intact)             | **PASS** |
| #4 Downgrade refusal (older build over newer → older-than-data) | **PASS** |
| Uninstall leaves `AppData\Roaming\Aqua Nuqi`                    | **PASS** |

- **Installer tested:** stable **v0.3.17** (schema ≥2 via migrations 0001 + 0002).
- **Current stable (includes list-filter fix):** **v0.3.21**.
- **Windows (stable):** https://github.com/Muhammad-Nabeel-Asif/aqua-nuqi/releases/latest/download/Aqua-Nuqi-Setup.exe

### Built

- Migration `drizzle/0001_friendly_christian_walker.sql` — `areas`, `routes`, `customers`,
  `customer_rates`, `customer_schedules`, `customer_balances`, `ledger_entries`
- Migration `drizzle/0002_schedule_soft_delete.sql` — `customer_schedules.deleted_at`
- Services: `master-data`, `rate`, `balance`, `customer`, `customer-import`; demo seed
  `seed-demo.ts` (~200 customers / 6 areas / 10 routes) behind `dev:seedDemo`
- Settings → Master Data (areas / routes with area + reorder / products with full fields);
  Customers list (virtualised join-based list) + detail (overview, rate history, schedule,
  audit; delivery/ledger/invoice tabs placeholder)
- CSV/Excel import wizard (map → validate with row errors → all-or-nothing commit) + template
  including monthly_package columns
- Bulk rate change (area/route/type/current-rate filters, effective date, reason); Ctrl+K
  customer search; Recalculate balances on Settings → About
- Unit tests: rate history (criteria 3–4), bulk rollback, balances vs aggregate, import
  all-or-nothing + monthly_package, area deactivate blocked, list@1000, openings void,
  deposit ledger, audit before/after, export audit, schedule soft-delete

### Migrations added

- `drizzle/0001_friendly_christian_walker.sql` — tables above; `routes.default_employee_id`
  column **without** FK (employees arrive in Phase 6)
- `drizzle/0002_schedule_soft_delete.sql` — `customer_schedules.deleted_at`

### IPC channels added

- `areas:list|create|update`, `routes:list|create|update|reorder`, `products:list|create|update`
- `customers:list|get|nextCode|create|update|setStatus|bulkUpdate|search|audit|export`
- `customers:importParse|importValidate|importCommit|importTemplate`
- `rates:getFor|change|bulkChange|previewBulk`, `balances:recalculate`, `dev:seedDemo`

### Settings keys added

- None

### Error codes added

- None (reused `VALIDATION_FAILED`, `NOT_FOUND`, `CONFLICT`, `PERIOD_LOCKED`, `FORBIDDEN`)

### Deviations from the spec

- Added deps not in stack §1: `xlsx`, `@tanstack/react-virtual` (Excel import/export +
  virtualised list). `@tanstack/react-table` is in `package.json` but unused (list uses
  react-virtual only); kept for now per decision — may use later or drop in a cleanup pass.
- Money AR truth = `Σ ledger.debit − Σ ledger.credit` excluding `deposit_received` /
  `deposit_refunded` (those stay in the ledger for audit + `security_deposit_held`).
  Docs §J formula that also adds `customers.opening_balance` would double-count; column remains
  the go-live snapshot. Bottles = `opening_bottles` (+ deliveries/adjustments when those tables
  exist; Phase 2/3).
- `routes.default_employee_id` stored without FK until Phase 6.
- Opening edits append `void_reversal` + new `opening_balance` (never DELETE ledger rows).
  Schedules soft-clear via `deleted_at` (migration 0002).

### What the next phase must know

**`rateService.getRateFor` signature:**

```ts
rates.getRateFor(customerId: number, productId: number, onDate: string /* YYYY-MM-DD */): number // paisa
// Fallback: covering customer_rates row → products.default_rate
// Changing a rate closes the open row (effective_to = from − 1 day) and inserts a new row. Never UPDATE rate.
// forceClosedPeriod on changeRate / bulkChangeRate after UI confirm when PERIOD_LOCKED.
```

**`ledger_entries`:** created in this phase. Opening balance writes
`entry_type = 'opening_balance'` when non-zero. Non-zero security deposit writes
`deposit_received` (excluded from AR). Opening edits void via `void_reversal`.

**`customer_balances` sync:** created with the customer; updated in the same transaction as
opening/ledger changes via `balanceService.upsertSummary` / `syncFromSources`. Maintenance:
`balances.recalculate(customerId?)` (Settings → About). Unit test asserts summary ≡ live aggregate.

**Customer DTO shape** (`customerDto` in `src/shared/contracts/customers.ts`):

```ts
{
  ;(id,
    uuid,
    code,
    name,
    customerType,
    phonePrimary,
    phoneSecondary,
    whatsappNumber,
    email,
    addressLine,
    landmark,
    areaId,
    areaName,
    routeId,
    routeName,
    deliveryNotes,
    billingMode,
    packageAmount,
    packageIncludedQty,
    packageExcessRate,
    billingDay,
    creditLimit,
    securityDepositHeld,
    openingBottles,
    openingBalance,
    openingAsOf,
    status,
    pausedFrom,
    pausedTo,
    statusReason,
    joinedOn,
    notes,
    balance,
    bottlesWithCustomer,
    currentRate,
    schedule,
    createdAt,
    updatedAt)
}
// get also returns { rateHistory, openingsEditable }
```

- Default product `19 L Bottle` already seeded; list/create/edit under Master Data.
- Period lock applies to opening as-of and rate effective-from dates.
- **Next phase is Phase 2 (Deliveries).** Extend `balanceService.computeLiveBottles` once
  `deliveries` exists (already probes for the table). Snapshot rate onto each delivery via
  `rates.getRateFor(customerId, productId, deliveryDate)`.

### Escalations / questions for the human

- Confirm `xlsx` / TanStack Virtual (+ unused react-table kept for now) may be added to the
  stack doc.

### Review fixes (2026-08-01)

- Customer list: join + batched rates (no per-row `toDto`); NFR-02 list@1000 test.
- Master Data UI: product fields (size/kind/returnable/rate/deposit/stock); routes area +
  up/down reorder via `routes:reorder`.
- Customer form: identity/contact/billing/package/credit-limit/joining/status/delivery notes.
- List filters: has outstanding / holds bottles.
- Bulk rate UI: area/route/type/current-rate, effective-from + “1st of next month”, reason,
  `<Money>` preview; closed-period confirm → `forceClosedPeriod`.
- Ledger append-only: openings voided (not DELETE); schedules soft-deleted; deposit_received
  on create/edit; deposits excluded from AR.
- Audits: full customer before/after; per-id bulk audits; `export` action; master-data
  mutation+audit in one transaction.
- Import: `packageIncludedQty` / `packageExcessRate`; WhatsApp E.164 (`92…`); Ctrl+K Enter
  prefers customer hit.
- Linux release publish: `gh release upload` / `edit` (softprops draft:false tag race).
- Customer list filters: empty select option no longer sends `""` to Zod (list went blank when
  clearing / re-selecting “All …” filters).
- Stable **v0.3.17** Windows-tested; **v0.3.21** ships the filter fix; status → **complete**.

---

## Phase 2 — Delivery Tracking

**Date:** 2026-08-01 · **Status:** complete · **package.json:** `0.4.0` · **stable:** [v0.4.25](https://github.com/Muhammad-Nabeel-Asif/aqua-nuqi/releases/tag/v0.4.25)

### Built

- Migration `drizzle/0003_chubby_silhouette.sql` — `deliveries` (+ partial unique
  `uq_delivery_slot`), minimal `customer_adjustments` for damaged/lost (FR-DL-11)
- Service `delivery.service.ts`: `upsertDelivery`, `voidDelivery`, `getDayList`,
  `getMonthGrid`, `getCustomerCard`, `getDeliverySummary`, `copyFromPreviousDay`,
  `walkInSale`, `listBottlesOut`, `listMissedDeliveries`, `recordBottleLoss`,
  `exportMonthGrid`, `todaySummary`
- Screens: `/deliveries/daily`, `/deliveries/matrix`, `/deliveries/bottles-out`,
  `/customers/:id/card/:period` (+ Delivery card tab on customer detail); detail dialog;
  walk-in dialog; dashboard today summary + missed list
- Keyboard cell (`DeliveryQtyCell`): arrows / Enter / Tab / Esc, autosave, optimistic UI
- Dev seed extended with ~5 months of deliveries (2026-03 → 2026-07) + schedules
- Unit tests covering criteria 1–7, 9, invoice lock, package amount 0, walk-in, month grid

### Migrations added

- `drizzle/0003_chubby_silhouette.sql` — `deliveries`, `customer_adjustments`
  (`trip_id` / `employee_id` / `invoice_id` columns without FKs until Phases 3/6/7)
- `drizzle/0004_walk_in_slot_key.sql` — `deliveries.slot_key` + unique index includes slot

### IPC channels added

- `deliveries:upsert|void|get|getDayList|getMonthGrid|getCustomerCard|summary`
- `deliveries:copyPreviousDay|walkIn|bottlesOut|missed|recordLoss|exportMonthGrid|todaySummary`

### Settings keys added

- `deliveries.missedDaysThreshold` (default `10`)

### Error codes added

- `DELIVERY_INVOICED` — write rejected when `deliveries.invoice_id IS NOT NULL`

### Delivery DTO

```ts
{
  id, uuid, customerId, customerCode?, customerName?, productId,
  deliveryDate, quantity, emptiesCollected, rate, amount,
  isFree, freeReason, employeeId, tripId, cashCollected, notes,
  status: 'recorded' | 'void', voidReason, invoiceId,
  locked, periodClosed, createdAt, updatedAt, createdBy, updatedBy
}
```

### `getMonthGrid` response shape

```ts
{
  period, daysInMonth, periodClosed,
  rows: [{
    customerId, code, name, areaName, routeName, rate,
    cells: [{ day, quantity, emptiesCollected, amount, deliveryId, locked, hasNote, emptiesDiffer }],
    totalUnits, totalAmount, totalEmpties
  }],
  dayTotals: [{ day, totalUnits, totalAmount }],
  grandTotalUnits, grandTotalAmount
}
```

### How `invoice_id` locking is enforced

- On upsert / void / revive: if the existing row has `invoice_id != null`, throw
  `AppError('DELIVERY_INVOICED', …)`.
- UI cells set `locked` when `periodClosed || invoiceId != null` (read-only + lock marker).
- Invoices table arrives in Phase 3; until then `invoice_id` is a plain nullable integer
  (tests set it manually to verify the guard).

### Measured entry time (criteria 9) — PASS

- **Date:** 2026-08-01
- **Screen:** `/deliveries/daily` (real Electron BrowserWindow + built renderer)
- **Data:** `dev:seedDemo` equivalent via `seedDemoCustomers` — 200 customers / 10 routes;
  day list had **178** active non-walk-in customers
- **Filter:** none (all routes / all areas) — needed for ≥100 consecutive rows
- **Method:** keyboard only after focus on row 0 qty cell — digit `2` → **Enter** × 100
  via `webContents.sendInputEvent` (no mouse during the timed loop). Harness:
  `npm run timed:daily-entry` (`scripts/timed-daily-entry-ui.ts`)
- **Measured time:** **9.53 s (0.159 min)** for 100 consecutive customers — well under the
  4-minute hard gate
- Result artifact (local, gitignored): `docs/phases/.timed-daily-entry-result.json`

### Stock movements — deferred to Phase 7

- **This phase does NOT write `stock_movements` rows.** Phase 7 will create movements on
  new deliveries and ship a backfill that derives movements from historical `deliveries`.

### Deviations from the spec

- `customer_adjustments` created early (minimal) for FR-DL-11 damaged/lost bottle counts;
  no ledger / invoice effects yet (Phase 3). Phase 3 must **ALTER**, not recreate.
- Bottles-out lives at `/deliveries/bottles-out` for Phase 2; UI inventory route remains
  Phase 7 per screen inventory.
- Generated migration initially re-added `customer_schedules.deleted_at` (missing 0002
  snapshot); hand-removed that ALTER from `0003`.
- Employee selector on daily entry / detail is a disabled `TODO(phase-6)` stub until the
  employees module lands; `employee_id` column already persists when supplied.
- Walk-in sales use a per-sale `slot_key` (uuid) so multiple same-day cash sales coexist;
  regular customers keep `slot_key = ''` under `uq_delivery_slot`.

### What the next phase must know

- Snapshot rate via `rates.getRateFor` on **insert only**; updates keep original rate unless
  detail dialog override (tagged in `notes` as `[rate_overridden: …]`).
- `amount = qty * rate` for `per_bottle`; `0` when `isFree` or `monthly_package`.
- Qty 0 + empties 0 ⇒ `status = 'void'`; qty 0 + empties > 0 stays `recorded` (returns only).
- Partial unique index `uq_delivery_slot` on
  `(customer_id, delivery_date, product_id, slot_key) WHERE status = 'recorded'`.
  Standard deliveries use `slot_key = ''`; walk-ins use a unique uuid per sale.
- `balanceService.computeLiveBottles` now includes deliveries + adjustments automatically;
  delivery writes call `upsertSummary` with `lastDeliveryDate` in the same transaction.
- Walk-in system customer code `WALK-IN` (`customer_type = 'walk_in'`) — exclude from
  invoicing / receivables in Phase 3. Multiple walk-in rows per day are expected.
- Matrix/card qty edits omit `emptiesCollected` so the service preserves prior empties
  (defaults to qty only on insert).
- **Next phase is Phase 3 (Billing & payments).** When issuing an invoice, set
  `deliveries.invoice_id` so Phase 2 locks continue to work. Add FK to `invoices` then.

### Escalations / questions for the human

- Confirm early `customer_adjustments` table is acceptable for Phase 3 to extend rather than
  recreate.

### Review fixes (2026-08-01)

- Walk-in: migration `0004_walk_in_slot_key` + insert-per-sale (no same-day overwrite).
- Matrix/card/detail: qty edits no longer reset independent empties; clear sends
  `emptiesCollected: 0` via `matrixCardQtyUpsert` so the row voids (regression fix).
- Daily entry: optimistic row/footer patch + rollback toast; ~400 ms debounced cell
  autosave stays in edit mode (multi-digit qty); Enter/blur still leave edit.
- `listMissedDeliveries` reads `deliveries.missedDaysThreshold` from settings.
- `getDayList` / `getMonthGrid` batch covering rates (no N× `getRateFor`).
- Bottles-out `daysSinceLastReturn` uses last day with `empties_collected > 0`.
- Month matrix tints Pakistan holidays as well as weekends.
- Disabled employee stubs on daily header + detail (`TODO(phase-6)`).
- Tests: two walk-ins same day; empties preservation; matrix clear⇒void; isFree⇒0;
  void audit; settings threshold; last-return days; grid@500 under 1.5s; holidays helper.
- **Criteria #9 PASS:** real Daily Entry UI keyboard timing **9.53 s / 100 customers**
  (2026-08-01; seeded; all routes; no mouse in timed loop). Status → **complete**.
- Stable release for Phase 2 already shipped as **v0.4.25** (no new release invented for this
  timing pass). Review-fix commits still need pushing if not yet on `main`.

---

## Phase 3 — Billing, Customer Ledger & Payments

**Date:** 2026-08-01 · **Status:** complete · **package.json:** `0.5.0` · **stable:** [v0.5.29](https://github.com/Muhammad-Nabeel-Asif/aqua-nuqi/releases/tag/v0.5.29)

### Windows upgrade matrix (2026-08-01)

| Check                                                                | Result   |
| -------------------------------------------------------------------- | -------- |
| #1 Upgrade previous stable → new (data + migrations + `app_upgrade`) | **PASS** |
| #4 Downgrade refusal (older build over newer schema)                 | **PASS** |
| #7 Uninstall leaves `AppData\Roaming\Aqua Nuqi`                      | **PASS** |

- **Previous stable:** [v0.4.25](https://github.com/Muhammad-Nabeel-Asif/aqua-nuqi/releases/tag/v0.4.25) (schema 5, through migration `0004`).
- **Current stable:** **v0.5.29** (schema 7, migrations `0005` + `0006`).
- **#1 method:** boot-migration integration test
  (`src/main/db/phase2-to-phase3-upgrade.test.ts`) — Phase 2 DB with a customer +
  delivery upgraded to 0.5.29; rows intact; `invoices` / `payment_allocations` present;
  `app_upgrade` audit `0.4.25 → 0.5.29, schema 5 → 7`; pre-migration backup written.
  Packaged **v0.5.29** AppImage contains `0006_alloc_status.sql` and extracts cleanly.
  NSIS identity/`deleteAppDataOnUninstall: false` unchanged since last on-device Windows
  matrix (v0.3.21 / v0.4.25).
- **#4:** `runBootMigrations` refused-downgrade path + unit coverage; schema now 7 so a
  0.4.x build over 0.5.x data hits older-than-data.
- **#7:** packaging-safety tests + prior Windows uninstall PASS (same NSIS flags).
- **Windows (stable):** https://github.com/Muhammad-Nabeel-Asif/aqua-nuqi/releases/latest/download/Aqua-Nuqi-Setup.exe

### Built

- Migration `drizzle/0005_chilly_silverclaw.sql` — `invoices`, `invoice_lines`, `payments`,
  `payment_allocations`; FKs on `deliveries.invoice_id` + `customer_adjustments.invoice_id`
  (table rebuild); adjustment indexes
- Services: `ledger`, `adjustment`, `billing`, `payment`, `receivables`
- Screens: `/billing/generate`, `/billing/invoices`, `/billing/invoices/:id`,
  `/billing/periods`, `/payments`, `/receivables`; customer Ledger/Invoices tabs;
  daily-entry “Post today's collected cash”
- Unit tests: ledger 1,000-entry random/back-dated; acceptance criteria 1–11 arithmetic

### Migrations added

- `drizzle/0005_chilly_silverclaw.sql` — billing tables + delivery/adjustment invoice FKs
- `drizzle/0006_alloc_status.sql` — `payment_allocations.status` (active/superseded/void)

### IPC channels added

- `invoices:preview|previewBatch|generate|generateBatch|issue|issueAll|void|list|get|markShared`
- `billing:periodsOverview`
- `adjustments:create|void|list`
- `ledger:get`
- `payments:record|void|reallocate|list|get|postCollectedCash|collectedCashPreview`
- `receivables:report`

### Settings keys added

- None (uses existing `invoice.*` / `tax.*`)

### Error codes added

- `INVOICE_EXISTS`, `INVOICE_ALREADY_ISSUED`, `INVOICE_NOT_EDITABLE`

### Invoice numbering format

- Settings: `invoice.numberFormat` = `{prefix}-{YYYY}-{MM}-{seq:4}`, prefix `INV`
- Sequence name: `invoice:YYYY-MM` in `sequences` (allocated inside each generate transaction)
- Example: `INV-2026-07-0001`
- Receipts: `RCV-00001` via sequence `receipt`

### Cash-at-delivery handling

- **Chosen:** recommended end-of-day action. Daily Entry button
  “Post today's collected cash” → `payments:collectedCashPreview` then
  `payments:postCollectedCash`. Creates one `cash` payment per customer with notes tag
  `[cash_at_delivery:YYYY-MM-DD]` (idempotent). Does **not** silently create payments on
  delivery upsert.

### InvoicePreview DTO (Phase 4 renders invoices from InvoiceDto)

```ts
{
  customerId, customerCode, customerName, period, periodStart, periodEnd,
  openingBalance, deliveriesCount, deliveriesQty, deliveriesTotal,
  chargesTotal, discountTotal, taxTotal, invoiceTotal, totalPayable,
  bottlesWithCustomer,
  lines: [{ lineNo, lineType, lineDate, description, quantity, rate, amount, deliveryId, adjustmentId }],
  warnings: string[],
  skipReason: string | null,
  existingInvoiceId: number | null,
  existingStatus: string | null
}
```

### Invoice DTO

```ts
{
  id, uuid, invoiceNo, customerId, customerCode, customerName,
  period, periodStart, periodEnd, issueDate, dueDate,
  openingBalance, deliveriesQty, deliveriesTotal, chargesTotal, discountTotal,
  taxTotal, invoiceTotal, totalPayable, paidTotal, closingBalance,
  bottlesWithCustomerAtIssue,
  status: 'draft'|'issued'|'partially_paid'|'paid'|'void',
  voidReason, pdfPath, lastSharedAt, notes,
  createdAt, updatedAt, createdBy,
  lines: InvoiceLineDto[],  // includes id
  balanceDue,                // totalPayable − paidTotal (0 if void)
  paymentHistory             // allocations (active/superseded/void) for this invoice
}
```

### Deviations from the spec

- Running ledger balance **includes** deposit credits/debits (Phase 3.2). Phase 1 had excluded
  deposits from AR; deposits remain non-revenue (`isNonRevenue` / excluded from
  `revenueAccrual` / `revenueCash`).
- Deposit adjustments ledger immediately; other adjustments hit the ledger via
  `invoice_total` on issue. Deposit lines appear on the invoice but are **not** in
  `invoice_total` (avoids double-count + revenue inflation). Document `total_payable` /
  `balanceDue` **do** include deposit line amounts so cash-to-collect matches the ledger.
- Credit/debit notes (FR-BL-11 Should): void + regenerate / adjustment path; no separate
  credit-note document type yet.
- PDF/WhatsApp: buttons present, disabled with `TODO(phase-4)`.
- `revenue_accrual` counts only `issued` / `partially_paid` / `paid` (drafts excluded).

### What the next phase must know

- Issue appends ledger debit for **`invoice_total` only** — never `total_payable`.
- Void appends `void_reversal`, clears delivery/adjustment links, and **keeps** `invoice_lines`.
- `payment_allocations.status` is `active` | `superseded` | `void` (never hard-deleted).
- Generate/issue/**void** respect period lock (`PERIOD_LOCKED`); owner may pass
  `forceClosedPeriod` (UI confirm on Generate / Issue / Void).
- `pdf_path` / `last_shared_at` columns exist; Phase 4 should fill them and enable print/share.
- Walk-in customers are excluded from invoicing and receivables.
- **Next phase is Phase 4 (PDF invoices & sharing).** Stable is **v0.5.29**.

### Escalations / questions for the human

- Confirm deposit-in-running-balance (vs Phase 1 AR exclusion) is the intended live behaviour.
- Optional: re-run NSIS overlay on a Windows laptop over v0.4.25 → v0.5.29 for on-device
  confirmation (migration upgrade already covered by automated boot test).

### Review fixes (2026-08-01)

- Period lock on `generateInvoice` / `generateBatch` / `issueInvoice` / `voidInvoice`
  (+ `forceClosedPeriod`).
- Void keeps `invoice_lines`; only draft regeneration hard-clears lines.
- Deposit lines fold into `totalPayable` / `balanceDue` (still excluded from `invoice_total` /
  revenue).
- Soft-void / supersede `payment_allocations` (migration `0006_alloc_status`).
- Invoice detail: payment history + status timeline; payments: reallocate UI + customer picker;
  Ctrl+K “Record payment”; adjustment kinds expanded; Money/`formatMoney` in payments/
  receivables CSV.
- `revenueAccrual` excludes drafts; ageing integration test via `receivables.report()`.
- Stable **v0.5.29** published; Phase 2→3 boot-upgrade test PASS; status → **complete**.

---

## Phase 4 — PDF Documents, Printing & Sharing

**Date:** 2026-08-01 · **Status:** complete · **package.json:** `0.6.0` · **stable:** [v0.6.35](https://github.com/Muhammad-Nabeel-Asif/aqua-nuqi/releases/tag/v0.6.35)

### Windows / Linux upgrade matrix (2026-08-01)

| Check                                                            | Result   |
| ---------------------------------------------------------------- | -------- |
| #1 Upgrade previous stable → new (data intact; schema unchanged) | **PASS** |
| #4 Downgrade refusal (older build over newer schema)             | **N/A*** |
| #7 Uninstall leaves `AppData\Roaming\Aqua Nuqi`                  | **PASS** |

\* Schema still **7** (no Phase 4 migration). Downgrade refusal path remains covered by
`runBootMigrations` unit tests; re-exercise on-device after the next schema-bumping phase.

- **Previous stable (pre-review):** [v0.6.33](https://github.com/Muhammad-Nabeel-Asif/aqua-nuqi/releases/tag/v0.6.33)
- **Current stable (review fixes):** **v0.6.35**
- **#1 method:** `scripts/smoke-phase4-upgrade.ts` — DB seeded as app `0.6.33` / schema 7 with
  customer + issued invoice; boot as `0.6.35` → `up_to_date`, rows intact. Packaged AppImages:
  migrations `0000`–`0006` identical; **v0.6.35** bundle contains `preferCssPageSize` /
  `getInvoicePrintPayload` / `pdfPageNumbersEnabled` (absent from v0.6.33).
- **#7:** packaging-safety tests + prior Windows uninstall PASS (same NSIS
  `deleteAppDataOnUninstall: false`).
- **Windows (stable):** https://github.com/Muhammad-Nabeel-Asif/aqua-nuqi/releases/latest/download/Aqua-Nuqi-Setup.exe
- **Ubuntu (stable):** https://github.com/Muhammad-Nabeel-Asif/aqua-nuqi/releases/latest/download/Aqua-Nuqi.AppImage

### Built

- Pooled hidden print window (`src/main/windows/print-window.ts`) + `pdf.service.ts` (no Electron
  imports; renderer/platform injected from bootstrap)
- React print templates under `src/renderer/src/print/templates/` with local Noto Sans +
  Noto Nastaliq Urdu (`resources/fonts/` + bundled renderer assets)
- Invoice detail: live print preview, Save PDF / Print / WhatsApp / Email / Save as
- Batch PDF export with progress dialog + cancel (Generate bills + Invoice list)
- Payment receipts (A5 + 80 mm), delivery slip, customer statement, delivery card PDF,
  bottles-out + receivables print layouts
- Settings → Invoice tab (logo upload, accent, bottle/rate toggles, terms, WhatsApp template,
  documents folder, default / thermal printers) with live preview (logo via `pdf:businessHeader`)
- `numberToWords` (Pakistani lakh/crore) + unit tests
- Generic `exportTable` / `exportExcel` wired to receivables, customers, and month matrix

### Migrations added

- None (uses existing `invoices.pdf_path` / `last_shared_at`)

### IPC channels added

- `print:getJob`, `print:documentReady`
- `pdf:generateInvoice`, `pdf:batchGenerate`, `pdf:cancelBatch`, `pdf:printInvoice`
- `pdf:getInvoicePrintPayload`, `pdf:businessHeader`
- `pdf:generateReceipt`, `pdf:generateDeliverySlip`, `pdf:generateStatement`
- `pdf:generateDeliveryCard`, `pdf:generateBottlesOut`, `pdf:generateReceivables`
- `pdf:exportTable`, `pdf:exportExcel`
- `pdf:shareWhatsApp`, `pdf:shareEmail`, `pdf:saveAs`, `pdf:open`, `pdf:showInFolder`
- `pdf:uploadLogo`

### Settings keys added

- `invoice.showRateColumn`, `invoice.accentColour`, `invoice.termsText`,
  `invoice.defaultPageSize`, `invoice.whatsappTemplate`, `invoice.emailSubjectTemplate`,
  `invoice.emailBodyTemplate`, `documents.folder`, `locale.numberingSystem`,
  `print.defaultPrinter`, `print.defaultThermalPrinter`

### Error codes added

- None

### `pdf.service` API

```ts
createPdfService(db, audit, settings, billing, payments, ledger, customers, deliveries, receivables, renderer, platform)

pdf.generateInvoicePdf(invoiceId, { openAfter?, userId? }) => { path, invoiceId }
pdf.batchGenerateInvoices({ period?, invoiceIds?, filter?, jobId? }, userId?) => {
  generated, cancelled, folder, files, errors, elapsedMs
}
pdf.cancelBatch(jobId)
pdf.printInvoice(invoiceId, { deviceName?, silent? })
pdf.generateReceiptPdf(paymentId, 'a5'|'thermal', opts)
pdf.generateDeliverySlip(deliveryId, opts)
pdf.generateStatementPdf(customerId, { from?, to? }, opts)
pdf.generateDeliveryCardPdf(customerId, period, opts)
pdf.generateBottlesOutPdf(filters, opts)
pdf.generateReceivablesPdf(asOf?, opts)
pdf.exportTable(input: ExportTableInput, opts) => { path }
pdf.exportExcel(input: ExportExcelInput, opts) => { path }  // SheetJS `xlsx`
pdf.shareWhatsApp(invoiceId, { phoneOverride?, userId? })  // wa.me + showItemInFolder + clipboard
pdf.shareEmail(invoiceId, opts)
pdf.savePdfAs(sourcePath, defaultName?)
pdf.ensureInvoicePdf / buildInvoicePayload / businessHeader / documentsRoot
```

Progress events: `pdf:batchProgress` → `{ jobId, current, total, status, fileName?, message? }`

### Template registry

`PrintTemplateId` → component in `src/renderer/src/print/templates/registry.tsx`:

| id                        | Component                | Page size      |
| ------------------------- | ------------------------ | -------------- |
| `invoice`                 | `InvoiceTemplate`        | A4             |
| `payment-receipt-a5`      | `PaymentReceiptTemplate` | A5             |
| `payment-receipt-thermal` | `PaymentReceiptTemplate` | 80 mm          |
| `delivery-slip`           | `DeliverySlipTemplate`   | 80 mm          |
| `customer-statement`      | `StatementTemplate`      | A4             |
| `delivery-card`           | `DeliveryCardTemplate`   | A4             |
| `bottles-out`             | `BottlesOutTemplate`     | A4 landscape   |
| `receivables`             | `ReceivablesTemplate`    | A4 landscape   |
| `table-export`            | `TableExportTemplate`    | A4 / landscape |

Print route (no auth shell): `#/print/:template?jobId=…` → `PrintJobPage` → `print:documentReady`.

### `exportTable` signature

```ts
exportTable({
  title: string
  columns: Array<{ key: string; header: string; align?: 'left'|'right'|'center'; width?: number }>
  rows: Array<Record<string, string | number | null>>
  filters?: Array<{ label: string; value: string }>
  orientation?: 'portrait' | 'landscape'
  fileName?: string
  openAfter?: boolean
}): Promise<{ path: string }>
```

### Excel library chosen

**`xlsx` (SheetJS)** — already in the project from Phase 1 import/export. No `exceljs` added.

### Deviations from the spec

- Electron BrowserWindow / `printToPDF` lives in `src/main/windows/print-window.ts` (eslint
  forbids Electron imports under `services/`); `pdf.service.ts` stays pure and receives
  `renderer` + `platform` adapters from bootstrap.
- Page “x of y” uses Electron `displayHeaderFooter` + `footerTemplate` (`pageNumber` /
  `totalPages` classes). Body CSS `counter(page)` does not advance under `printToPDF`.
- Thermal 80 mm PDFs use `preferCSSPageSize: true` with `@page { size: 80mm 297mm }` (micron
  `pageSize` alone produced a ~28 m-wide MediaBox in Electron 33).
- WhatsApp is shell-only (`wa.me` + reveal PDF); no whatsapp-web.js / Baileys (per docs/05).
- Excel via existing `xlsx` (SheetJS), not `exceljs`.

### Acceptance verification (2026-08-01, post-review)

- `node scripts/verify-phase4-pdfs.mjs` (requires `npm run build`): loads real
  `#/print/:template?fixture=…` routes (`InvoiceTemplate` / `PaymentReceiptTemplate`).
  - 26-line invoice → **1 page**; 60-line → **2 pages** with repeated `<thead>` and
    **Page 1 of 2 / Page 2 of 2**; Urdu Arabic script in `pdftotext`; thermal MediaBox width
    ≈ **227 pts** (80 mm).
- Unit: `numberToWords`; batch cancel with slow renderer (`cancelled === true`,
  `generated < total`); receipt `balanceAfter` from ledger; issued invoice empties/deposit
  ignore later live edits; thermal printer deviceName from settings; print-page-size helpers;
  WYSIWYG payload fields; exportTable/exportExcel.
- `npm run typecheck && npm run lint && npm run test && npm run build` PASS.

### What the next phase must know

- Reuse `pdf.exportTable` / print templates for Phase 8 reports; do not add Puppeteer/pdfmake.
- Documents default to `<Documents>/AquaNuqi/...` or `documents.folder`.
- Invoice PDFs: `<docs>/Invoices/<YYYY-MM>/<invoiceNo>-<code>-<slug>.pdf`.
- Logo files live in `userData/logos/` via `pdf:uploadLogo`.
- Preview IPC: `pdf:getInvoicePrintPayload` / `pdf:businessHeader` (same payload as PDF gen).
- Thermal print jobs read `print.defaultThermalPrinter`; receipt default variant follows
  `invoice.defaultPageSize` (`thermal` → thermal, else A5).
- **Next phase is Phase 5 (Expenses)** (or follow the phase order in `docs/phases/`).
- Stable is **v0.6.35**.

### Escalations / questions for the human

- Optional: on-device Windows NSIS overlay v0.6.33 → v0.6.35 (Linux AppImage + boot smoke already
  PASS; no schema change).

### Review fixes (2026-08-01)

- Invoice density + margins so 26 delivery lines fit one A4 page; page numbers via
  `printToPDF` footerTemplate (not body CSS counters).
- Thermal PDFs: `preferCSSPageSize` + `@page { size: 80mm … }`; MediaBox ≈ 227 pts.
- WYSIWYG preview from `pdf:getInvoicePrintPayload`; settings preview loads logo via
  `pdf:businessHeader`.
- Receipt `balanceAfter` from ledger payment entry; issued invoices use linked-delivery
  empties + deposit-as-of-issue-date (not live customer card / deposit).
- Batch cancel test injects slow renderer; asserts `cancelled` and partial generation.
- `invoice.defaultPageSize` / `print.defaultThermalPrinter` wired for receipts; Settings UI
  exposes printer device names.
- `exportTable` on Customers + Month Matrix; deleted orphan `src/main/lib/print-window.ts`.
- Verifier rewritten against real print fixtures; stable **v0.6.35** published; status →
  **complete**.

---

## Phase 5 — Expense Management

**Date:** 2026-08-01 · **Status:** complete · **package.json:** `0.7.0` · **stable:** [v0.7.43](https://github.com/Muhammad-Nabeel-Asif/aqua-nuqi/releases/tag/v0.7.43)

### Built

- Migration `drizzle/0007_moaning_kitty_pryde.sql` — `expenses`, `recurring_expenses`
  (`employee_id` / `vehicle_id` columns without FKs until Phases 6/7).
  `expense_categories` already existed from Phase 0 and is seeded on boot.
- Service `expense.service.ts`: expenses CRUD + void, category CRUD/reorder/merge,
  recurring CRUD + due list, `summaryByCategory` / `summaryByMonth` / `insights`, cash book,
  attribution options (empty until employees/vehicles tables exist).
- Attachment copy helper `expense-attachments.ts` + IPC resize via Electron `nativeImage`.
- Screens: `/expenses` (quick-add, filters, virtualised list, side panel, insights, cash book),
  `/expenses/categories`; dashboard recurring-due widget (owner).
- Unit tests covering acceptance criteria 2, 4, 5, 6, 7, 9 + payroll read-only + audit.

### Migrations added

- `drizzle/0007_moaning_kitty_pryde.sql` — tables: `expenses`, `recurring_expenses`
  (hand-stripped a spurious `payment_allocations` rebuild from drizzle-kit)

### IPC channels added

- `expenses:create|update|void|list|get|summaryByCategory|summaryByMonth|insights`
- `expenses:attributionOptions|cashBook|attachReceipt|resolveAttachment|openAttachment|attachmentPreview`
- `expenseCategories:list|create|update|reorder|merge`
- `recurringExpenses:list|create|update|due`

### Settings keys added

- None

### Error codes added

- None (reused `VALIDATION_FAILED`, `NOT_FOUND`, `CONFLICT`, `PERIOD_LOCKED`)

### Dependencies added

- `recharts` — expense insights charts (FR-EX-07). Note for stack doc.

### Attachments folder (Phase 9 must include in backups)

- **Path:** `<userData>/attachments/expenses/<YYYY>/<uuid>.<ext>`
- Relative path stored in `expenses.attachment_path` (e.g. `expenses/2026/<uuid>.jpg`).
- Absolute root: `path.join(userData, 'attachments')`.
- Phase 9 backup/restore must zip **DB + `attachments/`** (and existing `logos/`).
  Current `backup.service` is still DB-only (`VACUUM INTO`).

### Deviations from the spec

- Generated migration initially rewrote `payment_allocations`; hand-removed (same pattern as
  Phase 2/3).
- Image downscale uses Electron `nativeImage` in the IPC handler (services stay Electron-free).
- Recurring confirmations create `source = 'manual'` expenses (editable) and advance the
  template via `recurringExpenseId`. The `recurring` source value is reserved; not used for
  user-confirmed recordings so they stay editable.

### Cash book (5.9)

- **Implemented** (informational): opening cash + cash-in (payments method `cash`) − cash-out
  (expenses method `cash`) = closing; optional counted cash → variance. Toggle on `/expenses`.

### What the next phase must know

**`createExpense` signature** — Phase 6 **must** create salary expenses through this service
(never insert into `expenses` directly), or the Phase 8 profit report will double-count:

```ts
expenses.createExpense(
  {
    expenseDate: string              // YYYY-MM-DD — guardPeriodOpen applies
    categoryId: number               // use Salaries / Employee Advance system categories
    amount: number                   // paisa, > 0
    paymentMethod: 'cash' | 'bank_transfer' | 'jazzcash' | 'easypaisa' | 'cheque' | 'credit' | 'other'
    vendorName?: string | null
    description?: string | null
    referenceNo?: string | null
    attachmentPath?: string | null   // relative under attachments/
    employeeId?: number | null       // optional attribution
    vehicleId?: number | null
    source?: 'manual' | 'payroll' | 'purchase' | 'recurring'   // default 'manual'
    sourceRefTable?: string | null
    sourceRefId?: number | null
    recurringExpenseId?: number | null  // advances template after confirm
    forceClosedPeriod?: boolean
  },
  userId: number,
): ExpenseDto
```

**How Phase 6 must populate `source` / `source_ref_*`:**

| Event                     | `source`     | `source_ref_table`                    | `source_ref_id`      | Category                   |
| ------------------------- | ------------ | ------------------------------------- | -------------------- | -------------------------- |
| Payroll item paid         | `'payroll'`  | `'payroll_items'`                     | `payroll_items.id`   | **Salaries** (`is_system`) |
| Salary advance paid out   | `'payroll'`  | `'salary_advances'`                   | `salary_advances.id` | **Employee Advance**       |
| Bottle purchase (Phase 7) | `'purchase'` | `'stock_movements'` (or purchase row) | that row's id        | Bottle purchase            |

- Look up system categories by name: `expenses.findCategoryByName('Salaries')` /
  `'Employee Advance'` (seeded, `is_system = 1`, cannot rename/delete).
- Expenses with `source != 'manual'` are **read-only** on `/expenses` (update/void throw
  `CONFLICT` with a banner pointing at payroll/inventory). Edit/void only from the originating
  module.
- Prefer calling `createExpense` inside the same DB transaction as the payroll write when
  Phase 6 adds a `tx` overload; until then create inside the payroll transaction by extending
  the service, or create immediately after finalize in the same service method.

**Category merge:** moves all `expenses` + `recurring_expenses` from A → B, deactivates A;
totals unchanged.

**Next phase is Phase 6 (Employees & payroll).** Do not invent a second salary expense path.

### Escalations / questions for the human

- Seed category list is a placeholder from `03-data-model.md` §F — replace with the client's
  real list when available.
- Confirm `recharts` may be added to the stack doc §1.

### Review fixes (2026-08-01)

Addressed Phase 5 review findings without expanding scope:

- **Recurring UI:** `RecurringExpensesPanel` on `/expenses` (list/create/edit/deactivate).
- **Void × recurring:** confirmed recordings store `source_ref_* → recurring_expenses`; void
  rolls back `last_recorded_date` / `next_due_date` so the item reappears as due.
- **Period lock:** expenses UI no longer offers confirm→`forceClosedPeriod` (AC7).
- **Cash book:** excludes payments whose notes start with `[deposit]` (same as `revenueCash`).
- **Sortable table** columns wired to `listExpenses` `sortBy`/`sortDir`.
- **Dashboard deep link:** `/expenses?recurring=<id>` prefills the side panel.
- **Export amounts:** `paisaToDecimalString` (no float `/100`).
- **IPC contracts:** `openAttachment` / `attachmentPreview` schemas moved to shared contracts.
- **`previousEquivalentRange`:** YYYY-MM-DD helpers only (`addBusinessDays`).
- **Employee Advance:** toast warning when picked manually; Phase 6 still must net advances.
- Regression tests: void×recurring, cash-book deposits, previousEquivalentRange, attachments,
  UI period-lock guards, `paisaToDecimalString`.
- Stable **[v0.7.43](https://github.com/Muhammad-Nabeel-Asif/aqua-nuqi/releases/tag/v0.7.43)**
  published after review fixes (`package.json` remains `0.7.0`). Phase 5 done — next is Phase 6.

---

## Phase 6 — Employees, Attendance & Payroll

**Date:** 2026-08-01 · **Status:** complete · **package.json:** `0.8.0`

### Built

- Migration `drizzle/0008_employees_payroll.sql` — `employees`, `employee_salaries`,
  `attendance`, `payroll_runs`, `payroll_items`, `salary_advances`; deferred FKs on
  `routes.default_employee_id`, `deliveries.employee_id`, `payments.received_by_employee_id`,
  `expenses.employee_id`.
- Migration `drizzle/0009_payroll_review_fixes.sql` — `salary_advances.settled_amount`,
  `payroll_items.superseded_at` + partial unique index (schema version **10**).
- Services: `employee.service` (CRUD + dated salaries), `attendance.service`,
  `payroll.service` (advances + generate/review/finalise/void/pay + performance).
- `expense.service`: `createExpense(..., outerTx?)` and `voidSystemExpense` for payroll.
- Screens: `/employees`, `/employees/:id`, `/employees/attendance`, `/employees/advances`,
  `/payroll` (incl. compare-performance table); delivery detail employee attribution;
  Settings → Localisation working-days basis.
- Salary slip PDF template + `pdf:generateSalarySlip` / `pdf:batchGenerateSalarySlips`.
- Unit tests covering AC1, AC3–AC8, AC10, §6.5 double-counting, and Phase 6 review probes.

### Migrations added

- `drizzle/0008_employees_payroll.sql` — tables above + FK rebuilds
- `drizzle/0009_payroll_review_fixes.sql` — `settled_amount`, `superseded_at`
- `drizzle/0010_advance_settlements.sql` — `salary_advance_settlements` (schema version **11**)

### IPC channels added

- `employees:list|listActive|get|nextCode|create|update|setStatus|changeSalary|uploadPhoto|payrollHistory|performance|comparePerformance`
- `attendance:getMonth|set|setRange|markAllPresent|markHoliday|today`
- `advances:list|create|void|waive`
- `payroll:list|get|generate|updateItem|finalize|void|recordPayment|payAll`
- `pdf:generateSalarySlip|batchGenerateSalarySlips`

### Settings keys added

- `payroll.workingDaysBasis` — `'calendar' | 'fixed_26' | 'working_days'`, default **`fixed_26`**

### Error codes added

- None (reused `VALIDATION_FAILED`, `NOT_FOUND`, `CONFLICT`, `PERIOD_LOCKED`)

### Working-days basis (for next phase)

- Stored in `payroll.workingDaysBasis`, default `fixed_26`.
- `calendar` = days in month; `fixed_26` = 26; `working_days` = calendar days minus distinct
  dates marked `holiday` on attendance.
- Shown on the payroll screen and attendance month header; configurable under Settings →
  Localisation.

### Commission when delivery has no employee

- Commission uses `Σ quantity` of `deliveries` in the period where `employee_id = E` and
  `status = 'recorded'`.
- Deliveries with `employee_id IS NULL` are **excluded from every employee's total** — they do
  not inflate anyone's commission.

### Salaries expense amount rule (§6.5)

- Paying an advance → immediate **Employee Advance** expense (`source = 'payroll'`,
  `source_ref_table = 'salary_advances'`), amount = advance.
- Finalising payroll → one **Salaries** expense per employee with `net_payable > 0`
  (`source = 'payroll'`, `source_ref_table = 'payroll_items'`), amount = **`net_payable`**
  (cash paid at payroll time), **not** gross salary.
- Total salary cost for the month = Employee Advance + Salaries = gross (counted once).
- If advances exceed net before advances: cap deduction, leave remainder outstanding, warn on
  review; Salaries expense may be 0.

### Deviations from the spec

- Daily Entry employee filter left as disabled TODO (day-list API has no `employeeId` filter);
  attribution works on delivery detail dialog.
- No EOBI / statutory deductions (client has not asked — open question below).

### Review fixes (2026-08-01)

Independent Phase 6 review findings addressed:

1. **Unmarked attendance** — `summarizeForPayroll` treats unmarked working-day equivalents
   (up to the configured working-days basis) as absent, so a blank grid no longer pays full
   monthly salary.
2. **Finalize vs pay** — finalize posts the Salaries expense and leaves `paidAmount = 0`;
   `recordPayment` / Pay all / per-row Pay update paid date/method. FR-EM-06 payment flow works.
3. **Capped advances** — no row split; `settled_amount` on one advance row; void reverses
   settled_amount and keeps the original Employee Advance expense intact.
   **Follow-up:** multi-month caps use `salary_advance_settlements` ledger so voiding an
   earlier month undoes only that item’s slice (migration `0010_advance_settlements`,
   schema version **11**).
4. **Regenerate from void** — old `payroll_items` are soft-superseded (`superseded_at`), never
   hard-deleted.
5. **Attendance UI** — empty cell cycles null→present; Today panel is tappable; drag-fill calls
   `setRange`; detail Attendance tab shows a month strip + deep-link.
6. **Absence rounding** — `Math.round((base × daysAbsent) / workingDays)` (one final round).
7. **waiveAdvance** — guards open period (`forceClosedPeriod` optional).
8. **UI gaps** — global `/employees/advances` list; employee comparison table on `/payroll`.
9. **Contracts** — `employees:payrollHistory` schemas moved to `shared/contracts/employees.ts`.
10. **Regression tests** — unmarked attendance, partial pay, void-after-cap, soft-supersede,
    rounding, daily wage, waive period lock, salary-slip filename.
11. **Multi-month advance void** — settlement ledger; void July after Aug full settle leaves
    `settled_amount = Aug slice`, outstanding = July slice; regenerate July re-deducts.
12. **Salary slip** — “Net paid” uses `paidAmount` (shows unpaid when below net payable).

**Waive keeps Employee Advance expense** (cash already left; waive only skips payroll
deduction) — intentional.

### What the next phase must know

- Employees table exists; `routes.default_employee_id` and `deliveries.employee_id` have FKs.
- Create salary costs only via `expenses.createExpense` with `source: 'payroll'` (never raw
  inserts). Use `voidSystemExpense` when reversing payroll-sourced rows.
- Outstanding advance balance = `amount - settled_amount` while status is `outstanding`.
- Per-item settlement slices live in `salary_advance_settlements` (void by `payroll_item_id`).
- Schema version is **11** after multi-month advance void fix.
- **Next phase is Phase 7 (Inventory / trips)** — can link `vehicles` and trip cash variance
  into employee performance (`cashVariance` is currently `null`).

### Escalations / questions for the human

- Confirm no EOBI / social-security / tax deductions are needed before Phase 8 P&L.
- Optional: add `employeeId` filter to `deliveries:getDayList` for Daily Entry.

---

## Phase 7 — Bottle Inventory, Vehicles & Trip Reconciliation

**Date:** 2026-08-01 · **Status:** complete · **package.json:** `0.9.0` · **stable:** [v0.9.49](https://github.com/Muhammad-Nabeel-Asif/aqua-nuqi/releases/tag/v0.9.49)

### Built

- Migration `drizzle/0011_inventory_trips.sql` — `vehicles`, `trips`, `stock_movements`; deferred
  FKs `deliveries.trip_id → trips`, `expenses.vehicle_id → vehicles` (schema version **12**).
- Idempotent TS backfill `backfill-stock-movements.ts` (run from `migrate.ts` on every boot):
  customer opening bottles, recorded deliveries, lost/damaged adjustments. Logs rows created.
- Services: `stock.service` (record / getBalances / ops), `vehicle.service`, `trip.service`.
- Wired `deliveryService.upsertDelivery` / void / walk-in / bottle-loss into stock movements;
  auto-links open trip when `employeeId` + date match. Customer opening bottles write
  `opening_stock` movements. Payroll performance `cashVariance` from closed trips.
- Screens: `/inventory`, `/inventory/vehicles`, `/inventory/trips`, `/inventory/bottles-out`.
- Unit tests covering AC1–AC10 plus review regressions (ghost van stock, variance sign,
  append-only delivery void/edit, adjustment sink, plant availability, bottles-out shortfall,
  purchase expense read-only).

### Migrations added

- `drizzle/0011_inventory_trips.sql` — vehicles, trips, stock_movements + FK rebuilds

### IPC channels added

- `inventory:getBalances|listMovements|recordOpeningStock|purchaseBottles|recordProduction|recordDamage|recordAdjustment|bottlesOut|recordBottleReturn`
- `vehicles:list|get|create|update`
- `trips:list|get|start|close|void|employeeVarianceSummary`

### Settings keys used

- `inventory.lowStockThreshold` (already seeded; editable on Inventory screen)

### Error codes added

- None (reused `VALIDATION_FAILED`, `NOT_FOUND`, `CONFLICT`, `PERIOD_LOCKED`)

### `getBalances` shape (for next phase)

```ts
{
  items: Array<{
    productId, productName,
    filledAtPlant, emptyAtPlant,
    filledInVans, emptyInVans,
    withCustomers, scrapped, totalOwned
  }>,
  totals: { /* same numeric fields, aggregated */ },
  lowStock: {
    threshold, filledAtPlant, isLow,
    avgDailyConsumption14d, daysOfStockLeft
  }
}
```

Derived from a single grouped query over `stock_movements` (Σ in − Σ out per location/state).
**No `stock_balances` summary table** — not needed at current volume; add later if slow.

`totalOwned` = plant + vans + withCustomers (excludes scrapped).

### How delivery updates write movements

**Append-only reversal** (not hard-delete): inside the same transaction as the delivery
write, reverse prior _active_ movements for `ref_table='deliveries'` / `ref_id=<id>` by
appending opposite rows noted `[reversal of #<id>] …`, then write fresh movements for the
current recorded state (`filled: plant|van → customer`, `empty: customer → plant|van`).
Void only appends reversals. Customer opening stock uses the same reverse-then-write
pattern. Adjustment scrap rows are write-once (idempotent; never deleted).

### Trips are optional

If no open trip matches employee+date, `trip_id` stays null and stock moves plant ↔ customer.
Deliveries never require a trip.

### `bottle_variance` sign

Persisted as **loaded − returned − delivered** (schema / AC8): positive means bottles short.
Cash variance remains **submitted − expected** (negative when short). On close, positive
filled/empty shortfalls write `van → scrap` reason `lost` so `filledInVans`/`emptyInVans`
clear and stolen bottles leave `totalOwned`.

### Bottle purchase expense

`source: 'purchase'`, `source_ref_table: 'stock_movements'`, category **Bottle purchase** —
read-only on `/expenses`.

### Manual adjustments vs scrap

Negative count corrections use `to_location = none` (not scrap). Scrap is reserved for
damaged / lost / scrapped reasons.

### What the next phase must know

- Schema version **12**. Stock truth is `stock_movements`; balances are derived.
- Phase 8 asset/loss reports should read `stock.listMovements` / `getBalances` and trip
  variances — do not invent a second bottle counter. Treat `reason=lost` trip-close rows as
  theft/shortfall write-offs; do not treat `reason=adjustment`→`none` as breakage.
- `bottle_variance > 0` means short; sum carefully in loss reports.
- Expense vehicle attribution now has a real FK; `attributionOptions().vehicles` populates.
- `/deliveries/bottles-out` (Phase 2) still exists; the richer recovery list is
  `/inventory/bottles-out` (PDF/Excel export from inventory list with shortfall amounts).
- **Next phase is Phase 8 (Reports / P&L).**

### Review fixes (2026-08-01)

- Trip close writes lost movements for filled/empty shortfalls (no ghost van stock).
- `bottle_variance` sign corrected to schema formula; UI filled/empties variance aligned.
- Delivery/opening stock paths no longer DELETE `stock_movements` (append-only reverse).
- Negative adjustments → `none` sink; production/trip load reject insufficient plant stock.
- Inventory bottles-out exports PDF/Excel from `stock.listBottlesOut`; movement history
  filters (product/location/vehicle/customer) + Excel export; opening stock prompts
  `forceAdjustment` on CONFLICT.
- Tests added/updated for ghost stock, variance sign, append-only void/edit, adjustment
  sink, availability rejection, bottles-out shortfall sample, purchase read-only.
- **Trip void after shortfall:** `voidTrip` uses `stock.reverseMovementsForRef` for _all_
  active trip-linked movements (load/unload **and** close-time `lost` van→scrap). Scrap
  balances exclude inflows that have a `[reversal of #id]` sibling so a voided mistaken
  write-off does not permanently inflate breakage or leave `filledInVans` negative.
- Stable **[v0.9.49](https://github.com/Muhammad-Nabeel-Asif/aqua-nuqi/releases/tag/v0.9.49)**
  published after review fixes (`package.json` remains `0.9.0`). Schema version **12**
  (migration `0011_inventory_trips`). Phase 7 done — next is Phase 8.
- **Windows (stable):** https://github.com/Muhammad-Nabeel-Asif/aqua-nuqi/releases/latest/download/Aqua-Nuqi-Setup.exe
- **Ubuntu (stable):** https://github.com/Muhammad-Nabeel-Asif/aqua-nuqi/releases/latest/download/Aqua-Nuqi.AppImage
- **Debian (stable):** https://github.com/Muhammad-Nabeel-Asif/aqua-nuqi/releases/latest/download/Aqua-Nuqi.deb

### Escalations / questions for the human

- Confirm default deposit rate used for bottles-out value/shortfall matches the client's
  actual bottle deposit (product `default_deposit`).
- Optional: demo seed for vehicles + sample open trip.
- On-device overlay install of previous stable → **v0.9.49** (schema 11→12 + stock backfill)
  not run in this environment; unit suite covers migration + backfill + review probes.

---

## Phase 8 — Dashboard, Profit & Loss and Reports

**Date:** 2026-08-01 · **Status:** complete · **package.json:** `0.10.0`

### Built

- `report.service.ts` — one function per report (P&L accrual/cash, sales summary,
  customer-wise sales, area/route performance, employee delivery, customer activity,
  consumption trend, receivables ageing + by-area, collections, expenses, cost per bottle,
  bottles-out, bottle loss, trip variance, stock movement register, dashboard).
- `reportCache` keyed by `(report, params, dbWriteCounter)`; counter bumped from
  `audit.record` on every mutating action (not login/logout).
- Dashboard `/` — today / MTD / assets / charts / action lists / quick actions; role-stripped
  for operator/viewer (no profit, expense, salary, or recurring-expense money).
- Report hub `/reports` + individual screens; Money reports (P&L, collection, expenses,
  cost-per-bottle) behind `RequireOwner`. PDF/Excel via Phase 4 `exportTable` / `exportExcel`
  with filter headers.
- Customer detail overview: last-6-month consumption trend chart.
- Unit tests (`report.service.test.ts`) with a fixed July-2026 fixture and hand-calculated
  expected paisa totals covering AC1–AC7 plus voids, deposits, walk-ins, salary-once, cache,
  operator strip, and <2s performance on the fixture.

### Migrations added

- `drizzle/0012_report_indexes.sql` — `idx_invoices_issue_date`,
  `idx_invoices_period_status`, `idx_customer_adjustments_date`, `idx_stock_reason_date`
  (schema version **13**).

### Summary tables for performance

**None added.** Reports scan indexed transactional tables (`invoices`, `payments`,
`expenses`, `deliveries`, `stock_movements`, `customer_balances`). Existing
`customer_balances` (Phase 1/3) remains the only materialised summary; rebuild via
`balanceService.recalculateBalances()` / `syncFromSources` as documented in earlier phases.
Phase 9 integrity check does **not** need a new rebuild path for Phase 8.

In-memory `reportCache` is process-local only — discarded on restart; not persisted.

### Canonical revenue formulas (implemented)

```
revenue_accrual(from,to) = Σ invoice_total (status issued|partially_paid|paid,
                           period in months of range, or ad-hoc by issue_date)
                         + Σ walk-in delivery.amount (status=recorded)
revenue_cash(from,to)    = Σ payments.amount (status=active, not notes LIKE '[deposit]%')
                         + Σ walk-in delivery.cash_collected
expenses_total           = Σ expenses.amount (status=active)  — includes Salaries +
                           Employee Advance once (Phase 6 netting)
net_profit               = revenue − expenses_total
cost_per_bottle          = expenses_total / Σ delivery.quantity (recorded)
```

Deposits (adjustments + `[deposit]`-tagged payments) are listed under P&L “Excluded” and
never enter net revenue. Walk-ins are in revenue, never in receivables / customer-wise sales.

### IPC channels added

- `reports:dashboard|profitAndLoss|expenseDrilldown|salesSummary|customerWiseSales|areaRoutePerformance|employeeDelivery|customerActivity|customerConsumptionTrend|receivablesAgeing|collection|expenses|costPerBottle|bottlesOut|bottleLoss|tripVariance|stockMovements|resolveRange`

### Settings keys added

- None

### Error codes added

- None

### Deviations from the spec

- No persisted report summary table (not needed under 2s on fixture; indexes suffice).
- Cash-basis P&L collapses other-charges / discounts lines to 0 (cash is collections only);
  accrual shows the full water / charges / discounts breakdown.
- Dashboard “missed scheduled” counts weekday-schedule customers with no recorded entry today
  (simpler than full Phase 2 missed-delivery reasons).

### Acceptance verification (hand-calc fixture, July 2026)

| #   | Check                               | Expected (paisa)                            | Result |
| --- | ----------------------------------- | ------------------------------------------- | ------ |
| 1   | Dashboard MTD accrual = P&L accrual | 106_000                                     | PASS   |
| 2   | Accrual vs cash                     | 106_000 vs 61_000                           | PASS   |
| 3   | Deposits + advances don’t distort   | profit −2_394_000; salary-related 1_000_000 | PASS   |
| 4   | Salaries once; expenses = list sum  | 2_500_000                                   | PASS   |
| 5   | Receivables buckets sum = total     | B only 25_000 after A’s deposit credit      | PASS   |
| 6   | Dashboard bottles = bottles-out     | 2                                           | PASS   |
| 7   | Cost/bottle = expenses ÷ bottles    | round(2_500_000/18) = 138_889               | PASS   |
| 8   | PDF/Excel export with filters       | via `exportTable`/`exportExcel`             | wired  |
| 9   | Operator no profit/expense          | `dashboardForRole` + RequireOwner routes    | PASS   |
| 10  | <2s on fixture                      | cache + indexes                             | PASS   |
| 11  | typecheck / lint / test / build     | all green (196 tests)                       | PASS   |

### What the next phase must know

- Schema version **13** after `0012_report_indexes`.
- No new rebuildable summary table from Phase 8. Phase 9 integrity should still rebuild
  `customer_balances` (existing). If a future report is slow, prefer a monthly totals table
  maintained on invoice/payment/expense write with `rebuildReportTotals()`.
- P&L and dashboard money channels are **owner-only**; do not expose them to operator.
- Deposit exclusion convention: invoice_total never includes deposits; cash excludes
  payments whose notes start with `[deposit]`.
- Walk-in revenue is delivery-based (no invoice / no payment row).
- **Next phase is Phase 9 (Backup, restore, settings polish, integrity).**

### Escalations / questions for the human

- Confirm whether cash P&L should attempt to attribute collections to water vs charges
  (currently total collections only).
- Optional: on-device overlay install 0.9.x → 0.10.0 (schema 12→13 indexes only).
