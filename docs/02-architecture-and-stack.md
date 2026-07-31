# Aqua Nuqi — Architecture & Technology Stack

> Decisions here are **binding**. If a phase document conflicts with this file, this file wins.
> If you believe a decision is wrong, raise it — do not silently substitute a different library.

## 1. Stack

| Concern | Choice | Why |
|---|---|---|
| Shell | **Electron** (latest stable) | Required: installable desktop app, offline, filesystem + printing access |
| Build tooling | **electron-vite** + **electron-builder** | Fast HMR for renderer, straightforward NSIS packaging |
| Language | **TypeScript**, `strict: true` everywhere | Money and quantities must not be mistyped |
| UI | **React 18+** | Team familiarity, large ecosystem |
| Styling | **Tailwind CSS** + **shadcn/ui** (Radix primitives) | Fast, consistent, accessible components, no heavy theme runtime |
| Routing | **React Router** (hash/memory router) | Works inside `file://` packaged app |
| Server state | **TanStack Query** | Caching, invalidation and optimistic updates over IPC |
| Client state | **Zustand** (small, for UI-only state) | Avoid Redux boilerplate |
| Tables/grids | **TanStack Table** + **TanStack Virtual** | Month matrix with 1000 rows × 31 columns must virtualise |
| Forms | **React Hook Form** + **Zod** resolver | Single validation schema reused on both sides of IPC |
| Database | **SQLite** via **better-sqlite3** | Synchronous, fastest embedded option, zero-config, WAL mode |
| Query layer | **Drizzle ORM** (SQLite driver) + `drizzle-kit` migrations | Typed schema, real SQL migrations checked into git |
| Validation | **Zod** — one schema per IPC channel | NFR-07 |
| Charts | **Recharts** | Simple, adequate for bar/line/pie |
| Dates | **date-fns** | Tree-shakeable, no timezone surprises |
| PDF | **Electron `webContents.printToPDF`** on a hidden `BrowserWindow` rendering a React template | No extra native dependency, pixel-accurate, reuses our React + Tailwind stack for layout |
| Logging | **electron-log** | Rotating file logs in userData |
| Auto-update | **electron-updater** (optional, Phase 9) | |
| Testing | **Vitest** (unit, main-process logic) + **Playwright** (`@playwright/test` with Electron) for a few smoke flows | Business math must be unit-tested |
| Lint/format | ESLint + Prettier, `eslint-plugin-import` boundaries | |

**Do not add** an HTTP server, ORM other than Drizzle, Prisma (poor Electron packaging story),
Puppeteer/headless Chrome (Electron already is one), Moment.js, or any cloud SDK.

## 2. Process model

```
┌──────────────────────────────── Electron ────────────────────────────────┐
│                                                                          │
│  MAIN PROCESS (Node)                    RENDERER (Chromium, sandboxed)   │
│  ┌────────────────────────────┐         ┌──────────────────────────────┐ │
│  │ app bootstrap, windows      │        │ React app                    │ │
│  │ IPC router  ── validates ──►│        │  ├── pages/                  │ │
│  │ services (business logic)   │        │  ├── features/               │ │
│  │ repositories (Drizzle)      │◄──IPC──┤  ├── components/ui           │ │
│  │ SQLite (better-sqlite3)     │        │  └── lib/api.ts (typed IPC)  │ │
│  │ pdf, backup, audit, auth    │        │                              │ │
│  └────────────────────────────┘         └──────────────────────────────┘ │
│                 ▲                                     ▲                  │
│                 └────────── PRELOAD (contextBridge) ──┘                  │
└──────────────────────────────────────────────────────────────────────────┘
```

- The renderer **never** imports `fs`, `path`, `better-sqlite3` or any Node module.
- The preload exposes exactly one object: `window.api.invoke(channel, payload)` plus a small
  `window.api.on(event, cb)` for push events (backup finished, update available).
- On top of that, `src/renderer/lib/api.ts` exposes a **typed** client generated from the shared
  contract so call sites look like `api.customers.list({ search })`.

## 3. Folder structure

