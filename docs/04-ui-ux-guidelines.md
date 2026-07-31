# Aqua Nuqi — UI / UX Guidelines

The user is a busy, non-technical business owner who currently uses paper. The UI must feel
**faster than paper**, not more impressive than paper.

## 1. Layout shell

```
┌──────────────────────────────────────────────────────────────────────┐
│ Top bar:  [logo] Aqua Nuqi   [global search Ctrl+K]   [today's date] │
│           [backup status]  [user menu]                               │
├───────────────┬──────────────────────────────────────────────────────┤
│ Sidebar       │  Page content                                        │
│  Dashboard    │                                                      │
│  Deliveries   │                                                      │
│  Customers    │                                                      │
│  Billing      │                                                      │
│  Payments     │                                                      │
│  Expenses     │                                                      │
│  Employees    │                                                      │
│  Inventory    │                                                      │
│  Reports      │                                                      │
│  Settings     │                                                      │
└───────────────┴──────────────────────────────────────────────────────┘
```

- Sidebar is collapsible; icons + labels; the active item is clearly highlighted.
- Items the current role cannot access are hidden, not disabled.
- The top bar always shows a **backup freshness chip** (green "Backed up 2h ago" / red "No backup
  for 3 days").

## 2. Visual language

- Light theme default, dark theme optional (Phase 9). Clean, high-contrast, generous spacing.
- Primary colour: a water blue (`#0284c7` family). Success green, warning amber, danger red.
- Base font size **15–16 px**, table numerals **tabular-nums**, right-aligned.
- Money is always rendered by one `<Money value={paisa} />` component — never manual formatting.
- Negative/overdue amounts in red; customer credit in green with a "CR" suffix.
- Every screen has a clear H1, an optional subtitle, and its primary action as a filled button top-right.

## 3. Data-entry principles (this is where the product wins or loses)

1. **Keyboard first.** On the delivery grids: arrow keys move between cells, `Enter` saves and
   moves down, `Tab` moves right, typing a digit starts editing immediately, `Esc` cancels.
2. **Autosave per cell**, with an inline saved/failed indicator. No "Save all" button that can be
   forgotten. Optimistic UI, roll back with a toast on failure.
3. **Sensible defaults.** Date defaults to today. Empties collected default to quantity delivered.
   Rate is filled from the customer's active rate.
4. **No modal for the common case.** Inline editing beats dialogs for repetitive entry.
5. **Confirm destructive actions only** (void, delete, restore, period close/reopen) — and require
   a typed reason for voids.
6. **Never block on validation while typing.** Validate on blur, show errors under the field.
7. **Numeric keypad friendly**: `+`/`-` and up/down arrows adjust quantities.

## 4. Tables

- Sticky header, sticky first column (customer name) on wide grids.
- Virtualised beyond 100 rows.
- Every list has: search box, relevant filters, column sort, row count, and an export button.
- Empty states explain what to do next and include the primary action button.
- Loading uses skeletons, not spinners, for lists.

## 5. Feedback

- Toasts for success (auto-dismiss 2 s) and errors (manual dismiss, with the error code).
- Long operations (batch invoices, backup, PDF export) show a progress dialog with a count and a
  cancel button, and finish with a summary ("48 invoices generated, 2 skipped — view details").
- Errors show a plain-language message, never a stack trace. Include a "Copy details" link.

## 6. Accessibility & practicality

- Full keyboard navigation; visible focus rings.
- Minimum click target 32 px.
- Works at 1366×768. No horizontal scroll except in intentionally wide grids.
- All text through `t('key')` from day one, even though only English ships in v1.

## 7. Screen inventory (built across phases)

| Route | Screen | Phase |
|---|---|---|
| `/setup` | First-run wizard | 0 |
| `/login` | Login / PIN | 0 |
| `/` | Dashboard | 0 (skeleton) → 8 (real) |
| `/deliveries/daily` | Daily entry by route | 2 |
| `/deliveries/matrix` | Month matrix (customers × days) | 2 |
| `/customers` | Customer list | 1 |
| `/customers/:id` | Customer detail (profile, card, ledger, invoices) | 1 → 2 → 3 |
| `/customers/:id/card/:period` | Monthly delivery card | 2 |
| `/billing/generate` | Batch invoice generation | 3 |
| `/billing/invoices` | Invoice list | 3 |
| `/billing/invoices/:id` | Invoice detail + PDF preview | 3 → 4 |
| `/payments` | Payment list + record payment | 3 |
| `/receivables` | Outstanding & ageing | 3 |
| `/expenses` | Expense list & entry | 5 |
| `/expenses/categories` | Categories | 5 |
| `/employees` | Employee list | 6 |
| `/employees/:id` | Employee detail | 6 |
| `/employees/attendance` | Attendance calendar | 6 |
| `/payroll` | Payroll runs | 6 |
| `/inventory` | Stock overview & movements | 7 |
| `/inventory/trips` | Trip / van reconciliation | 7 |
| `/inventory/bottles-out` | Bottles with customers report | 7 |
| `/reports` | Report hub (P&L, sales, receivables, expenses) | 8 |
| `/settings/*` | Business, invoice, users, backup, master data | 0 → 9 |
| `/settings/backup` | Backup & restore | 9 |
| `/settings/audit` | Audit log viewer | 9 |
