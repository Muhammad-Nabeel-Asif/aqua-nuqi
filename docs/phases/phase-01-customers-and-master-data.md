# Phase 1 — Customers, Master Data & Pricing

**Goal:** the owner can put his entire customer book into the app, with correct rates, opening
balances and opening bottle counts — so Phase 2 can start recording deliveries against real data.

**Depends on:** Phase 0. **Blocks:** Phases 2, 3, 7.

Read `AGENT-BRIEF.md` first. Schema: `03-data-model.md` §B and §C.

---

## Scope

Requirements: FR-CU-01…14, FR-PR-01, FR-PR-03, FR-PR-04, FR-SY-10 (master-data tabs).

### 1.1 Migration
Create: `areas`, `routes`, `products` (if not created in Phase 0), `customers`, `customer_rates`,
`customer_schedules`, `customer_balances`. Add all indexes listed in the data model.

Note: `routes.default_employee_id` references `employees`, which does not exist until Phase 6.
Create the column **without** the foreign key now and add the FK in the Phase 6 migration, or
create a minimal `employees` table stub in this migration. Choose one and record it in
`PROGRESS.md`.

### 1.2 Master data management (Settings → Master Data)
- **Areas**: list, create, rename, deactivate. Cannot deactivate an area still used by active
  customers (show which ones).
- **Routes**: same, plus area assignment and sort order (drag to reorder).
- **Products**: list, create, edit. The seeded `19 L Bottle` is marked `is_default` and cannot be
  deleted. Fields: name, size, kind, returnable, default rate, default deposit, track stock.
- All three are simple table + side-panel-form screens.

### 1.3 Customer CRUD
- `/customers` list: virtualised table with columns — code, name, phone, area, route, rate,
  bottles held, balance, status. Search across name/code/phone/address. Filters: area, route,
  status, customer type, "has outstanding", "holds bottles".
- Sort by any column. Row click opens the detail page. Bulk actions: change route, change area,
  change status, apply rate change.
- **Create/Edit form** with sections:
  - *Identity*: name, type, code (auto, editable before first save), joining date, status.
  - *Contact*: primary phone, secondary phone, WhatsApp (defaults to primary), email, address,
    landmark, area, route, delivery notes.
  - *Billing*: billing mode (per-bottle / monthly package), rate (per-bottle) **or** package
    amount + included quantity + excess rate, billing day, credit limit.
  - *Opening balances* (only editable while the customer has no transactions): opening bottles,
    opening balance, opening as-of date, security deposit held.
- Validation: name required; phone digits/format check but not mandatory; unique code; package
  fields required when billing mode is package; opening as-of required if any opening is non-zero.
- Deactivating asks for a reason and warns if the customer has an outstanding balance or holds
  bottles.

### 1.4 Rates with history
- `rateService.getRateFor(customerId, productId, onDate)` — the single function every other module
  must use to price a delivery.
- Fallback chain: active `customer_rates` row for the date → `products.default_rate`.
- Changing a rate: dialog asking for the new rate and an effective-from date (default = today,
  or 1st of next month via a quick option), plus a reason. Closes the previous row by setting
  `effective_to = effective_from - 1 day` and inserts a new row. Never updates an existing rate.
- Warn clearly if the effective date falls inside an already-invoiced or closed period.
- Customer detail shows the full rate history.
- **Bulk rate change tool** (FR-PR-04): filter customers (area / route / type / current rate),
  preview the affected list with old → new rate, choose effective date, apply in one transaction.

### 1.5 Opening balances & the balances table
- Creating a customer with an opening balance writes a `ledger_entries` row of type
  `opening_balance` (create the `ledger_entries` table here or in Phase 3 — if Phase 3, store the
  opening on the customer row and have Phase 3 backfill; decide and record it).
  **Recommended:** create `ledger_entries` in this phase and write the opening entry immediately.
- `customer_balances` row is created with the customer and kept in sync.
- `balanceService.recalculate(customerId?)` maintenance function that rebuilds
  `customer_balances` from source tables. Expose it in Settings → About as "Recalculate balances".
- Unit test: after random sequences of openings, the summary equals the aggregate.

### 1.6 Customer detail page
Tabs (later phases fill some of them):
- **Overview** — profile card, contact actions (copy phone, open WhatsApp chat), current balance,
  bottles held, security deposit, rate, status, quick actions (edit, change rate, record payment
  [Phase 3], deactivate).
- **Delivery card** — placeholder until Phase 2.
- **Ledger** — placeholder until Phase 3.
- **Invoices** — placeholder until Phase 3.
- **History** — audit entries for this customer.

### 1.7 Delivery schedule (FR-CU-10)
- Optional per customer: weekdays / every N days / on call, and a default quantity.
- Stored in `customer_schedules`. No behaviour yet — Phase 2 uses it to pre-fill the daily list.

### 1.8 Import & export
- **CSV/Excel import** (FR-CU-12): upload → column mapping UI → validation preview with per-row
  errors → import inside one transaction → summary report. Supported columns: name, type, phone,
  phone2, whatsapp, address, area, route, rate, billing mode, package amount, opening balance,
  opening bottles, opening as-of, deposit, joining date, notes. Unknown areas/routes are created
  on the fly after confirmation. Provide a downloadable template file.
- **Export** customers to CSV/Excel with current balance and bottles held.

### 1.9 Global search
- Ctrl+K searches customers by name, code, phone, address, and navigates to the detail page.

### 1.10 Dev seed
- A dev-only command that generates ~200 realistic customers across 6 areas / 10 routes with
  varied rates, some paused, some with opening balances.

---

## Out of scope
Deliveries, invoices, payments (beyond the opening ledger entry), documents/photos on customers.

## Acceptance criteria

1. Create, edit, deactivate and reactivate a customer; the code auto-increments and is unique.
2. A customer created with opening balance Rs 3,500 and 4 opening bottles shows exactly that in
   the list and on the detail page, and has an `opening_balance` ledger entry.
3. Changing a customer's rate from Rs 60 to Rs 70 effective 1 Aug leaves
   `getRateFor(customer, product, '2026-07-20') = 6000` and
   `getRateFor(customer, product, '2026-08-05') = 7000`.
4. The old rate row has `effective_to = '2026-07-31'` and no rate row was updated in place.
5. Bulk rate change applied to 40 customers creates 40 new rate rows in one transaction, and
   rolls back completely if one fails.
6. Importing a 200-row CSV with 3 invalid rows imports nothing and reports the 3 errors with row
   numbers; fixing them and re-importing succeeds.
7. The customer list with 1,000 customers renders and filters in under 500 ms (NFR-02).
8. Ctrl+K finds a customer by the last 4 digits of their phone number.
9. "Recalculate balances" produces identical values to the stored summary.
10. Deactivating an area used by active customers is blocked with a clear message.
11. All mutations appear in the audit log with before/after values.
12. `typecheck`, `lint`, `test`, `build` pass; `PROGRESS.md` and `CHANGELOG.md` updated.

## Notes for the next phase
Record in `PROGRESS.md`: the `rateService.getRateFor` signature, whether `ledger_entries` was
created here, how `customer_balances` is updated, and the customer DTO shape.
