import { sql } from 'drizzle-orm'
import { check, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

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
