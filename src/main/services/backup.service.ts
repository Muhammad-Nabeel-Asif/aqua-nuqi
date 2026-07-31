import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type { AppDatabase, RawDatabase } from '@main/db/client'
import { backupLog } from '@main/db/schema'
import type { BackupKind } from '@shared/constants'
import { nowIsoUtc } from '@shared/date'
import { AppError } from '@shared/errors'

export type BackupResult = {
  filePath: string
  sizeBytes: number
  checksum: string
}

function sha256File(filePath: string): string {
  const hash = crypto.createHash('sha256')
  hash.update(fs.readFileSync(filePath))
  return hash.digest('hex')
}

export function createBackupService(deps: {
  db: AppDatabase
  raw: RawDatabase
  getBackupFolder: () => string
}) {
  function ensureFolder(folder: string): void {
    fs.mkdirSync(folder, { recursive: true })
  }

  function createBackup(kind: BackupKind): BackupResult {
    const folder = deps.getBackupFolder()
    ensureFolder(folder)
    const stamp = nowIsoUtc().replace(/[:.]/g, '-')
    const filePath = path.join(folder, `aqua-nuqi-${kind}-${stamp}.db`)

    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
      deps.raw.exec(`VACUUM INTO '${filePath.replace(/'/g, "''")}'`)
      const sizeBytes = fs.statSync(filePath).size
      const checksum = sha256File(filePath)

      deps.db
        .insert(backupLog)
        .values({
          createdAt: nowIsoUtc(),
          kind,
          filePath,
          sizeBytes,
          checksum,
          status: 'success',
          message: null,
        })
        .run()

      return { filePath, sizeBytes, checksum }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      try {
        deps.db
          .insert(backupLog)
          .values({
            createdAt: nowIsoUtc(),
            kind,
            filePath,
            sizeBytes: null,
            checksum: null,
            status: 'failed',
            message,
          })
          .run()
      } catch {
        // ignore secondary failure
      }
      throw new AppError('INTERNAL', `Backup failed: ${message}`)
    }
  }

  function verifyChecksum(filePath: string, expected: string): boolean {
    if (!fs.existsSync(filePath)) return false
    return sha256File(filePath) === expected
  }

  function listBackups() {
    const items = deps.db.select().from(backupLog).all()
    items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    const lastSuccess = items.find((i) => i.status === 'success')
    return {
      items: items.map((i) => ({
        id: i.id,
        createdAt: i.createdAt,
        kind: i.kind as BackupKind,
        filePath: i.filePath,
        sizeBytes: i.sizeBytes,
        checksum: i.checksum,
        status: i.status as 'success' | 'failed',
        message: i.message,
      })),
      lastSuccessAt: lastSuccess?.createdAt ?? null,
    }
  }

  /** Copy a backup DB file over the live DB path. Caller must close/reopen DB. */
  function restoreDatabaseFile(backupFilePath: string, targetDbPath: string): void {
    if (!fs.existsSync(backupFilePath)) {
      throw new AppError('NOT_FOUND', `Backup file not found: ${backupFilePath}`)
    }
    fs.mkdirSync(path.dirname(targetDbPath), { recursive: true })
    // Remove WAL/SHM companions so restore is clean
    for (const suffix of ['', '-wal', '-shm']) {
      const p = `${targetDbPath}${suffix}`
      if (fs.existsSync(p)) fs.unlinkSync(p)
    }
    fs.copyFileSync(backupFilePath, targetDbPath)
  }

  return {
    createBackup,
    verifyChecksum,
    listBackups,
    restoreDatabaseFile,
    sha256File,
  }
}

export type BackupService = ReturnType<typeof createBackupService>
