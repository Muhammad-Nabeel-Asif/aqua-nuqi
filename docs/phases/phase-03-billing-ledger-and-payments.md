# Phase 3 — Billing, Customer Ledger & Payments

**Goal:** turn recorded deliveries into money. Monthly invoices, a correct running account per
customer, payment recording, and a receivables view the owner can act on.

**Depends on:** Phases 0, 1, 2. **Blocks:** Phases 4, 8.

Read `AGENT-BRIEF.md` first. Schema: `03-data-model.md` §E and §J.

> Accuracy beats features here. Every number on an invoice must be reproducible months later.

---

## Scope

Requirements: FR-BL-01…14, FR-CU-11 (ledger/invoice tabs), FR-SY-08 (period close UI).

### 3.1 Migration
Create `invoices`, `invoice_lines`, `customer_adjustments`, `payments`, `payment_allocations`,
and `ledger_entries` if Phase 1 did not create it. Add the FK from `deliveries.invoice_id` to
`invoices.id` (deferred from Phase 2).

### 3.2 Ledger service (build this first — everything else sits on it)

```ts
appendEntry(tx, { customerId, date, type, debit, credit, description, refTable, refId })
getLedger(customerId, { from?, to? }): LedgerRow[]     // with running balance
getBalance(customerId, asOf?): Paisa
reverseEntriesFor(tx, refTable, refId, reason)          // appends void_reversal rows
recalculateLedger(customerId)                           // rebuild balance_after chain
```

Rules:
- Append-only. Corrections are new entries, never updates or deletes.
- `balance_after` is maintained; inserting a back-dated entry recomputes `balance_after` for all
  later rows of that customer inside the same transaction.
- Every append updates `customer_balances.balance` in the same transaction.
- Deposits (`deposit_received` / `deposit_refunded`) affect the ledger balance but are tagged so
  reports can exclude them from revenue.
- Unit test: for 1,000 randomly ordered entries including back-dated ones, the final
  `balance_after` equals the naive aggregate, and `recalculateLedger` is a no-op.

