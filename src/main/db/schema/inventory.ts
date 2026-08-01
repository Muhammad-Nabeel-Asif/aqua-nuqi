import { sql } from 'drizzle-orm'
import { check, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { customers } from './customers'
import { employees } from './employees'
import { products } from './products'
import { users } from './system'

// routes imported lazily via integer FK to avoid circular imports with areas/routes;
// the SQL migration declares REFERENCES routes(id).

export const vehicles = sqliteTable(
  'vehicles',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    uuid: text('uuid').notNull().unique(),
    name: text('name').notNull(),
    registrationNo: text('registration_no').unique(),
    vehicleType: text('vehicle_type'),
    capacityBottles: integer('capacity_bottles'),
    isActive: integer('is_active').notNull().default(1),
    notes: text('notes'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => ({
    activeCheck: check('vehicles_is_active_check', sql`${t.isActive} IN (0,1)`),
    typeCheck: check(
      'vehicles_vehicle_type_check',
      sql`${t.vehicleType} IS NULL OR ${t.vehicleType} IN ('loader','rickshaw','bike','van','truck','other')`,
    ),
  }),
)

export const trips = sqliteTable(
  'trips',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    uuid: text('uuid').notNull().unique(),
    tripDate: text('trip_date').notNull(),
    employeeId: integer('employee_id').references(() => employees.id),
    vehicleId: integer('vehicle_id').references(() => vehicles.id),
    routeId: integer('route_id'),
    filledLoaded: integer('filled_loaded').notNull().default(0),
    filledReturned: integer('filled_returned').notNull().default(0),
    emptiesReturned: integer('empties_returned').notNull().default(0),
    bottlesDeliveredCalc: integer('bottles_delivered_calc').notNull().default(0),
    cashExpected: integer('cash_expected').notNull().default(0),
    cashSubmitted: integer('cash_submitted').notNull().default(0),
    cashVariance: integer('cash_variance').notNull().default(0),
    bottleVariance: integer('bottle_variance').notNull().default(0),
    status: text('status').notNull().default('open'),
    notes: text('notes'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    createdBy: integer('created_by').references(() => users.id),
  },
  (t) => ({
    statusCheck: check('trips_status_check', sql`${t.status} IN ('open','closed','void')`),
    dateIdx: index('idx_trips_date').on(t.tripDate),
  }),
)

/**
 * Append-only movement ledger. Stock levels are always derived from this —
 * never stored as a mutable counter.
 */
export const stockMovements = sqliteTable(
  'stock_movements',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    uuid: text('uuid').notNull().unique(),
    movementDate: text('movement_date').notNull(),
    productId: integer('product_id')
      .notNull()
      .references(() => products.id),
    bottleState: text('bottle_state').notNull(),
    quantity: integer('quantity').notNull(),
    fromLocation: text('from_location').notNull(),
    toLocation: text('to_location').notNull(),
    vehicleId: integer('vehicle_id').references(() => vehicles.id),
    customerId: integer('customer_id').references(() => customers.id),
    reason: text('reason').notNull(),
    refTable: text('ref_table'),
    refId: integer('ref_id'),
    notes: text('notes'),
    createdAt: text('created_at').notNull(),
    createdBy: integer('created_by').references(() => users.id),
  },
  (t) => ({
    qtyCheck: check('stock_movements_quantity_check', sql`${t.quantity} > 0`),
    stateCheck: check(
      'stock_movements_bottle_state_check',
      sql`${t.bottleState} IN ('filled','empty')`,
    ),
    fromCheck: check(
      'stock_movements_from_location_check',
      sql`${t.fromLocation} IN ('none','plant','van','customer','supplier')`,
    ),
    toCheck: check(
      'stock_movements_to_location_check',
      sql`${t.toLocation} IN ('none','plant','van','customer','scrap')`,
    ),
    reasonCheck: check(
      'stock_movements_reason_check',
      sql`${t.reason} IN (
        'purchase','production','load_to_van','unload_from_van','delivery','empty_pickup',
        'damaged','lost','scrapped','adjustment','opening_stock'
      )`,
    ),
    dateIdx: index('idx_stock_date').on(t.movementDate),
    productIdx: index('idx_stock_product').on(t.productId, t.bottleState),
  }),
)
