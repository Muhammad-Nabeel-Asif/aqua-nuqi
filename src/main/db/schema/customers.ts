import { sql } from 'drizzle-orm'
import { check, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { areas, routes } from './areas'
import { products } from './products'
import { users } from './system'

export const customers = sqliteTable(
  'customers',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    uuid: text('uuid').notNull().unique(),
    code: text('code').notNull().unique(),
    name: text('name').notNull(),
    customerType: text('customer_type').notNull().default('residential'),
    phonePrimary: text('phone_primary'),
    phoneSecondary: text('phone_secondary'),
    whatsappNumber: text('whatsapp_number'),
    email: text('email'),
    addressLine: text('address_line'),
    landmark: text('landmark'),
    areaId: integer('area_id').references(() => areas.id),
    routeId: integer('route_id').references(() => routes.id),
    deliveryNotes: text('delivery_notes'),

    billingMode: text('billing_mode').notNull().default('per_bottle'),
    packageAmount: integer('package_amount'),
    packageIncludedQty: integer('package_included_qty'),
    packageExcessRate: integer('package_excess_rate'),

    billingDay: integer('billing_day'),
    creditLimit: integer('credit_limit'),

    securityDepositHeld: integer('security_deposit_held').notNull().default(0),
    openingBottles: integer('opening_bottles').notNull().default(0),
    openingBalance: integer('opening_balance').notNull().default(0),
    openingAsOf: text('opening_as_of'),

    status: text('status').notNull().default('active'),
    pausedFrom: text('paused_from'),
    pausedTo: text('paused_to'),
    statusReason: text('status_reason'),
    joinedOn: text('joined_on'),
    notes: text('notes'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    deletedAt: text('deleted_at'),
    createdBy: integer('created_by').references(() => users.id),
    updatedBy: integer('updated_by').references(() => users.id),
  },
  (t) => ({
    typeCheck: check(
      'customers_customer_type_check',
      sql`${t.customerType} IN ('residential','commercial','walk_in')`,
    ),
    billingCheck: check(
      'customers_billing_mode_check',
      sql`${t.billingMode} IN ('per_bottle','monthly_package')`,
    ),
    statusCheck: check(
      'customers_status_check',
      sql`${t.status} IN ('active','paused','inactive')`,
    ),
    nameIdx: index('idx_customers_name').on(t.name),
    routeIdx: index('idx_customers_route').on(t.routeId),
    areaIdx: index('idx_customers_area').on(t.areaId),
    statusIdx: index('idx_customers_status').on(t.status),
  }),
)

/** Dated price list. Never UPDATE a rate — close the old row and insert a new one. */
export const customerRates = sqliteTable(
  'customer_rates',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    uuid: text('uuid').notNull().unique(),
    customerId: integer('customer_id')
      .notNull()
      .references(() => customers.id),
    productId: integer('product_id')
      .notNull()
      .references(() => products.id),
    rate: integer('rate').notNull(),
    effectiveFrom: text('effective_from').notNull(),
    effectiveTo: text('effective_to'),
    reason: text('reason'),
    createdAt: text('created_at').notNull(),
    createdBy: integer('created_by').references(() => users.id),
  },
  (t) => ({
    lookupIdx: index('idx_customer_rates_lookup').on(t.customerId, t.productId, t.effectiveFrom),
  }),
)

export const customerSchedules = sqliteTable(
  'customer_schedules',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    customerId: integer('customer_id')
      .notNull()
      .references(() => customers.id),
    mode: text('mode').notNull(),
    weekdays: text('weekdays'),
    intervalDays: integer('interval_days'),
    defaultQty: integer('default_qty').notNull().default(1),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => ({
    modeCheck: check(
      'customer_schedules_mode_check',
      sql`${t.mode} IN ('weekdays','interval_days','on_call')`,
    ),
  }),
)

/** Materialised summary; rebuildable via balanceService.recalculate. */
export const customerBalances = sqliteTable('customer_balances', {
  customerId: integer('customer_id')
    .primaryKey()
    .references(() => customers.id),
  balance: integer('balance').notNull().default(0),
  bottlesWithCustomer: integer('bottles_with_customer').notNull().default(0),
  lastDeliveryDate: text('last_delivery_date'),
  lastPaymentDate: text('last_payment_date'),
  lastInvoiceId: integer('last_invoice_id'),
  updatedAt: text('updated_at').notNull(),
})