### 3.3 Adjustments
`customer_adjustments` CRUD with the kinds listed in the data model.
- Debit kinds: `damaged_bottle`, `lost_bottle`, `dispenser_rent`, `delivery_charge`,
  `other_charge`, `deposit_received` *(deposit increases what we hold, it is a credit to the
  customer's account — see the rule below)*.
- Credit kinds: `discount`, `write_off`, `deposit_refunded`.

> **Deposit rule.** When a deposit is *received*, cash comes in but it is not revenue and it does
> not reduce what the customer owes for water. Record it as: `customers.security_deposit_held +=
> amount`, a ledger entry of type `deposit_received` **tagged as non-revenue**, and it must appear
> as a separate line on the invoice, not inside the water subtotal. When *refunded*, the reverse.
> Add a unit test asserting deposits never appear in `revenue_accrual` or `revenue_cash`.

- Unbilled adjustments are automatically picked up by the next invoice for that customer.
- Damaged/lost bottle adjustments also reduce `bottles_with_customer` (formula in §J).

### 3.4 Invoice generation

```ts
previewInvoice(customerId, period): InvoicePreview
generateInvoice(customerId, period, opts): Invoice        // status 'draft'
generateBatch(period, filter, opts): BatchResult
issueInvoice(invoiceId): Invoice                          // draft -> issued
voidInvoice(invoiceId, reason): Invoice
```

Composition of an invoice for customer C, period P:
1. `opening_balance` = ledger balance as of the day before `period_start` (excluding nothing —
   this is the true carry forward).
2. Delivery lines: every recorded delivery in the period, one line per date, with quantity, rate
   and amount. For `monthly_package` customers, delivery lines are informational (amount 0) and a
   single `package` line carries `package_amount`; if `Σqty > package_included_qty`, add an excess
   line at `package_excess_rate`.
3. Charge/discount lines from unbilled `customer_adjustments` dated within or before the period.
4. Tax line if `tax.enabled`.
5. Totals per the formulas in `03-data-model.md` §J.
6. `bottles_with_customer_at_issue` is snapshotted.
7. Marks each included delivery and adjustment with `invoice_id`.
8. Appends one `invoice` ledger entry for `invoice_total` (never for `total_payable` — the opening
   balance is already in the ledger; double-counting it is the classic bug here).
9. Invoice number is drawn from the `sequences` table inside the transaction, so it is gapless.

Other rules:
- Generating twice for the same customer and period is blocked unless the earlier invoice is void.
- Draft invoices can be regenerated/edited; issued invoices cannot — only void (which reverses the
  ledger entry, clears `invoice_id` from its deliveries, and is audit-logged) or correct with a
  credit/debit note.
- Zero-activity customers: by default skip if there were no deliveries **and** the opening balance
  is zero; include (as a reminder invoice) if the opening balance is non-zero. Make this an option
  on the batch screen.
- `due_date = issue_date + invoice.dueDays`.

### 3.5 Screen: Generate Bills — `/billing/generate`
- Step 1: pick the period (defaults to last completed month) and a filter (all / area / route /
  selected customers).
- Step 2: preview table — customer, deliveries count, units, this-period amount, previous balance,
  total payable, with a checkbox per row and warnings (no deliveries, negative balance, period not
  closed, customer paused).
- Step 3: generate. Progress dialog, then a result summary with counts and a list of skipped rows
  with reasons.
- Step 4: offer "Issue all" and "Export PDFs" (PDF button enabled in Phase 4).
- A prominent hint: "Close the period after billing so the numbers can't change" with a button
  that calls `periodService.close`.

### 3.6 Screen: Invoices — `/billing/invoices`
- Filters: period, status, customer, area/route, overdue only, amount range.
- Columns: invoice no, date, customer, units, invoice total, paid, balance, status, due date.
- Bulk actions: issue, export PDFs (Phase 4), mark shared.
- Detail page `/billing/invoices/:id`: full document view with lines, totals, payment history,
  status timeline, and actions (issue / void / record payment / print / share).

### 3.7 Payments
- `recordPayment({ customerId, date, amount, method, referenceNo, receivedByEmployeeId, notes })`
  → creates the payment, a `payment` ledger credit, auto-allocates FIFO to unpaid issued invoices,
  updates each invoice's `paid_total` and status, updates `customer_balances`, writes audit.
- Overpayment leaves an unallocated remainder, which becomes customer credit (negative balance)
  and is auto-applied to the next invoice.
- Manual re-allocation UI on the payment detail.
- `voidPayment(id, reason)` reverses allocations and appends reversal ledger entries.
- Receipt number from the `sequences` table.
- `/payments` screen: list with filters (date range, method, customer, received by) and totals;
  a fast "Record payment" dialog reachable from the customer page, invoice page, and Ctrl+K.
- Cash collected at delivery (`deliveries.cash_collected` from Phase 2): decide and implement one
  of these, and document it —
  **Recommended:** at the end of the day, the daily entry screen offers "Post today's collected
  cash as payments", creating one payment per customer with method `cash`. Do not silently create
  payments during delivery entry, because the driver's cash is not confirmed until it is submitted.

### 3.8 Screen: Receivables — `/receivables`
- Every customer with a non-zero balance: name, phone, area/route, balance, oldest unpaid invoice
  date, days overdue, ageing bucket (current / 1–30 / 31–60 / 60+), last payment date.
- Summary strip with totals per bucket.
- Sorting and filtering; actions per row: record payment, open WhatsApp chat, view ledger.
- Export to Excel/PDF.
- Customers in credit are listed separately.

### 3.9 Customer detail tabs
Fill in the **Ledger** tab (date, description, debit, credit, running balance, reference link) and
the **Invoices** tab (list with status and balance). Add "Record payment" and "Add charge/discount"
actions.

### 3.10 Period close UI
Move period close/reopen out of Settings → About into `/billing` as a proper screen: a list of
months with status (open / closed), delivery count, invoice count, revenue, and close/reopen
buttons. Reopening requires a typed reason and is owner-only.

---

## Out of scope
PDF rendering and sharing (Phase 4), profit reporting (Phase 8), reminders/SMS.

## Acceptance criteria

1. A customer with opening balance Rs 3,000, 20 bottles in July at Rs 60, and a Rs 500 discount
   produces: opening 3,000 + deliveries 1,200 − discount 500 = total payable Rs 3,700, and the
   ledger balance equals 3,700 after issuing.
2. Recording a Rs 2,000 payment leaves the balance at Rs 1,700, marks the invoice
   `partially_paid`, and creates one allocation row.
3. Recording Rs 5,000 leaves a Rs 1,300 credit, marks the invoice `paid`, and the next invoice
   automatically applies the credit.
4. Voiding an issued invoice restores the ledger balance exactly to its pre-invoice value, frees
   its deliveries for re-billing, and leaves both the original and the reversal in the ledger.
5. Generating the same period twice for one customer is rejected with `INVOICE_EXISTS`.
6. Invoice numbers over 200 generated invoices are sequential with no gaps and no duplicates,
   including when generation is cancelled halfway.
7. A deposit of Rs 1,000 appears on the invoice as its own line, changes the balance, and does
   **not** appear in revenue in any report.
8. A monthly-package customer with a Rs 2,000 package, 30 included bottles and 34 delivered at a
   Rs 50 excess rate is billed 2,000 + 200 = Rs 2,200.
9. Batch generation for 300 customers completes in under 20 s and is fully transactional per
   customer (one failure does not corrupt the others).
10. Ageing buckets are correct across a month boundary (test with invoices dated 1st and 31st).
11. `recalculateLedger` over the seeded dataset changes nothing.
12. `typecheck`, `lint`, `test`, `build` pass; `PROGRESS.md` and `CHANGELOG.md` updated.

## Notes for the next phase
Record in `PROGRESS.md`: the `InvoicePreview` / `Invoice` DTO shapes (Phase 4 renders them), the
invoice numbering format actually implemented, and how cash-at-delivery was handled.
