import { sql } from 'drizzle-orm'
import { check, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { customers } from './customers'
import { employees } from './employees'
import { users } from './system'

export const invoices = sqliteTable(
  'invoices',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    uuid: text('uuid').notNull().unique(),
    invoiceNo: text('invoice_no').notNull().unique(),
    customerId: integer('customer_id')
      .notNull()
      .references(() => customers.id),
    period: text('period'),
    periodStart: text('period_start').notNull(),
    periodEnd: text('period_end').notNull(),
    issueDate: text('issue_date').notNull(),
    dueDate: text('due_date'),

    openingBalance: integer('opening_balance').notNull().default(0),
    deliveriesQty: integer('deliveries_qty').notNull().default(0),
    deliveriesTotal: integer('deliveries_total').notNull().default(0),
    chargesTotal: integer('charges_total').notNull().default(0),
    discountTotal: integer('discount_total').notNull().default(0),
    taxTotal: integer('tax_total').notNull().default(0),
    invoiceTotal: integer('invoice_total').notNull().default(0),
    totalPayable: integer('total_payable').notNull().default(0),
    paidTotal: integer('paid_total').notNull().default(0),
    closingBalance: integer('closing_balance').notNull().default(0),
    bottlesWithCustomerAtIssue: integer('bottles_with_customer_at_issue').notNull().default(0),

    status: text('status').notNull().default('draft'),
    voidReason: text('void_reason'),
    pdfPath: text('pdf_path'),
    lastSharedAt: text('last_shared_at'),
    notes: text('notes'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    createdBy: integer('created_by').references(() => users.id),
  },
  (t) => ({
    statusCheck: check(
      'invoices_status_check',
      sql`${t.status} IN ('draft','issued','partially_paid','paid','void')`,
    ),
    customerIdx: index('idx_invoices_customer').on(t.customerId, t.period),
    statusIdx: index('idx_invoices_status').on(t.status),
  }),
)

export const invoiceLines = sqliteTable(
  'invoice_lines',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    invoiceId: integer('invoice_id')
      .notNull()
      .references(() => invoices.id, { onDelete: 'cascade' }),
    lineNo: integer('line_no').notNull(),
    lineType: text('line_type').notNull(),
    lineDate: text('line_date'),
    description: text('description').notNull(),
    quantity: integer('quantity').notNull().default(0),
    rate: integer('rate').notNull().default(0),
    amount: integer('amount').notNull().default(0),
    /** FK to deliveries.id added in SQL migration (avoids circular schema imports). */
    deliveryId: integer('delivery_id'),
    /** FK to customer_adjustments.id added in SQL migration. */
    adjustmentId: integer('adjustment_id'),
  },
  (t) => ({
    typeCheck: check(
      'invoice_lines_line_type_check',
      sql`${t.lineType} IN ('delivery','package','rental','charge','discount','deposit','tax','carry_forward')`,
    ),
    invoiceIdx: index('idx_invoice_lines_invoice').on(t.invoiceId),
  }),
)

export const payments = sqliteTable(
  'payments',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    uuid: text('uuid').notNull().unique(),
    receiptNo: text('receipt_no').unique(),
    customerId: integer('customer_id')
      .notNull()
      .references(() => customers.id),
    paymentDate: text('payment_date').notNull(),
    amount: integer('amount').notNull(),
    method: text('method').notNull(),
    referenceNo: text('reference_no'),
    receivedByEmployeeId: integer('received_by_employee_id').references(() => employees.id),
    notes: text('notes'),
    /** payment = trading receipt; deposit = security deposit liability (excluded from cash revenue). */
    purpose: text('purpose').notNull().default('payment'),
    status: text('status').notNull().default('active'),
    voidReason: text('void_reason'),
    createdAt: text('created_at').notNull(),
    createdBy: integer('created_by').references(() => users.id),
  },
  (t) => ({
    amountCheck: check('payments_amount_check', sql`${t.amount} > 0`),
    methodCheck: check(
      'payments_method_check',
      sql`${t.method} IN ('cash','bank_transfer','jazzcash','easypaisa','cheque','online','other')`,
    ),
    purposeCheck: check('payments_purpose_check', sql`${t.purpose} IN ('payment','deposit')`),
    statusCheck: check('payments_status_check', sql`${t.status} IN ('active','void')`),
    customerIdx: index('idx_payments_customer').on(t.customerId, t.paymentDate),
    dateIdx: index('idx_payments_date').on(t.paymentDate),
  }),
)

export const paymentAllocations = sqliteTable(
  'payment_allocations',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    paymentId: integer('payment_id')
      .notNull()
      .references(() => payments.id),
    invoiceId: integer('invoice_id')
      .notNull()
      .references(() => invoices.id),
    amount: integer('amount').notNull(),
    /** active | superseded | void — never hard-deleted */
    status: text('status').notNull().default('active'),
  },
  (t) => ({
    amountCheck: check('payment_allocations_amount_check', sql`${t.amount} > 0`),
    statusCheck: check(
      'payment_allocations_status_check',
      sql`${t.status} IN ('active','superseded','void')`,
    ),
    paymentIdx: index('idx_alloc_payment').on(t.paymentId),
    invoiceIdx: index('idx_alloc_invoice').on(t.invoiceId),
  }),
)
