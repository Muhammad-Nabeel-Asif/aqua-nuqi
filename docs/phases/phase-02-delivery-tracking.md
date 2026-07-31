# Phase 2 — Delivery Tracking (the core module)

**Goal:** replace the paper card completely. The owner or operator can record every day's bottle
deliveries and empty returns for every customer, faster than writing on paper, and see live totals.

**Depends on:** Phases 0, 1. **Blocks:** Phases 3, 7, 8.

Read `AGENT-BRIEF.md` first. Schema: `03-data-model.md` §D.

> This is the phase the whole product is judged on. Data entry speed matters more than anything
> else here. Re-read `04-ui-ux-guidelines.md` §3 before writing UI code.
>
> **Hard performance target.** The business owner personally types every day's deliveries in the
> evening from paper slips. Entering **100 customers must take under 4 minutes, keyboard only, with
> no mouse.** Time this yourself against the seeded dataset and record the measured number in
> `PROGRESS.md`. If it misses the target, this phase is not complete — fix the interaction design,
> not the target.

---

## Scope

Requirements: FR-DL-01…14, FR-CU-08 (live bottle balance), FR-DB-01 (delivery cards on dashboard).

### 2.1 Migration
Create `deliveries` with the partial unique index `uq_delivery_slot` and all indexes from the data
model. `deliveries.trip_id` references `trips` (Phase 7) — create the column without the FK now and
add the constraint in Phase 7.

### 2.2 Delivery service

```ts
upsertDelivery(input: {
  customerId, productId?, date, quantity, emptiesCollected?, employeeId?,
  isFree?, freeReason?, cashCollected?, notes?
}): Delivery
```

Behaviour:
- `guardPeriodOpen(date)` first; throw `PERIOD_LOCKED` if the month is closed.
- If a recorded row exists for `(customer, date, product)` → update it; else insert.
- Reject the update with `DELIVERY_INVOICED` if the existing row has an `invoice_id`.
- `productId` defaults to the default product.
- `rate` is snapshotted from `rateService.getRateFor(customerId, productId, date)` **on insert**.
  On update, keep the original rate unless the user explicitly overrides it (an editable rate field
  in the detail dialog, which sets a `rate_overridden` note).
- `amount = quantity * rate`, or `0` when `isFree` or when the customer is on `monthly_package`.
- `emptiesCollected` defaults to `quantity` when not supplied on insert.
- `quantity = 0` → set `status = 'void'` instead of deleting.
- Update `customer_balances.bottles_with_customer` and `last_delivery_date` in the same
  transaction.
- Write an audit entry.

Also: `voidDelivery(id, reason)`, `getMonthGrid(period, filters)`, `getCustomerCard(customerId,
period)`, `getDayList(date, filters)`, `getDeliverySummary(range, groupBy)`.

`getMonthGrid` must return in one query: for each customer in the filter, an array of
`{ day, quantity, emptiesCollected, amount, deliveryId }`, plus row totals. Pivot in memory, do not
issue one query per customer.

### 2.3 Screen: Daily Entry — `/deliveries/daily`
The primary screen for everyday use.

- Header: date picker (defaults to today, with ◀ ▶ day arrows and a "Today" button), route filter,
  area filter, employee selector, and a search box.
- Body: a list of active customers matching the filter. Columns: customer name + code (sticky),
  area/route, rate, **Qty** (editable), **Empties** (editable), amount (computed), cash collected
  (optional column, hidden by default), note icon, saved indicator.
- Defaults: if the customer has a schedule and today matches, pre-fill the suggested quantity in a
  ghost/placeholder style (not saved until confirmed).
- Keyboard: type a number in Qty → `Enter` saves and moves to the next customer's Qty;
  `Tab` moves to Empties; `↑/↓` move between rows; `Esc` reverts the cell.
- Autosave per row (debounced ~400 ms) with optimistic update and rollback + toast on failure.
- Sticky footer: customers served, total bottles out, total empties in, total amount, total cash.
- "Copy from previous delivery day" action: pre-fills quantities from the last day this
  route had deliveries, for review before saving (never auto-saves).
- Sorting follows the route's `sort_order` so it matches the driver's physical sequence.

### 2.4 Screen: Month Matrix — `/deliveries/matrix`
- Month picker; filters for route/area/status; search.
- Grid: customers as rows (sticky first column), days 1..N as columns, plus **Total units** and
  **Total amount** columns. Column footers show per-day totals.
- Cells are directly editable (same keyboard rules). A cell shows quantity; hovering shows
  quantity/empties/amount; a small marker indicates empties ≠ quantity or a note exists.
