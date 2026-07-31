# Phase 6 — Employees, Attendance & Payroll

**Goal:** digitise staff records, attendance, mid-month advances and monthly salary calculation,
and feed salary cost into the expense ledger correctly.

**Depends on:** Phases 0, 5 (expenses), 2 (deliveries, for commission). **Blocks:** Phase 8.

Read `AGENT-BRIEF.md` first. Schema: `03-data-model.md` §G.

---

## Scope

Requirements: FR-EM-01…09, FR-EX-04.

### 6.1 Migration
Create `employees` (or upgrade the stub from Phase 1), `employee_salaries`, `attendance`,
`salary_advances`, `payroll_runs`, `payroll_items`. Add the deferred foreign keys:
`routes.default_employee_id`, `deliveries.employee_id`, `payments.received_by_employee_id`,
`expenses.employee_id`.

### 6.2 Employee records
- `/employees` list: code, name, role, phone, joining date, current salary, status; search and
  filters; virtualised.
- Create/edit form: identity (name, code, CNIC, photo), contact (phone, address, emergency
  contact), employment (role, joining date, status, leaving date), salary structure.
- Photo stored in `<userData>/attachments/employees/`.
- Deactivating asks for a leaving date and warns about outstanding advances.
- `/employees/:id` detail with tabs: Overview, Attendance, Advances, Salary history, Payroll
  history, Performance.

### 6.3 Salary structure with history
- `salary_type`: `monthly`, `daily`, `monthly_plus_commission`, `commission_only`.
- Fields: base amount, commission per bottle, overtime hourly rate.
- Changing salary creates a new dated `employee_salaries` row and closes the previous one; never
  overwrite. `salaryService.getSalaryFor(employeeId, onDate)`.
- Warn when the effective date falls in an already-finalised payroll month.

### 6.4 Attendance — `/employees/attendance`
- Month calendar grid: employees as rows, days as columns, cell = status letter/colour
  (P / A / H = half-day / L = leave / O = holiday).
- Click a cell to cycle status; drag to fill a range; "Mark all present for today" and
  "Mark all present for the month" bulk actions; mark a date as a company holiday for everyone.
- A separate simple "Today's attendance" panel for daily use, with one tap per employee.
- Row summary: present, absent, half-days, leaves, overtime hours.
- Attendance in a closed period is read-only.
- Configurable working-days basis for deductions: **calendar days in month**, **fixed 26 days**,
  or **actual working days excluding declared holidays**. Store the choice in settings
  (`payroll.workingDaysBasis`, default `fixed_26`) — this materially changes the salary maths, so
  it must be explicit and shown on the payroll screen.

### 6.5 Advances
- Record an advance: employee, date, amount, reason.
- Recording an advance creates an expense in the **Employee Advance** category with
  `source = 'payroll'` and links it (`salary_advances.expense_id`), so the cash outflow is visible
  immediately.
- Advance list per employee with outstanding total, and a global list.
- Statuses: outstanding → settled (when deducted in a payroll run) / waived / void.

> **Double-counting rule (must be implemented and tested).** Cash paid as an advance is expensed
> when paid, under **Employee Advance**. When the payroll run for that month deducts the advance
> from net pay, the **Salaries** expense created must equal the *amount actually paid out at
> payroll time* (net payable), not the gross salary. Gross salary is reported on the salary slip,
> but the expense ledger only ever records real cash movements. Total salary cost for a month is
> then `Employee Advance` + `Salaries`, which equals gross pay. Add a unit test asserting exactly
> this for an employee with a Rs 30,000 salary and a Rs 10,000 advance:
> `Employee Advance = 10,000`, `Salaries = 20,000`, total cost = 30,000, and neither is
> double-counted in the P&L.

### 6.6 Payroll run — `/payroll`
- List of monthly runs with status and totals; "Generate payroll for <month>".
- Generation computes, per active employee, using the salary in effect for that month:
  - `base_amount` (monthly) or `daily rate × days_present` (daily)
  - `working_days` per the configured basis; `days_present` counting half-days as 0.5;
    paid leave counts as present, unpaid leave does not
  - `absence_deduction = per_day_rate × days_absent` (monthly types only)
  - `bottles_delivered` = Σ quantity of deliveries in the month where `employee_id = E`
  - `commission_amount = bottles_delivered × commission_per_bottle`
  - `overtime_amount = overtime_hours × overtime_hourly_rate`
  - `advances_deducted` = Σ outstanding advances for that employee dated in or before the month
  - `bonus_amount`, `other_deductions` — manually editable, with a note
  - `net_payable = base − absence_deduction + commission + overtime + bonus − advances − other`
- Review screen: editable table with every column above, per-row recalculation, a totals row, and
  validation (net payable cannot be negative — if advances exceed the salary, cap the deduction
  and carry the remainder to the next month; show this clearly).
- **Finalise**: locks the run, marks the deducted advances settled, and creates one **Salaries**
  expense per employee (per the double-counting rule) with `source = 'payroll'`.
- Record payment per employee (date, method, partial allowed) or "Pay all".
- Voiding a finalised run reverses the expenses and un-settles the advances (owner only, reason
  required, audit-logged).

### 6.7 Salary slip PDF (FR-EM-07)
- Uses the Phase 4 PDF engine. Contains: business header, employee name/code/role, month, working
  days, present/absent, gross components (base, commission, overtime, bonus), deductions
  (absence, advances, other), **net paid**, payment date and method, amount in words, signature
  lines.
- Single and batch export for a run.

### 6.8 Performance view (FR-EM-08)
Per employee per month: bottles delivered, unique customers served, deliveries count, cash
collected, cash variance (from Phase 7 trips, if available), attendance percentage. A simple table
plus a 12-month trend chart. Also a comparison table across employees for a chosen month.

---

## Out of scope
Trip/van reconciliation (Phase 7), tax/EOBI/statutory deductions (not required by the client —
confirm before adding), biometric or device-based attendance.

## Acceptance criteria

1. Creating an employee with a Rs 30,000 monthly salary and later changing it to Rs 35,000 from
   1 Sept leaves August payroll at 30,000 and September at 35,000.
2. Attendance for a month can be filled for 8 employees in under a minute using bulk actions.
3. An employee with 2 absences on a 26-day basis and a Rs 26,000 salary is deducted exactly
   Rs 2,000.
4. A delivery employee with a Rs 2 per-bottle commission who delivered 900 bottles gets exactly
   Rs 1,800 commission, matching a manual query against `deliveries`.
5. The advance double-counting test in §6.5 passes.
6. Finalising a payroll run creates exactly one Salaries expense per paid employee, all read-only
   in the expense screen, and the month's total expenses increase by the correct amount only once.
7. Voiding a finalised run restores expenses and advances to their prior state.
8. An advance larger than the month's net pay caps the deduction, leaves the remainder outstanding
   and shows a warning on the review screen.
9. Salary slips generate for all employees of a run into a folder with correct file names.
10. Payroll for a closed period cannot be generated or finalised.
11. `typecheck`, `lint`, `test`, `build` pass; `PROGRESS.md` and `CHANGELOG.md` updated.

## Notes for the next phase
Record in `PROGRESS.md`: the working-days basis implemented, how commission is attributed when a
delivery has no employee set, and the exact rule used for the Salaries expense amount.
