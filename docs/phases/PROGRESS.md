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

**Date:** 2026-08-01 · **Status:** complete · **package.json:** `0.4.0`

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

### Measured entry time (criteria 9)

- **100 consecutive customer upserts (keyboard autosave path): 0.65 s** (unit test
  `timed keyboard-path`, ~6.5 ms/row). Far under the 4-minute hard target.
- At a conservative human pace of ~1 s per customer (digit + Enter, no mouse), 100 rows
  complete in **~100 s (~1.7 min)**. Backend is not the bottleneck.

### Stock movements — deferred to Phase 7

- **This phase does NOT write `stock_movements` rows.** Phase 7 will create movements on
  new deliveries and ship a backfill that derives movements from historical `deliveries`.

### Deviations from the spec

- `customer_adjustments` created early (minimal) for FR-DL-11 damaged/lost bottle counts;
  no ledger / invoice effects yet (Phase 3).
- Bottles-out lives at `/deliveries/bottles-out` for Phase 2; UI inventory route remains
  Phase 7 per screen inventory.
- Generated migration initially re-added `customer_schedules.deleted_at` (missing 0002
  snapshot); hand-removed that ALTER from `0003`.

### What the next phase must know

- Snapshot rate via `rates.getRateFor` on **insert only**; updates keep original rate unless
  detail dialog override (tagged in `notes` as `[rate_overridden: …]`).
- `amount = qty * rate` for `per_bottle`; `0` when `isFree` or `monthly_package`.
- Qty 0 + empties 0 ⇒ `status = 'void'`; qty 0 + empties > 0 stays `recorded` (returns only).
- Partial unique index `uq_delivery_slot` on `(customer_id, delivery_date, product_id)
WHERE status = 'recorded'`.
- `balanceService.computeLiveBottles` now includes deliveries + adjustments automatically;
  delivery writes call `upsertSummary` with `lastDeliveryDate` in the same transaction.
- Walk-in system customer code `WALK-IN` (`customer_type = 'walk_in'`) — exclude from
  invoicing / receivables in Phase 3.
- **Next phase is Phase 3 (Billing & payments).** When issuing an invoice, set
  `deliveries.invoice_id` so Phase 2 locks continue to work. Add FK to `invoices` then.

### Escalations / questions for the human

- None blocking. Confirm early `customer_adjustments` table is acceptable for Phase 3 to extend
  rather than recreate.
