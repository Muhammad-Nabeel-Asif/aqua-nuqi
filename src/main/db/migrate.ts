import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { eq } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import type { AppPaths } from '@main/lib/paths'
import { nowIsoUtc } from '@shared/date'
import { AppError } from '@shared/errors'
import { closeDatabase, getRawDb, openDatabase, type AppDatabase, type RawDatabase } from './client'
import { appMeta, auditLog } from './schema'
import { seedDefaults } from './seed'

export type MigrationOutcome =
  | { kind: 'fresh'; schemaVersion: number }
  | { kind: 'up_to_date'; schemaVersion: number }
  | { kind: 'migrated'; from: number; to: number; backupPath: string }
  | { kind: 'refused_downgrade'; schemaVersion: number; bundledMax: number }

function listMigrationFiles(migrationsFolder: string): string[] {
  if (!fs.existsSync(migrationsFolder)) return []
  return fs
    .readdirSync(migrationsFolder)
    .filter((name) => /^\d+_.+\.sql$/.test(name))
    .sort()
}

/** Highest migration index + 1 (0000 → schema 1). */
export function getBundledSchemaVersion(migrationsFolder: string): number {
  const files = listMigrationFiles(migrationsFolder)
  if (files.length === 0) return 0
  const last = files[files.length - 1]
  const match = /^(\d+)_/.exec(last)
  return match ? Number(match[1]) + 1 : files.length
}

function readSchemaVersion(raw: RawDatabase): number | null {
  try {
    const row = raw.prepare(`SELECT value FROM app_meta WHERE key = 'schema_version'`).get() as
      { value: string } | undefined
    if (!row) return null
    const n = Number(row.value)
    return Number.isFinite(n) ? n : null
  } catch {
    return null
  }
}

function writeMeta(db: AppDatabase, key: string, value: string): void {
  const existing = db.select().from(appMeta).where(eq(appMeta.key, key)).get()
  if (existing) {
    db.update(appMeta).set({ value }).where(eq(appMeta.key, key)).run()
  } else {
    db.insert(appMeta).values({ key, value }).run()
  }
}

function createPreMigrationBackup(
  raw: RawDatabase,
  backupsDir: string,
): {
  filePath: string
  checksum: string
} {
  fs.mkdirSync(backupsDir, { recursive: true })
  const stamp = nowIsoUtc().replace(/[:.]/g, '-')
  const filePath = path.join(backupsDir, `aqua-nuqi-pre_migration-${stamp}.db`)
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
  raw.exec(`VACUUM INTO '${filePath.replace(/'/g, "''")}'`)
  const checksum = crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')

  try {
    raw
      .prepare(
        `INSERT INTO backup_log (created_at, kind, file_path, size_bytes, checksum, status, message)
         VALUES (?, 'pre_migration', ?, ?, ?, 'success', NULL)`,
      )
      .run(nowIsoUtc(), filePath, fs.statSync(filePath).size, checksum)
  } catch {
    // backup_log may not exist yet
  }

  return { filePath, checksum }
}

function restoreFromBackup(backupPath: string, dbPath: string): void {
  for (const suffix of ['', '-wal', '-shm']) {
    const p = `${dbPath}${suffix}`
    if (fs.existsSync(p)) fs.unlinkSync(p)
  }
  fs.copyFileSync(backupPath, dbPath)
}

export function resolveMigrationsFolder(appRoot: string, resourcesPath: string): string {
  const candidates = [
    path.join(resourcesPath, 'drizzle'),
    path.join(appRoot, 'drizzle'),
    path.join(process.cwd(), 'drizzle'),
  ]
  for (const c of candidates) {
    if (fs.existsSync(c)) return c
  }
  return candidates[candidates.length - 1]
}

