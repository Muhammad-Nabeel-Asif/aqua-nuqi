# Phase 8 — Dashboard, Profit & Loss and Reports

**Goal:** answer the owner's real questions in one glance — how much did I sell, how much did I
spend, how much did I actually make, who owes me money, and where are my bottles.

**Depends on:** Phases 2–7. **Blocks:** nothing.

Read `AGENT-BRIEF.md` first. Formulas: `03-data-model.md` §J.

---

## Scope

Requirements: FR-DB-01…10, FR-PD-07/08 (report exports).

### 8.1 Reporting service
- `report.service.ts` with one function per report, each taking a period/date range and filters
  and returning plain serialisable data.
- All reports must respect: voided rows excluded, deposits excluded from revenue, walk-in sales
  included in revenue but excluded from receivables.
- Add a `reportCache` keyed by (report, params, db write counter) so switching tabs is instant;
  invalidate on any write.
- **Every report needs a unit test with a fixed seeded dataset and hand-calculated expected
  numbers.** Wrong reports are worse than no reports.

### 8.2 Dashboard — `/`
Row 1 — today: bottles delivered today, customers served today, cash collected today, deliveries
still not entered (customers on schedule for today with no entry).

Row 2 — this month: bottles delivered, revenue (with an accrual/cash toggle), expenses, **profit**,
each with a percentage change vs the same point last month.

Row 3 — money and assets: total outstanding receivables (with an ageing mini-bar), customers in
credit, bottles with customers, filled stock at plant.

Row 4 — charts: last 12 months revenue vs expenses vs profit (bar + line), and daily bottles
delivered for the current month (line).

Row 5 — action lists (compact, each linking to the full screen):
- Top 5 overdue customers by amount
- Customers with no delivery in N days
- Recurring expenses not yet recorded this month
- Trips with a cash or bottle variance this week
- Backup status warning if the last backup is stale

Quick actions: Record delivery, Record payment, Add expense, Generate bills, New customer.

Everything on the dashboard obeys the current user's role — an operator sees no profit, expense or
payroll figures.

### 8.3 Report hub — `/reports`
A landing page with report cards grouped as **Sales**, **Money**, **Operations**, **Staff**.
Every report screen shares one layout: filter bar (date range presets + custom, plus report
specific filters), summary strip, table and/or chart, and Print / PDF / Excel buttons.

### 8.4 Profit & Loss (FR-DB-02/03) — the headline report
- Period selector (month, quarter, year, custom) and a **basis toggle: Accrual (billed) / Cash
  (received)**, with a one-line explanation of the difference shown in the UI:
  - *Accrual*: counts money you billed this period, whether or not it was paid.
  - *Cash*: counts money you actually received this period.
- Structure:
  ```
  Revenue
    Water sales (invoiced / received)
    Other charges (rent, delivery charges, damaged bottle recovery)
    Less: discounts and write-offs
    = Net revenue
  Expenses (by category, largest first, expandable to line items)
    …
    Salaries
    = Total expenses
  Net profit           (and margin %)
  ```
- Excluded and clearly labelled as such: security deposits received/refunded (liability), and
  customer advances (not yet earned) in the accrual view.
- Side-by-side comparison with the previous period and the same period last year.
- Drill-down: clicking any category opens the underlying transactions.

### 8.5 Sales & delivery reports (FR-DB-05/06)
- **Sales summary**: units and value by day / month, filterable by area, route, employee, customer
  type; with a chart.
- **Customer-wise sales**: units, revenue, average per delivery, number of delivery days, ranked;
  top-N view.
- **Area / route performance**: units, revenue, active customers, average revenue per customer.
- **Employee delivery report**: units delivered, customers served, cash collected, variances.
- **Customer activity**: new customers this period, customers who stopped (delivered last period,
  nothing this period), paused customers, and a simple churn count.
- **Consumption trend** per customer (last 6 months) shown on the customer detail page, to spot a
  customer quietly switching to a competitor.

### 8.6 Money reports
- **Receivables ageing** (upgrade of the Phase 3 screen): buckets, totals, per-area breakdown.
- **Collection report**: payments received in a period by method, by employee, by day.
- **Customer statement**: reuses the Phase 4 statement template; batch print for selected
  customers.
- **Expense report**: by category, by month, by vendor, with comparisons (built on Phase 5's
  summary functions).
- **Cost per bottle** (FR-DB-09): total expenses ÷ bottles delivered per month, trended, with a
  side-by-side average revenue per bottle so the margin per bottle is visible.

### 8.7 Operations reports
- **Bottles out / asset recovery** (from Phase 7).
- **Bottle loss report**: bottles scrapped, lost at customers, and the net change in total owned
  per period.
- **Trip variance report**: cash and bottle variances by employee and by month.
- **Stock movement register** for a date range.

### 8.8 Export & print
Every report supports PDF (branded, via Phase 4's `exportTable` and the print templates) and
Excel/CSV, including the active filters in the header of the export so a printed report is
self-explanatory.

### 8.9 Performance
- No report may take more than 2 seconds on the seeded dataset (1,000 customers, 3 years).
- Add the indexes needed; if a report needs a pre-aggregate, create a summary table maintained on
  write rather than scanning on read, and document it.

---

## Out of scope
Forecasting, budgets, custom report builder, multi-year comparisons beyond last year.

## Acceptance criteria

1. Dashboard month-to-date revenue equals the P&L accrual revenue for the same period.
2. P&L accrual and cash figures differ for a month where an invoice was issued but not paid, and
   each matches a hand-calculated expected value on the seeded dataset.
3. Security deposits and employee advances do not distort profit — a seeded scenario with both
   produces the exact hand-calculated profit (unit test).
4. Salaries appear once in the P&L, and total expenses equal the sum of the expense list for the
   period.
5. Receivables total on the dashboard equals the sum of positive customer balances, and the ageing
   buckets sum to that total.
6. Bottles with customers on the dashboard equals the bottles-out report total.
7. Cost per bottle equals total expenses ÷ total bottles delivered for the month.
8. Every report exports to PDF and Excel with the same numbers as on screen, and the export header
   shows the applied filters.
9. Logged in as an operator, no profit, expense or salary figure is visible or reachable.
10. All reports render in under 2 seconds on the seeded dataset.
11. `typecheck`, `lint`, `test`, `build` pass; `PROGRESS.md` and `CHANGELOG.md` updated.

## Notes for the next phase
Record in `PROGRESS.md`: any summary tables added for performance and how they are rebuilt —
Phase 9's restore and integrity-check routines must rebuild them.