- Virtualised in both directions; must stay smooth with 500 customers × 31 days.
- Cells in a closed period or attached to an issued invoice render read-only with a lock icon.
- Weekend/holiday columns are visually tinted.
- Export the visible matrix to Excel/CSV and to a print-friendly PDF (basic HTML print is enough
  here; the polished PDF engine arrives in Phase 4).

### 2.5 Screen: Customer Card — `/customers/:id/card/:period`
The exact digital twin of the paper card, also embedded as a tab on the customer detail page.
- A calendar-style month grid (weeks as rows, days as cells), each day cell showing the units for
  that day and an editable input.
- Header: customer name, code, rate, month navigation.
- Summary panel: total units this month, total amount, empties returned, **bottles currently with
  customer**, last delivery date, current balance.
- Actions: print this card, generate bill for this month (enabled in Phase 3).

### 2.6 Delivery detail dialog
Opened from any cell/row via a context action. Shows and edits: date, customer, product, quantity,
empties, rate (with an override toggle and reason), amount, free flag + reason, employee, cash
collected, notes. Shows created/updated by and when. Has "Void delivery" with a required reason.

### 2.7 Bottle balance
- `bottles_with_customer` maintained per the formula in `03-data-model.md` §J.
- Shown on the customer list, customer detail, delivery screens and the card.
- A "Bottles Out" list: customers sorted by bottles held descending, with days-since-last-return,
  and a highlight when bottles held exceed what the security deposit covers
  (`bottles_held × product.default_deposit > security_deposit_held`).
- Empties can also be collected **without** a delivery (customer returns bottles and stops
  service): support a quantity of 0 with empties > 0.

### 2.8 Walk-in / cash sale (FR-DL-12)
- A quick dialog: date, quantity, rate (default product rate), amount, cash received, optional
  name/phone.
- Implemented as a delivery against a system customer `WALK-IN` (auto-created, type `walk_in`,
  excluded from invoicing and from the receivables report) with `cash_collected` set.

### 2.9 Missed-delivery indicator (FR-DL-14)
- On the daily entry screen and the dashboard: customers with a schedule whose last delivery is
  older than their expected interval, and customers with no delivery for N days (N configurable,
  default 10). Not a blocking alert — an informational list with a link to call/WhatsApp them.

### 2.10 Dev seed
Extend the seed to generate 3–6 months of realistic deliveries (varied frequencies, some months
with gaps) so performance and month-boundary behaviour can be verified.

---

## Out of scope
Invoices, payments, ledger effects of deliveries (Phase 3), trips and van reconciliation
(Phase 7), stock movements (Phase 7 — but see the note below).

> **Note for Phase 7:** deliveries must eventually create `stock_movements`. Do **not** write
> movement rows in this phase. Phase 7 will add a backfill routine that derives movements from
> existing deliveries. Say so explicitly in `PROGRESS.md`.

## Acceptance criteria

1. Entering `3` in a Qty cell saves within 100 ms, sets empties to 3 by default, computes the
   amount from the customer's rate for that date, and updates the footer totals.
2. Entering a second value for the same customer and date updates the same row — the database has
   exactly one recorded delivery row for that customer/date/product.
3. Clearing a cell voids the delivery; the row disappears from totals but still exists in the
   database with `status = 'void'` and appears in the audit log.
4. Empties can be set independently of quantity, including 0 and including quantity 0 with
   empties 5.
5. `bottles_with_customer` equals `opening + Σqty − Σempties − lost/damaged` for every customer,
   verified by a test comparing the summary table to a live aggregate.
6. A rate change effective 1 Aug does not alter the amount stored on July deliveries.
7. Closing period `2026-07` makes all July cells read-only and any write returns `PERIOD_LOCKED`.
8. The month matrix with 500 customers loads in under 1.5 s and scrolls at 60 fps.
9. **Timed test:** entering quantities for 100 consecutive customers on the daily screen takes
   under 4 minutes using the keyboard only, with no mouse contact at any point. Record the actual
   measured time in `PROGRESS.md`.
10. Losing focus mid-typing still saves the value; killing the app mid-entry loses at most the
    single cell being typed.
11. Walk-in sale records revenue and stock outflow intent without creating a billable customer.
12. `typecheck`, `lint`, `test`, `build` pass; `PROGRESS.md` and `CHANGELOG.md` updated.

## Notes for the next phase
Record in `PROGRESS.md`: the delivery DTO, the `getMonthGrid` response shape, how `invoice_id`
locking is enforced, and confirmation that stock movements are deliberately deferred to Phase 7.
