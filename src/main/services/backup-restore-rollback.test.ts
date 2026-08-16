import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { isNull } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDatabase, getDb, getRawDb, openDatabase } from '@main/db/client'
import { customers } from '@main/db/schema'
import { clearPendingRestoreIntent } from '@main/lib/pending-restore'
import { closeAndRm, openTestApp, type TestApp } from '@main/test/harness'
import { seedMinimalCustomer } from '@main/test/seed-minimal'

function activeCustomerNames(): string[] {
  return getDb()
    .select({ name: customers.name })
    .from(customers)
    .where(isNull(customers.deletedAt))
    .all()
    .map((r) => r.name)
    .sort()
}

function rollbackFromPreRestoreZip(
  backup: TestApp['services']['backup'],
  zipPath: string,
  dbPath: string,
): void {
  const rollStaging = fs.mkdtempSync(path.join(os.tmpdir(), 'aqua-rollback-'))
  try {
    const extracted = backup.extractBackup(zipPath, rollStaging)
    backup.restoreDatabaseFile(extracted.dbPath, dbPath)
    backup.restoreAttachmentFolders(rollStaging)
  } finally {
    fs.rmSync(rollStaging, { recursive: true, force: true })
  }
}

describe('backup restore rollback', () => {
  let app: TestApp

  beforeEach(async () => {
    app = await openTestApp('aqua-restore-rb-')
  })

  afterEach(() => {
    closeAndRm(app)
  })

  it('failed restore rolls back to pre_restore zip and clears pending-restore.json', () => {
    const { services, owner, dbPath, dir } = app
    seedMinimalCustomer(services, owner.id, { name: 'Keep Me' })
    const pre = services.backup.createBackup('pre_restore', { skipPrune: true })
    const keepCount = services.backup.collectRowCounts().customers

    seedMinimalCustomer(services, owner.id, { name: 'Transient' })
    expect(activeCustomerNames()).toEqual(['Keep Me', 'Transient'])

    const intentPath = path.join(dir, 'pending-restore.json')
    fs.writeFileSync(
      intentPath,
      JSON.stringify({
        from: '/tmp/incoming.zip',
        preRestorePath: pre.filePath,
        at: new Date().toISOString(),
        userId: owner.id,
      }),
      'utf8',
    )

    closeDatabase()
    fs.writeFileSync(dbPath, 'not-a-sqlite-database')
    for (const suffix of ['-wal', '-shm']) {
      const sidecar = `${dbPath}${suffix}`
      if (fs.existsSync(sidecar)) fs.unlinkSync(sidecar)
    }

    clearPendingRestoreIntent(intentPath)
    rollbackFromPreRestoreZip(services.backup, pre.filePath, dbPath)
    openDatabase(dbPath)

    expect(fs.existsSync(intentPath)).toBe(false)
    expect(activeCustomerNames()).toEqual(['Keep Me'])
    expect(
      getRawDb().prepare('SELECT COUNT(*) AS n FROM customers WHERE deleted_at IS NULL').get(),
    ).toEqual({ n: keepCount })
  })

  it('restoring a later backup then rolling back to pre_restore restores prior row counts', () => {
    const { services, owner, dbPath } = app
    seedMinimalCustomer(services, owner.id, { name: 'Keep Me' })
    const pre = services.backup.createBackup('pre_restore', { skipPrune: true })
    seedMinimalCustomer(services, owner.id, { name: 'Transient' })
    const incoming = services.backup.createBackup('manual', { skipPrune: true })

    closeDatabase()
    const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'aqua-restore-in-'))
    try {
      const extracted = services.backup.extractBackup(incoming.filePath, staging)
      services.backup.restoreDatabaseFile(extracted.dbPath, dbPath)
    } finally {
      fs.rmSync(staging, { recursive: true, force: true })
    }
    openDatabase(dbPath)
    expect(activeCustomerNames()).toEqual(['Keep Me', 'Transient'])

    closeDatabase()
    rollbackFromPreRestoreZip(services.backup, pre.filePath, dbPath)
    openDatabase(dbPath)
    expect(activeCustomerNames()).toEqual(['Keep Me'])
  })
})
