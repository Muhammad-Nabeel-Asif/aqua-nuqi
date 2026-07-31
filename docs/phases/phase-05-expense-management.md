# Phase 5 — Expense Management

**Goal:** every rupee going out of the business is recorded and categorised, so Phase 8 can show a
truthful profit figure.

**Depends on:** Phases 0, 4 (for exports). **Blocks:** Phases 6 (payroll writes expenses), 8.

Read `AGENT-BRIEF.md` first. Schema: `03-data-model.md` §F.

---

## Scope

Requirements: FR-EX-01…08.

### 5.1 Migration
Create `expense_categories`, `expenses`, `recurring_expenses`. Seed the categories listed in the
data model, with **Salaries** and **Employee Advance** flagged `is_system = 1`.
`expenses.employee_id` and `expenses.vehicle_id` reference tables from Phases 6 and 7 — create the
columns now without the FKs and add the constraints in those phases.

### 5.2 Expense service
```ts
createExpense(input): Expense
updateExpense(id, input): Expense      // blocked when source != 'manual'
voidExpense(id, reason): Expense
listExpenses(filter): Paged<Expense>
summaryByCategory(range): CategoryTotal[]
summaryByMonth(range): MonthTotal[]
```
- `guardPeriodOpen(expense_date)`.
- Payroll- and purchase-generated expenses (`source != 'manual'`) are read-only here; editing must
  happen in the originating module. Show a clear banner explaining that.
- All mutations audit-logged.

### 5.3 Screen: Expenses — `/expenses`
- Header: date-range picker (presets: today, this month, last month, this year, custom), with a
  large total for the selected range and a comparison to the previous equivalent period.
- Filters: category (multi-select), payment method, vendor, source, amount range, free-text search.
- Table: date, category, description, vendor, method, amount, attachment icon, source badge.
  Sortable, virtualised, with a footer total and export to PDF/Excel.
- **Quick add form** always visible at the top of the page (date, category, amount, description,
  method, vendor) so recording an expense takes under 5 seconds. `Enter` submits and keeps focus
  in the amount field for the next entry.
- Full form in a side panel for the rest of the fields plus the receipt attachment.
- Row actions: edit, duplicate, void, view attachment.

### 5.4 Receipt attachments
- Attach an image or PDF; the file is copied into
  `<userData>/attachments/expenses/<YYYY>/<uuid>.<ext>` and the relative path is stored.
- Thumbnail preview in the side panel and a lightbox viewer.
- Attachments are included in backups (Phase 9 must know about this folder — note it in
  `PROGRESS.md`).
- Guard against very large files (warn above 5 MB, downscale images above 2000 px).

### 5.5 Categories — `/expenses/categories`
- List with usage counts and this-month/this-year totals.
- Create, rename, reorder, deactivate. System categories cannot be renamed or deleted.
- Optional parent category for grouping (one level only).
- Merging two categories (move all expenses from A to B, then deactivate A) — useful after
  duplicate categories are created by mistake.

### 5.6 Recurring expenses (FR-EX-05)
- Define name, category, expected amount, frequency, day of month, vendor.
- A dashboard/inbox widget: "Recurring expenses due this month: Rent (Rs 25,000), Electricity —
  not yet recorded". One click opens the quick-add form pre-filled; the user confirms the actual
  amount. Never auto-create an expense without confirmation.
- After recording, `last_recorded_date` and `next_due_date` advance.

### 5.7 Vehicle / employee attribution (FR-EX-06)
- Optional employee and vehicle fields on the expense form (dropdowns are empty until Phases 6
  and 7 create those records; hide the field if the table is empty).
- Filtering by employee/vehicle is supported so fuel and repair analysis works later.

### 5.8 Expense insights (FR-EX-07)
On the expenses page, below the table:
- Bar chart of the last 12 months' totals.
- Category breakdown for the selected range (bar or pie) with amounts and percentages.
- Top 5 vendors by amount.
These are simple Recharts components; the full report hub is Phase 8.

### 5.9 Cash book (FR-EX-08, optional but recommended)
- A simple daily view: opening cash, cash in (payments with method `cash` from Phase 3), cash out
  (expenses with method `cash`), computed closing cash, and a field for actual counted cash with a
  variance. Purely informational, no accounting entries.
- Implement only if the rest of the phase is complete; otherwise leave it out and note it.

---

## Out of scope
Payroll (Phase 6), bottle purchase creating stock (Phase 7 — but a bottle purchase recorded here
is just an expense for now), P&L (Phase 8).

## Acceptance criteria

1. Recording an expense takes fewer than 5 seconds using only the keyboard, and the range total
   updates immediately.
2. The date-range total matches a manual sum of the filtered rows, and voided expenses are
   excluded.
3. Attaching a 3 MB receipt photo copies it into the attachments folder, shows a thumbnail, and
   survives an app restart.
4. A system category cannot be deleted or renamed; a non-system category with expenses cannot be
   deleted, only deactivated or merged.
5. Merging category A into B moves all rows and leaves totals unchanged.
6. A recurring expense due this month appears in the widget and disappears after it is recorded.
7. Expenses in a closed period cannot be created or edited (`PERIOD_LOCKED`).
8. Export to Excel and PDF produces the same rows and total as the screen.
9. `summaryByCategory` for a range equals the sum of the filtered list, verified by a unit test.
10. `typecheck`, `lint`, `test`, `build` pass; `PROGRESS.md` and `CHANGELOG.md` updated.

## Notes for the next phase
Record in `PROGRESS.md`: the `createExpense` signature and how `source` / `source_ref_*` should be
populated — Phase 6 must create salary expenses through this exact service so that profit is not
double-counted.
