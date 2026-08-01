import { sql } from 'drizzle-orm'
import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { customers } from './customers'
import { products } from './products'
import { users } from './system'

/**
 * Deliveries — one recorded row per (customer, date, product).
 * trip_id / employee_id / invoice_id are columns without FKs until those tables exist
 * (employees Phase 6, trips/invoices Phase 7 / 3).
 */
export const deliveries = sqliteTable(
  'deliveries',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    uuid: text('uuid').notNull().unique(),
    customerId: integer('customer_id')
      .notNull()
      .references(() => customers.id),
    productId: integer('product_id')
      .notNull()
      .references(() => products.id),
    deliveryDate: text('delivery_date').notNull(),
    quantity: integer('quantity').notNull(),
    emptiesCollected: integer('empties_collected').notNull().default(0),
    rate: integer('rate').notNull(),
    amount: integer('amount').notNull(),
    isFree: integer('is_free').notNull().default(0),
    freeReason: text('free_reason'),
    employeeId: integer('employee_id'),
    tripId: integer('trip_id'),
    cashCollected: integer('cash_collected').notNull().default(0),
    notes: text('notes'),
    status: text('status').notNull().default('recorded'),
    voidReason: text('void_reason'),
    invoiceId: integer('invoice_id'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    createdBy: integer('created_by').references(() => users.id),
    updatedBy: integer('updated_by').references(() => users.id),
  },
  (t) => ({
    qtyCheck: check('deliveries_quantity_check', sql`${t.quantity} >= 0`),
    emptiesCheck: check('deliveries_empties_collected_check', sql`${t.emptiesCollected} >= 0`),
    freeCheck: check('deliveries_is_free_check', sql`${t.isFree} IN (0,1)`),
    statusCheck: check('deliveries_status_check', sql`${t.status} IN ('recorded','void')`),
    slotUnique: uniqueIndex('uq_delivery_slot')
      .on(t.customerId, t.deliveryDate, t.productId)
      .where(sql`${t.status} = 'recorded'`),
    dateIdx: index('idx_deliveries_date').on(t.deliveryDate),
    custDateIdx: index('idx_deliveries_cust_date').on(t.customerId, t.deliveryDate),
    invoiceIdx: index('idx_deliveries_invoice').on(t.invoiceId),
    employeeIdx: index('idx_deliveries_employee').on(t.employeeId, t.deliveryDate),
  }),
)

/**
 * Minimal adjustments for damaged/lost bottles (FR-DL-11). Full billing adjustments /
 * invoice linking arrive in Phase 3 — invoice_id is a plain column without FK for now.
 */
export const customerAdjustments = sqliteTable(
  'customer_adjustments',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    uuid: text('uuid').notNull().unique(),
    customerId: integer('customer_id')
      .notNull()
      .references(() => customers.id),
    adjustmentDate: text('adjustment_date').notNull(),
    kind: text('kind').notNull(),
    amount: integer('amount').notNull(),
    quantity: integer('quantity'),
    description: text('description'),
    invoiceId: integer('invoice_id'),
    status: text('status').notNull().default('active'),
    createdAt: text('created_at').notNull(),
    createdBy: integer('created_by').references(() => users.id),
  },
  (t) => ({
    kindCheck: check(
      'customer_adjustments_kind_check',
      sql`${t.kind} IN (
        'damaged_bottle','lost_bottle','dispenser_rent','delivery_charge','other_charge',
        'discount','write_off','deposit_received','deposit_refunded'
      )`,
    ),
    statusCheck: check('customer_adjustments_status_check', sql`${t.status} IN ('active','void')`),
  }),
)
