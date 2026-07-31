import { sql } from 'drizzle-orm'
import { check, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const appMeta = sqliteTable('app_meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
})

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: text('updated_at').notNull(),
})

export const users = sqliteTable(
  'users',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    uuid: text('uuid').notNull().unique(),
    username: text('username').notNull().unique(),
    displayName: text('display_name').notNull(),
    passwordHash: text('password_hash').notNull(),
    pinHash: text('pin_hash'),
    role: text('role').notNull(),
    isActive: integer('is_active').notNull().default(1),
    lastLoginAt: text('last_login_at'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => ({
    roleCheck: check('users_role_check', sql`${t.role} IN ('owner','operator','viewer')`),
    activeCheck: check('users_is_active_check', sql`${t.isActive} IN (0,1)`),
  }),
)

export const auditLog = sqliteTable(
  'audit_log',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    occurredAt: text('occurred_at').notNull(),
    userId: integer('user_id').references(() => users.id),
    action: text('action').notNull(),
    entityTable: text('entity_table'),
    entityId: integer('entity_id'),
    summary: text('summary').notNull(),
    beforeJson: text('before_json'),
    afterJson: text('after_json'),
  },
  (t) => ({
    actionCheck: check(
      'audit_log_action_check',
      sql`${t.action} IN ('create','update','delete','void','login','logout','settings_change','backup','restore','period_close','period_reopen','export','app_upgrade')`,
    ),
    occurredIdx: index('idx_audit_occurred').on(t.occurredAt),
    entityIdx: index('idx_audit_entity').on(t.entityTable, t.entityId),
  }),
)

export const closedPeriods = sqliteTable('closed_periods', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  period: text('period').notNull().unique(),
  closedAt: text('closed_at').notNull(),
  closedBy: integer('closed_by').references(() => users.id),
  reopenedAt: text('reopened_at'),
  reopenedBy: integer('reopened_by').references(() => users.id),
  notes: text('notes'),
})

export const backupLog = sqliteTable(
  'backup_log',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    createdAt: text('created_at').notNull(),
    kind: text('kind').notNull(),
    filePath: text('file_path').notNull(),
    sizeBytes: integer('size_bytes'),
    checksum: text('checksum'),
    status: text('status').notNull(),
    message: text('message'),
  },
  (t) => ({
    kindCheck: check(
      'backup_log_kind_check',
      sql`${t.kind} IN ('manual','on_exit','daily','weekly','pre_migration','pre_restore')`,
    ),
    statusCheck: check('backup_log_status_check', sql`${t.status} IN ('success','failed')`),
  }),
)

export const sequences = sqliteTable('sequences', {
  name: text('name').primaryKey(),
  nextValue: integer('next_value').notNull(),
})
