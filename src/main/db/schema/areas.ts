import { sql } from 'drizzle-orm'
import { check, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const areas = sqliteTable(
  'areas',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    uuid: text('uuid').notNull().unique(),
    name: text('name').notNull().unique(),
    notes: text('notes'),
    isActive: integer('is_active').notNull().default(1),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    deletedAt: text('deleted_at'),
  },
  (t) => ({
    activeCheck: check('areas_is_active_check', sql`${t.isActive} IN (0,1)`),
  }),
)

export const routes = sqliteTable(
  'routes',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    uuid: text('uuid').notNull().unique(),
    name: text('name').notNull().unique(),
    areaId: integer('area_id').references(() => areas.id),
    // FK to employees added in Phase 6 — column exists without constraint for now.
    defaultEmployeeId: integer('default_employee_id'),
    sortOrder: integer('sort_order').notNull().default(0),
    notes: text('notes'),
    isActive: integer('is_active').notNull().default(1),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    deletedAt: text('deleted_at'),
  },
  (t) => ({
    activeCheck: check('routes_is_active_check', sql`${t.isActive} IN (0,1)`),
  }),
)
