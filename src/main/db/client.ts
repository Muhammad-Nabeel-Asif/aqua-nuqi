import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3' // eslint-disable-line import/no-named-as-default
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema'

export type AppDatabase = BetterSQLite3Database<typeof schema>
export type RawDatabase = Database.Database

let rawDb: RawDatabase | null = null
let db: AppDatabase | null = null

export function openDatabase(dbPath: string): { db: AppDatabase; raw: RawDatabase } {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true })
  const raw = new Database(dbPath)
  raw.pragma('journal_mode = WAL')
  raw.pragma('foreign_keys = ON')
  raw.pragma('synchronous = NORMAL')
  raw.pragma('busy_timeout = 5000')
  rawDb = raw
  db = drizzle(raw, { schema })
  return { db, raw }
}

export function getDb(): AppDatabase {
  if (!db) throw new Error('Database not opened')
  return db
}

export function getRawDb(): RawDatabase {
  if (!rawDb) throw new Error('Database not opened')
  return rawDb
}

export function closeDatabase(): void {
  if (rawDb) {
    rawDb.close()
    rawDb = null
    db = null
  }
}

export function isDatabaseOpen(): boolean {
  return rawDb !== null
}