```
aqua-nuqi/
├─ electron.vite.config.ts
├─ electron-builder.yml
├─ drizzle.config.ts
├─ package.json
├─ docs/                          # these documents
├─ resources/                     # icons, installer assets, seed logo
├─ drizzle/                       # generated SQL migrations (committed)
└─ src/
   ├─ main/
   │  ├─ index.ts                 # app lifecycle, window creation
   │  ├─ ipc/
   │  │  ├─ router.ts             # registers all handlers, validates with Zod
   │  │  └─ handlers/<domain>.ts
   │  ├─ services/                # business logic, pure and unit-testable
   │  │  ├─ customer.service.ts
   │  │  ├─ delivery.service.ts
   │  │  ├─ billing.service.ts
   │  │  ├─ ledger.service.ts
   │  │  ├─ expense.service.ts
   │  │  ├─ payroll.service.ts
   │  │  ├─ inventory.service.ts
   │  │  ├─ report.service.ts
   │  │  ├─ pdf.service.ts
   │  │  ├─ backup.service.ts
   │  │  ├─ audit.service.ts
   │  │  └─ auth.service.ts
   │  ├─ db/
   │  │  ├─ client.ts             # better-sqlite3 + drizzle instance, pragmas
   │  │  ├─ schema/               # drizzle table definitions, one file per domain
   │  │  ├─ migrate.ts            # runs pending migrations at boot
   │  │  └─ seed.ts
   │  └─ lib/                     # money, dates, ids, errors, logger
   ├─ preload/
   │  └─ index.ts
   ├─ shared/                     # imported by BOTH main and renderer
   │  ├─ contracts/               # Zod schemas + TS types per IPC channel
   │  ├─ constants.ts
   │  └─ money.ts, date.ts        # pure helpers, no Node APIs
   └─ renderer/
      ├─ index.html
      └─ src/
         ├─ App.tsx, router.tsx
         ├─ lib/api.ts, queryClient.ts
         ├─ components/ui/        # shadcn components
         ├─ components/           # shared app components
         ├─ features/<domain>/    # pages + hooks + components per domain
         └─ styles/
```

## 4. IPC contract rules

1. Channel naming: `domain:action` — `customers:list`, `deliveries:upsert`, `invoices:generateBatch`.
2. For every channel there is exactly one file in `src/shared/contracts/` exporting:
   ```ts
   export const listCustomersInput  = z.object({ search: z.string().optional(), /* … */ });
   export const listCustomersOutput = z.object({ items: z.array(customerDto), total: z.number() });
   export type ListCustomersInput  = z.infer<typeof listCustomersInput>;
   ```
3. `router.ts` validates input with the Zod schema before calling the service, and (in dev only)
   validates output too.
4. Handlers **never** contain business logic. They parse → call a service → map to a DTO.
5. All errors thrown in main are converted to a serialisable
   `{ code, message, details? }` shape. Use typed error codes
   (`PERIOD_LOCKED`, `INVOICE_ALREADY_ISSUED`, `DUPLICATE_CODE`, `VALIDATION_FAILED`, …) so the
   renderer can show the right message. Never leak stack traces to the UI.
6. Mutations return the updated entity so TanStack Query can update the cache.

## 5. Database rules

- Open with:
  ```ts
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('synchronous = NORMAL');
  db.pragma('busy_timeout = 5000');
  ```
- File location: `app.getPath('userData')/data/aqua-nuqi.db`. It may be relocated from settings,
  but the chosen path is stored in a small JSON config file inside `userData` (never in the
  database, and never inside the install directory). The resolved path must always be outside the
  install directory — see `docs/07-data-lifecycle-and-upgrades.md` §3.1.
- **`appId`, `productName` and `package.json` `name` are frozen** after the first stable release
  (`com.aquanuqi.app` / `Aqua Nuqi` / `aqua-nuqi`). `userData` is derived from them; renaming
  points the app at an empty folder and the client's data appears to vanish.
- Migrations are **forward-only** SQL files in `drizzle/`, applied at boot inside a transaction,
  after taking an automatic pre-migration backup. An app whose bundled migrations are **older**
  than `app_meta.schema_version` must refuse to open the database rather than risk it.
- Every table has `created_at` and `updated_at` (ISO-8601 UTC text). Mutable business entities also
  have `deleted_at` (soft delete) or a `status`/`void` flag — see the data model.
- Every foreign key is declared and indexed.
- Multi-table writes use `db.transaction(...)`.

## 6. Money — the single most important convention

- All monetary values are **integers in paisa**. `Rs 60.00` is stored as `6000`.
- Column type `INTEGER`. Never `REAL`. Never a JS float.
- Only `src/shared/money.ts` converts between paisa and display strings:
  ```ts
  type Paisa = number & { readonly __brand: 'Paisa' };
  toPaisa(rupees: number | string): Paisa
  toRupees(p: Paisa): number
  formatMoney(p: Paisa): string            // "Rs 1,250"
  parseMoneyInput(text: string): Paisa
  ```