export function runBootMigrations(opts: {
  paths: AppPaths
  migrationsFolder: string
  appVersion: string
}): MigrationOutcome {
  const { paths, migrationsFolder, appVersion } = opts
  const bundledMax = getBundledSchemaVersion(migrationsFolder)
  const dbExists = fs.existsSync(paths.dbPath)

  if (!dbExists) {
    const { db } = openDatabase(paths.dbPath)
    migrate(db, { migrationsFolder })
    writeMeta(db, 'schema_version', String(bundledMax))
    writeMeta(db, 'app_version', appVersion)
    writeMeta(db, 'installed_at', nowIsoUtc())
    writeMeta(db, 'db_uuid', crypto.randomUUID())
    seedDefaults(db, paths.backupsDir)
    return { kind: 'fresh', schemaVersion: bundledMax }
  }

  const { db, raw } = openDatabase(paths.dbPath)
  const current = readSchemaVersion(raw)

  if (current !== null && current > bundledMax) {
    closeDatabase()
    return {
      kind: 'refused_downgrade',
      schemaVersion: current,
      bundledMax,
    }
  }

  if (current !== null && current === bundledMax) {
    seedDefaults(db, paths.backupsDir)
    return { kind: 'up_to_date', schemaVersion: current }
  }

  const fromVersion = current ?? 0
  let backupPath = ''

  try {
    const backup = createPreMigrationBackup(raw, paths.backupsDir)
    backupPath = backup.filePath
    const checksumNow = crypto
      .createHash('sha256')
      .update(fs.readFileSync(backupPath))
      .digest('hex')
    if (checksumNow !== backup.checksum) {
      throw new AppError('MIGRATION_FAILED', 'Pre-migration backup checksum verification failed')
    }

    const prevApp =
      (
        raw.prepare(`SELECT value FROM app_meta WHERE key = 'app_version'`).get() as
          { value: string } | undefined
      )?.value ?? 'unknown'

    // drizzle-orm's migrator already runs all pending SQL inside one BEGIN/COMMIT.
    // schema_version + app_upgrade audit are written immediately after in one
    // transaction; on any failure the pre_migration backup is restored below.
    migrate(db, { migrationsFolder })

    db.transaction((tx) => {
      const schemaRow = tx.select().from(appMeta).where(eq(appMeta.key, 'schema_version')).get()
      if (schemaRow) {
        tx.update(appMeta)
          .set({ value: String(bundledMax) })
          .where(eq(appMeta.key, 'schema_version'))
          .run()
      } else {
        tx.insert(appMeta)
          .values({ key: 'schema_version', value: String(bundledMax) })
          .run()
      }
      const appRow = tx.select().from(appMeta).where(eq(appMeta.key, 'app_version')).get()
      if (appRow) {
        tx.update(appMeta).set({ value: appVersion }).where(eq(appMeta.key, 'app_version')).run()
      } else {
        tx.insert(appMeta).values({ key: 'app_version', value: appVersion }).run()
      }
      tx.insert(auditLog)
        .values({
          occurredAt: nowIsoUtc(),
          userId: null,
          action: 'app_upgrade',
          entityTable: 'app_meta',
          entityId: null,
          summary: `Upgraded ${prevApp} → ${appVersion}, schema ${fromVersion} → ${bundledMax}`,
          beforeJson: JSON.stringify({ appVersion: prevApp, schemaVersion: fromVersion }),
          afterJson: JSON.stringify({ appVersion, schemaVersion: bundledMax }),
        })
        .run()
    })

    seedDefaults(db, paths.backupsDir)
    return {
      kind: 'migrated',
      from: fromVersion,
      to: bundledMax,
      backupPath,
    }
  } catch (err) {
    closeDatabase()
    if (backupPath && fs.existsSync(backupPath)) {
      restoreFromBackup(backupPath, paths.dbPath)
    }
    const message = err instanceof Error ? err.message : String(err)
    if (err instanceof AppError) throw err
    throw new AppError(
      'MIGRATION_FAILED',
      `Migration failed and the pre-migration backup was restored. Backup: ${backupPath || 'n/a'}. ${message}`,
      { backupPath },
    )
  }
}

export function getSchemaVersion(): number {
  return readSchemaVersion(getRawDb()) ?? 0
}
