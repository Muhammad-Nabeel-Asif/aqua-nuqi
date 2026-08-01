import { sql } from 'drizzle-orm'
import { check, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { users } from './system'

export const expenseCategories = sqliteTable(
  'expense_categories',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    uuid: text('uuid').notNull().unique(),
    name: text('name').notNull().unique(),
    parentId: integer('parent_id'),
    isSystem: integer('is_system').notNull().default(0),
    sortOrder: integer('sort_order').notNull().default(0),
    isActive: integer('is_active').notNull().default(1),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => ({
    systemCheck: check('expense_categories_is_system_check', sql`${t.isSystem} IN (0,1)`),
    activeCheck: check('expense_categories_is_active_check', sql`${t.isActive} IN (0,1)`),
  }),
)

export const expenses = sqliteTable(
  'expenses',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    uuid: text('uuid').notNull().unique(),
    expenseDate: text('expense_date').notNull(),
    categoryId: integer('category_id')
      .notNull()
      .references(() => expenseCategories.id),
    amount: integer('amount').notNull(),
    paymentMethod: text('payment_method').notNull().default('cash'),
    vendorName: text('vendor_name'),
    description: text('description'),
    referenceNo: text('reference_no'),
    attachmentPath: text('attachment_path'),
    /** FK added in Phase 6 when employees table exists. */
    employeeId: integer('employee_id'),
    /** FK added in Phase 7 when vehicles table exists. */
    vehicleId: integer('vehicle_id'),
    source: text('source').notNull().default('manual'),
    sourceRefTable: text('source_ref_table'),
    sourceRefId: integer('source_ref_id'),
    status: text('status').notNull().default('active'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    createdBy: integer('created_by').references(() => users.id),
    updatedBy: integer('updated_by').references(() => users.id),
  },
  (t) => ({
    amountCheck: check('expenses_amount_check', sql`${t.amount} > 0`),
    methodCheck: check(
      'expenses_payment_method_check',
      sql`${t.paymentMethod} IN ('cash','bank_transfer','jazzcash','easypaisa','cheque','credit','other')`,
    ),
    sourceCheck: check(
      'expenses_source_check',
      sql`${t.source} IN ('manual','payroll','purchase','recurring')`,
    ),
    statusCheck: check('expenses_status_check', sql`${t.status} IN ('active','void')`),
    dateIdx: index('idx_expenses_date').on(t.expenseDate),
    categoryIdx: index('idx_expenses_category').on(t.categoryId, t.expenseDate),
  }),
)

export const recurringExpenses = sqliteTable(
  'recurring_expenses',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    uuid: text('uuid').notNull().unique(),
    name: text('name').notNull(),
    categoryId: integer('category_id')
      .notNull()
      .references(() => expenseCategories.id),
    amount: integer('amount').notNull(),
    frequency: text('frequency').notNull(),
    dayOfMonth: integer('day_of_month'),
    vendorName: text('vendor_name'),
    nextDueDate: text('next_due_date').notNull(),
    lastRecordedDate: text('last_recorded_date'),
    isActive: integer('is_active').notNull().default(1),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => ({
    freqCheck: check(
      'recurring_expenses_frequency_check',
      sql`${t.frequency} IN ('monthly','quarterly','yearly')`,
    ),
    activeCheck: check('recurring_expenses_is_active_check', sql`${t.isActive} IN (0,1)`),
  }),
)