- Rounding: round **half up** to the nearest paisa, and only at the final step of a calculation.
- Quantities (bottles) are plain non-negative integers.

## 7. Dates

- Business dates (`delivery_date`, `issue_date`, `expense_date`, …) are stored as `TEXT` in
  `YYYY-MM-DD`, **local calendar dates with no timezone**. Never store a UTC timestamp for a
  business date — a delivery on 31 July must not become 30 July.
- Audit/system timestamps are stored as ISO-8601 UTC text (`2026-07-31T10:15:00.000Z`).
- Billing periods are `YYYY-MM` text.
- All date maths lives in `src/shared/date.ts`.

## 8. Cross-cutting services every phase must respect

| Service | Rule |
|---|---|
| **Audit** | Any service mutating a business entity calls `auditService.record(...)` inside the same transaction. |
| **Period lock** | Any service writing a row that belongs to a period calls `guardPeriodOpen(date)` first, which throws `PERIOD_LOCKED`. |
| **Auth** | Every IPC handler declares the roles allowed to call it; the router enforces it. |
| **Settings** | Read through `settingsService.get<T>(key)` with typed keys and defaults — never read raw rows. |

## 9. Performance guidance

- Index `deliveries(delivery_date)`, `deliveries(customer_id, delivery_date)`,
  `ledger_entries(customer_id, entry_date)`, `expenses(expense_date)`.
- For the month matrix, load one month at a time with a single query returning
  `(customer_id, day, quantity)` and pivot in memory.
- Maintain a `customer_balances` **materialised summary table** updated inside the same transaction
  as ledger writes (balance, bottles_with_customer, last_delivery_date, last_payment_date), so list
  screens never aggregate millions of rows. It must be rebuildable from scratch by a
  `recalculateBalances()` maintenance action, and a unit test must assert the summary equals the
  aggregate.
- Virtualise any list that can exceed 200 rows.

## 10. Confirmed scope decisions

These are settled. Do not build for them, and do not leave hooks for them beyond what is stated.

| Decision | Ruling | Consequence |
|---|---|---|
| **Multi-branch** | **No.** Single plant only. | Do **not** add `branch_id` to any table. If a second plant ever happens it is a v2 migration. |
| **Concurrent users on different machines** | **No.** One laptop, one database file. | No sync, no network layer, no file-locking across machines. State the limitation in the handover doc. |
| **Daily data entry** | The **owner alone** enters deliveries each evening from the drivers' paper slips. | The daily entry screen is the highest-value screen in the product — optimise it above everything else. Target: 100 customers entered in under 4 minutes, keyboard only. Measure this and report the number in `PROGRESS.md` for Phase 2. |
| **Operator/viewer roles** | Build them (they are cheap and the role check must exist anyway), but they are **secondary**. Never trade daily-entry speed for multi-user polish. | |

## 11. Future-proofing (design for it, do not build it)

- A future mobile app for delivery staff will sync deliveries. Therefore:
  - Give every business row a `uuid TEXT UNIQUE` in addition to the integer primary key.
  - Keep `created_at` / `updated_at` on everything.
  - Prefer append-only ledgers over destructive updates.
- Keep all business logic in `src/main/services` with **no Electron imports**, so it can later be
  lifted into a shared package or a server.

## 12. Definition of Done (applies to every phase)

A phase is complete only when all of the following are true:

1. All requirements listed in the phase's scope are implemented and manually verified.
2. `npm run typecheck`, `npm run lint` and `npm run test` all pass with zero errors.
3. New tables/columns are added via a committed migration; no hand-edited database.
4. Business-logic services added in the phase have unit tests, including edge cases with money
   rounding and month boundaries.
5. All new IPC channels have Zod contracts and role restrictions.
6. All new mutations write audit entries and respect the period lock.
7. The app builds and launches in production mode (`npm run build && npm run start:prod`).
8. `docs/CHANGELOG.md` gets a short entry, and `docs/phases/PROGRESS.md` is updated with what was
   built, any deviations from the spec, and anything the next phase must know.
9. **From Phase 0B onwards:** bump the minor version in `package.json`, push to `main`, trigger a
   **stable** release, run the upgrade test (install the new build over the previous one and
   confirm existing data survives), and record the release version and link in `PROGRESS.md`.
