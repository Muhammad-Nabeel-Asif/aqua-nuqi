import { sql } from 'drizzle-orm'
import {
  check,
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'
import { users } from './system'

export const employees = sqliteTable(
  'employees',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    uuid: text('uuid').notNull().unique(),
    code: text('code').notNull().unique(),
    name: text('name').notNull(),
    phone: text('phone'),
    cnic: text('cnic'),
    address: text('address'),
    photoPath: text('photo_path'),
    emergencyContactName: text('emergency_contact_name'),
    emergencyContactPhone: text('emergency_contact_phone'),
    role: text('role').notNull().default('delivery'),
    joiningDate: text('joining_date'),
    leavingDate: text('leaving_date'),
    status: text('status').notNull().default('active'),
    notes: text('notes'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    deletedAt: text('deleted_at'),
  },
  (t) => ({
    roleCheck: check(
      'employees_role_check',
      sql`${t.role} IN ('delivery','plant','admin','other')`,
    ),
    statusCheck: check('employees_status_check', sql`${t.status} IN ('active','inactive')`),
  }),
)

/** Dated salary structure; never overwrite — close and insert. */
export const employeeSalaries = sqliteTable('employee_salaries', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  uuid: text('uuid').notNull().unique(),
  employeeId: integer('employee_id')
    .notNull()
    .references(() => employees.id),
  salaryType: text('salary_type').notNull(),
  baseAmount: integer('base_amount').notNull().default(0),
  commissionPerBottle: integer('commission_per_bottle').notNull().default(0),
  overtimeHourlyRate: integer('overtime_hourly_rate').notNull().default(0),
  effectiveFrom: text('effective_from').notNull(),
  effectiveTo: text('effective_to'),
  reason: text('reason'),
  createdAt: text('created_at').notNull(),
  createdBy: integer('created_by').references(() => users.id),
})

export const attendance = sqliteTable(
  'attendance',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    employeeId: integer('employee_id')
      .notNull()
      .references(() => employees.id),
    attendanceDate: text('attendance_date').notNull(),
    status: text('status').notNull(),
    overtimeHours: real('overtime_hours').notNull().default(0),
    notes: text('notes'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => ({
    statusCheck: check(
      'attendance_status_check',
      sql`${t.status} IN ('present','absent','half_day','paid_leave','unpaid_leave','holiday')`,
    ),
    uniqueDay: uniqueIndex('uq_attendance_employee_date').on(t.employeeId, t.attendanceDate),
    dateIdx: index('idx_attendance_date').on(t.attendanceDate),
  }),
)

export const payrollRuns = sqliteTable('payroll_runs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  uuid: text('uuid').notNull().unique(),
  period: text('period').notNull().unique(),
  generatedOn: text('generated_on').notNull(),
  status: text('status').notNull().default('draft'),
  totalNet: integer('total_net').notNull().default(0),
  notes: text('notes'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  createdBy: integer('created_by').references(() => users.id),
})

export const payrollItems = sqliteTable(
  'payroll_items',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    uuid: text('uuid').notNull().unique(),
    payrollRunId: integer('payroll_run_id')
      .notNull()
      .references(() => payrollRuns.id),
    employeeId: integer('employee_id')
      .notNull()
      .references(() => employees.id),
    salaryType: text('salary_type').notNull(),
    baseAmount: integer('base_amount').notNull().default(0),
    workingDays: integer('working_days').notNull().default(0),
    daysPresent: real('days_present').notNull().default(0),
    daysAbsent: real('days_absent').notNull().default(0),
    absenceDeduction: integer('absence_deduction').notNull().default(0),
    bottlesDelivered: integer('bottles_delivered').notNull().default(0),
    commissionAmount: integer('commission_amount').notNull().default(0),
    overtimeHours: real('overtime_hours').notNull().default(0),
    overtimeAmount: integer('overtime_amount').notNull().default(0),
    bonusAmount: integer('bonus_amount').notNull().default(0),
    advancesDeducted: integer('advances_deducted').notNull().default(0),
    otherDeductions: integer('other_deductions').notNull().default(0),
    deductionNotes: text('deduction_notes'),
    netPayable: integer('net_payable').notNull().default(0),
    paidAmount: integer('paid_amount').notNull().default(0),
    paymentDate: text('payment_date'),
    paymentMethod: text('payment_method'),
    /** FK to expenses enforced in SQL migration (avoids circular schema import). */
    expenseId: integer('expense_id'),
    notes: text('notes'),
    /** Set when a voided run is regenerated — old items kept for audit (no hard delete). */
    supersededAt: text('superseded_at'),
  },
  (t) => ({
    // Partial unique: only one active item per employee per run (see migration 0009).
    uniqueEmp: uniqueIndex('uq_payroll_item_run_employee').on(t.payrollRunId, t.employeeId),
  }),
)

export const salaryAdvances = sqliteTable(
  'salary_advances',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    uuid: text('uuid').notNull().unique(),
    employeeId: integer('employee_id')
      .notNull()
      .references(() => employees.id),
    advanceDate: text('advance_date').notNull(),
    amount: integer('amount').notNull(),
    /** Paisa settled via payroll (cumulative); outstanding = amount - settled_amount. */
    settledAmount: integer('settled_amount').notNull().default(0),
    reason: text('reason'),
    /** Latest active settlement item (denormalised); undo uses salary_advance_settlements. */
    settledInPayrollItemId: integer('settled_in_payroll_item_id').references(() => payrollItems.id),
    status: text('status').notNull().default('outstanding'),
    /** FK to expenses enforced in SQL migration (avoids circular schema import). */
    expenseId: integer('expense_id'),
    createdAt: text('created_at').notNull(),
    createdBy: integer('created_by').references(() => users.id),
  },
  (t) => ({
    amountCheck: check('salary_advances_amount_check', sql`${t.amount} > 0`),
    statusCheck: check(
      'salary_advances_status_check',
      sql`${t.status} IN ('outstanding','settled','waived','void')`,
    ),
  }),
)

/** One row per (advance, payroll item) settlement slice — enables multi-month void. */
export const salaryAdvanceSettlements = sqliteTable(
  'salary_advance_settlements',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    uuid: text('uuid').notNull().unique(),
    salaryAdvanceId: integer('salary_advance_id')
      .notNull()
      .references(() => salaryAdvances.id),
    payrollItemId: integer('payroll_item_id')
      .notNull()
      .references(() => payrollItems.id),
    amount: integer('amount').notNull(),
    createdAt: text('created_at').notNull(),
    voidedAt: text('voided_at'),
  },
  (t) => ({
    amountCheck: check('salary_advance_settlements_amount_check', sql`${t.amount} > 0`),
    itemIdx: index('idx_adv_settlements_item').on(t.payrollItemId),
    advanceIdx: index('idx_adv_settlements_advance').on(t.salaryAdvanceId),
  }),
)
