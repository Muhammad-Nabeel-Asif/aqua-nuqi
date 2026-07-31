# Phase 7 — Bottle Inventory, Vehicles & Trip Reconciliation

**Goal:** the owner knows how many bottles he owns, where every one of them is, and whether the
cash and bottles a driver brings back match what went out. Bottles are his biggest recoverable
asset and his biggest silent loss.

**Depends on:** Phases 1, 2, 5, 6. **Blocks:** Phase 8 (asset & loss reporting).

Read `AGENT-BRIEF.md` first. Schema: `03-data-model.md` §H.

---

## Scope

Requirements: FR-IN-01…08, FR-EX-06 (vehicle attribution).

### 7.1 Migration
Create `vehicles`, `trips`, `stock_movements`. Add the deferred FKs `deliveries.trip_id` and
`expenses.vehicle_id`.

### 7.2 Stock movement engine
- `stockService.record(tx, movement)` — the only way rows enter `stock_movements`.
- `stockService.getBalances(asOf?)` returning, per product:
  `{ filledAtPlant, emptyAtPlant, filledInVans, emptyInVans, withCustomers, scrapped, totalOwned }`
  derived from the movement ledger.
- Follow the movement recipes table in `03-data-model.md` §H exactly.
- Performance: derive balances from a single grouped query. If it becomes slow, add a
  `stock_balances` summary table maintained in the same transaction (same pattern as
  `customer_balances`), with a rebuild function.

### 7.3 Wire deliveries into stock (important)
- Modify `deliveryService.upsertDelivery` (Phase 2) so every insert/update/void writes the
  corresponding movements inside the same transaction:
  - `filled: van|plant → customer` for the quantity
  - `empty: customer → van|plant` for empties collected
  - Updating a delivery reverses the previous movements and writes new ones (or writes a delta —
    choose one and document it; reversal is easier to reason about).
- **Backfill migration**: generate movements for all deliveries recorded before this phase, so
  historical stock is correct. Make it idempotent and log how many rows were created.
- Add a consistency test: `withCustomers` from `stock_movements` equals
  `Σ customer_balances.bottles_with_customer`.

### 7.4 Stock operations — `/inventory`
Dashboard cards: filled at plant, empty at plant, in vans, with customers, scrapped, **total
bottles owned**, and a low-stock warning against `inventory.lowStockThreshold`.

Actions (each a small dialog, each writing movements and audit entries):
- **Opening stock** — a one-time setup entry per product and state, allowed only until other
  movements exist for that product (then only via an explicit adjustment).
- **Purchase bottles** — date, quantity, unit cost, vendor. Creates `supplier → plant (empty)`
  movements **and** an expense in "Bottle purchase" via `expenseService.createExpense` with
  `source = 'purchase'`.
- **Production / filling** — date, quantity filled (empty → filled at plant). Optional shift and
  operator.
- **Damage / loss / scrap** — date, quantity, state, reason (broken, cap damaged, stolen, lost by
  customer). If lost at a customer, offer to also create a `lost_bottle` adjustment charging that
  customer (Phase 3 `customer_adjustments`).
- **Manual adjustment** — after a physical count, with a mandatory reason. Records the difference,
  never a silent overwrite.

Movement history table with filters (date range, product, reason, location, vehicle, customer),
running balances and export.

### 7.5 Vehicles — `/inventory/vehicles`
CRUD for vehicles (name, registration, type, capacity, active). Per-vehicle view: trips, fuel and
maintenance expenses in a date range, bottles carried, and cost per bottle carried.

### 7.6 Trips / daily van reconciliation — `/inventory/trips`
This is the theft-control feature; make it fast and obvious.

**Start of day (Load out):** date, employee, vehicle, route, filled bottles loaded, empties loaded
(usually 0). Creates `filled: plant → van`. Trip status `open`.

**During the day:** deliveries entered on the daily screen can be linked to the open trip for that
employee/date (auto-link when an open trip matches employee + date; otherwise leave `trip_id`
null).

**End of day (Close trip):** enter filled bottles returned, empties brought back, and cash
submitted. The app shows, side by side:

| | Expected | Actual | Variance |
|---|---|---|---|
| Filled bottles | loaded − delivered | entered | ← highlight if ≠ 0 |
| Empties | Σ empties collected on linked deliveries | entered | ← highlight if ≠ 0 |
| Cash | Σ `cash_collected` on linked deliveries | entered | ← highlight if ≠ 0 |

- Closing writes `filled: van → plant`, `empty: van → plant`, sets `cash_variance` and
  `bottle_variance`, and requires a note when any variance is non-zero.
- A trip cannot be closed while its date's period is closed.
- Trip list with filters and a variance column; a per-employee variance summary feeding the
  Phase 6 performance view.
- Trips are **optional**: if the owner does not use them, deliveries still work and stock moves
  directly plant → customer. Do not make trips mandatory.

### 7.7 Bottles with customers — `/inventory/bottles-out`
- Table: customer, bottles held, security deposit held, deposit shortfall
  (`bottles × default_deposit − deposit_held`), last delivery, last empty return, days since last
  return, phone, area/route.
- Filters: minimum bottles, shortfall only, no return in N days.
- Sort by bottles held descending by default — this is the recovery worklist.
- Actions: WhatsApp the customer, charge for lost bottles (creates a `lost_bottle` adjustment),
  record a bottle return without a delivery.
- Summary: total bottles with customers, total value at deposit rate, total deposit shortfall.
- Export to PDF/Excel.

### 7.8 Low stock alert (FR-IN-08)
Dashboard warning when filled bottles at plant fall below the threshold, with the average daily
consumption of the last 14 days and an estimated "days of stock left".

---

## Out of scope
Per-bottle barcode/serial tracking, supplier/purchase-order management, raw-material and
consumables inventory (caps, seals) beyond recording their cost as an expense.

## Acceptance criteria

1. After entering opening stock of 500 empty and 200 filled bottles at the plant, the dashboard
   shows total owned = 700.
2. Delivering 3 bottles and collecting 3 empties leaves the total owned unchanged and moves 3
   from filled-at-plant to with-customers and 3 back as empty-at-plant.
3. Delivering 3 and collecting 0 increases `withCustomers` by 3 and total owned stays the same.
4. Voiding that delivery reverses both movements exactly.
5. The backfill migration makes `withCustomers` from movements equal the sum of
   `customer_balances.bottles_with_customer` across all customers.
6. Recording a purchase of 100 bottles at Rs 350 each increases empty-at-plant by 100 and creates
   a Rs 35,000 "Bottle purchase" expense that is read-only in the expense screen.
7. Scrapping 5 damaged bottles reduces total owned by 5 and appears in the movement history with
   its reason.
8. A trip loaded with 60 filled bottles, 52 delivered, 6 returned, shows a bottle variance of 2 and
   refuses to close without a note.
9. Cash expected on that trip equals the sum of `cash_collected` on its linked deliveries, and a
   Rs 500 shortfall is shown in red and appears in the employee's variance summary.
10. Deliveries continue to work normally when no trip is open.
11. The bottles-out report matches a manual calculation for 5 sampled customers.
12. `typecheck`, `lint`, `test`, `build` pass; `PROGRESS.md` and `CHANGELOG.md` updated.

## Notes for the next phase
Record in `PROGRESS.md`: the `getBalances` shape, whether a `stock_balances` summary table was
added, and how delivery updates write movements (reversal vs delta).
