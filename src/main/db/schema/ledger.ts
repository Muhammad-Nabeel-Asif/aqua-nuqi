import { sql } from 'drizzle-orm'
import { check, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { customers } from './customers'
import { users } from './system'

/** APPEND-ONLY. The truth about what a customer owes. */
export const ledgerEntries = sqliteTable(
  'ledger_entries',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    uuid: text('uuid').notNull().unique(),
    customerId: integer('customer_id')
      .notNull()
      .references(() => customers.id),
    entryDate: text('entry_date').notNull(),
    entryType: text('entry_type').notNull(),
    debit: integer('debit').notNull().default(0),
    credit: integer('credit').notNull().default(0),
    balanceAfter: integer('balance_after').notNull(),
    description: text('description').notNull(),
    refTable: text('ref_table'),
    refId: integer('ref_id'),
    createdAt: text('created_at').notNull(),
    createdBy: integer('created_by').references(() => users.id),
  },
  (t) => ({
    typeCheck: check(
      'ledger_entries_entry_type_check',
      sql`${t.entryType} IN ('opening_balance','invoice','payment','adjustment_debit','adjustment_credit','deposit_received','deposit_refunded','write_off','void_reversal')`,
    ),
    customerIdx: index('idx_ledger_customer').on(t.customerId, t.entryDate, t.id),
  }),
)
