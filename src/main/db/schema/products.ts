import { sql } from 'drizzle-orm'
import { check, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const products = sqliteTable(
  'products',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    uuid: text('uuid').notNull().unique(),
    name: text('name').notNull(),
    sku: text('sku').unique(),
    sizeLiters: real('size_liters'),
    kind: text('kind').notNull(),
    isReturnable: integer('is_returnable').notNull().default(1),
    defaultRate: integer('default_rate').notNull().default(0),
    defaultDeposit: integer('default_deposit').notNull().default(0),
    trackStock: integer('track_stock').notNull().default(1),
    isDefault: integer('is_default').notNull().default(0),
    isActive: integer('is_active').notNull().default(1),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    deletedAt: text('deleted_at'),
  },
  (t) => ({
    kindCheck: check(
      'products_kind_check',
      sql`${t.kind} IN ('returnable_bottle','packaged_water','equipment','rental','service')`,
    ),
    returnableCheck: check('products_is_returnable_check', sql`${t.isReturnable} IN (0,1)`),
    trackCheck: check('products_track_stock_check', sql`${t.trackStock} IN (0,1)`),
    defaultCheck: check('products_is_default_check', sql`${t.isDefault} IN (0,1)`),
    activeCheck: check('products_is_active_check', sql`${t.isActive} IN (0,1)`),
  }),
)
