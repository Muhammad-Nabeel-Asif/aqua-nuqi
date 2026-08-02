import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { eq } from 'drizzle-orm'
import type { AppDatabase, RawDatabase } from '@main/db/client'
import { backupLog } from '@main/db/schema'
import {
  createZipFromFiles,
  decryptFileAes,
  encryptFileAes,
  isEncryptedArchive,
  listFilesRecursive,
  readZipEntries,
} from '@main/lib/zip'
import { BACKUP_KINDS_EXEMPT_FROM_PRUNING, type BackupKind, DB_FILE_NAME } from '@shared/constants'
import { nowIsoUtc, todayBusinessDate } from '@shared/date'
import { AppError } from '@shared/errors'

export type BackupManifest = {
  formatVersion: 1
  appVersion: string
  schemaVersion: number
  createdAt: string
  kind: BackupKind
  dbFileName: string
  dbChecksumSha256: string
  rowCounts: Record<string, number>
  encrypted: boolean
  attachmentFileCount: number
}

export type BackupResult = {
  filePath: string
  sizeBytes: number
  checksum: string
  kind: BackupKind
  secondaryCopied: boolean
  secondaryWarning: string | null
  manifest: BackupManifest
}

export type BackupProgress = {
  phase: 'vacuum' | 'attachments' | 'zip' | 'encrypt' | 'secondary' | 'prune' | 'done' | 'verify'
  percent: number
  message: string
}

export type BackupListItem = {
  id: number
  createdAt: string
  kind: BackupKind
  filePath: string
  sizeBytes: number | null
  checksum: string | null
  status: 'success' | 'failed'
  message: string | null
  exists: boolean
}

export type InspectBackupResult = {
  filePath: string
  encrypted: boolean
  manifest: BackupManifest
  validChecksum: boolean
}

function sha256File(filePath: string): string {
  const hash = crypto.createHash('sha256')
  hash.update(fs.readFileSync(filePath))
  return hash.digest('hex')
}

function sha256Buffer(buf: Buffer): string {
  return crypto.createHash('sha256').update(buf).digest('hex')
}

function stampForFilename(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `-${pad(d.getHours())}${pad(d.getMinutes())}`
  )
}

function tableNames(raw: RawDatabase): string[] {
  const rows = raw
    .prepare(
      `SELECT name FROM sqlite_master
       WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%'
       ORDER BY name`,
    )
    .all() as { name: string }[]
  return rows.map((r) => r.name)
}

function collectRowCounts(raw: RawDatabase): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const name of tableNames(raw)) {
    try {
      const row = raw.prepare(`SELECT count(*) AS c FROM "${name.replace(/"/g, '""')}"`).get() as {
        c: number
      }
      counts[name] = Number(row.c)
    } catch {
      counts[name] = -1
    }
  }
  return counts
}

function readSchemaVersion(raw: RawDatabase): number {
  try {
    const row = raw.prepare(`SELECT value FROM app_meta WHERE key = 'schema_version'`).get() as
      { value: string } | undefined
    return row ? Number(row.value) || 0 : 0
  } catch {
    return 0
  }
}

function safeUnlink(p: string): void {
  try {
    if (fs.existsSync(p)) fs.unlinkSync(p)
  } catch {
    // ignore
  }
}

function copyDirRecursive(src: string, dest: string): void {
  if (!fs.existsSync(src)) return
  fs.mkdirSync(dest, { recursive: true })
  for (const name of fs.readdirSync(src)) {
    const from = path.join(src, name)
    const to = path.join(dest, name)
    const st = fs.statSync(from)
    if (st.isDirectory()) copyDirRecursive(from, to)
    else fs.copyFileSync(from, to)
  }
}

function rmrf(target: string): void {
  if (!fs.existsSync(target)) return
  fs.rmSync(target, { recursive: true, force: true })
}

export function createBackupService(deps: {
  db: AppDatabase
  raw: RawDatabase
  getBackupFolder: () => string
  getSecondaryFolder: () => string
  getUserData: () => string
  getDbPath: () => string
  getAppVersion: () => string
  getKeepDaily: () => number
  getKeepWeekly: () => number
  isEncryptionEnabled: () => boolean
  /** Optional password provider when encryption is on (manual create may override). */
  getEncryptionPassword?: () => string | null
}) {
  function ensureFolder(folder: string): void {
    fs.mkdirSync(folder, { recursive: true })
  }

  function attachmentsRoot(): string {
    return path.join(deps.getUserData(), 'attachments')
  }

  function logosRoot(): string {
    return path.join(deps.getUserData(), 'logos')
  }

  function emit(
    onProgress: ((p: BackupProgress) => void) | undefined,
    progress: BackupProgress,
  ): void {
    onProgress?.(progress)
  }

  /**
   * Create a full backup ZIP (DB via VACUUM INTO + attachments + logos + manifest).
   * Writes to a .tmp path first, then renames — killing mid-backup leaves no corrupt final file.
   */
  function createBackup(
    kind: BackupKind,
    opts?: {
      password?: string | null
      onProgress?: (p: BackupProgress) => void
      /** Skip secondary copy / prune (used for pre_restore / pre_migration). */
      skipSecondary?: boolean
      skipPrune?: boolean
    },
  ): BackupResult {
    const folder = deps.getBackupFolder()
    ensureFolder(folder)
    const stamp = stampForFilename()
    const baseName = `aquanuqi-backup-${stamp}-${kind}`
    const finalZipPath = path.join(folder, `${baseName}.zip`)
    const tmpZipPath = `${finalZipPath}.tmp`
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aquanuqi-backup-'))
    const vacuumPath = path.join(tmpDir, DB_FILE_NAME)

    let secondaryCopied = false
    let secondaryWarning: string | null = null

    try {
      emit(opts?.onProgress, {
        phase: 'vacuum',
        percent: 5,
        message: 'Creating consistent database snapshot…',
      })
      if (fs.existsSync(vacuumPath)) fs.unlinkSync(vacuumPath)
      deps.raw.exec(`VACUUM INTO '${vacuumPath.replace(/'/g, "''")}'`)
      const dbChecksum = sha256File(vacuumPath)
      const schemaVersion = readSchemaVersion(deps.raw)
      const rowCounts = collectRowCounts(deps.raw)

      emit(opts?.onProgress, {
        phase: 'attachments',
        percent: 25,
        message: 'Collecting attachments…',
      })
      const files: { name: string; content: Buffer | string }[] = []
      files.push({ name: DB_FILE_NAME, content: fs.readFileSync(vacuumPath) })

      let attachmentFileCount = 0
      for (const [folderName, root] of [
        ['attachments', attachmentsRoot()],
        ['logos', logosRoot()],
      ] as const) {
        for (const rel of listFilesRecursive(root)) {
          const abs = path.join(root, rel)
          files.push({ name: `${folderName}/${rel}`, content: fs.readFileSync(abs) })
          attachmentFileCount++
        }
      }

      const password =
        opts?.password !== undefined
          ? opts.password
          : deps.isEncryptionEnabled()
            ? (deps.getEncryptionPassword?.() ?? null)
            : null
      const encrypted = Boolean(password)

      const manifest: BackupManifest = {
        formatVersion: 1,
        appVersion: deps.getAppVersion(),
        schemaVersion,
        createdAt: nowIsoUtc(),
        kind,
        dbFileName: DB_FILE_NAME,
        dbChecksumSha256: dbChecksum,
        rowCounts,
        encrypted,
        attachmentFileCount,
      }
      files.push({ name: 'manifest.json', content: JSON.stringify(manifest, null, 2) })

      emit(opts?.onProgress, { phase: 'zip', percent: 55, message: 'Packaging backup archive…' })
      safeUnlink(tmpZipPath)
      createZipFromFiles(files, tmpZipPath)

      let archivePath = tmpZipPath
      if (password) {
        emit(opts?.onProgress, { phase: 'encrypt', percent: 70, message: 'Encrypting backup…' })
        const encTmp = `${tmpZipPath}.enc`
        encryptFileAes(tmpZipPath, encTmp, password)
        safeUnlink(tmpZipPath)
        fs.renameSync(encTmp, tmpZipPath)
        archivePath = tmpZipPath
      }

      // Atomic publish
      safeUnlink(finalZipPath)
      fs.renameSync(archivePath, finalZipPath)
      const sizeBytes = fs.statSync(finalZipPath).size
      const checksum = sha256File(finalZipPath)

      if (!opts?.skipSecondary) {
        const secondary = deps.getSecondaryFolder()?.trim()
        if (secondary) {
          emit(opts?.onProgress, {
            phase: 'secondary',
            percent: 85,
            message: 'Copying to secondary destination…',
          })
          try {
            if (!fs.existsSync(secondary)) {
              throw new Error(`Secondary folder does not exist: ${secondary}`)
            }
            ensureFolder(secondary)
            const dest = path.join(secondary, path.basename(finalZipPath))
            fs.copyFileSync(finalZipPath, dest)
            secondaryCopied = true
          } catch (err) {
            secondaryWarning = err instanceof Error ? err.message : String(err)
          }
        }
      }

      deps.db
        .insert(backupLog)
        .values({
          createdAt: nowIsoUtc(),
          kind,
          filePath: finalZipPath,
          sizeBytes,
          checksum,
          status: 'success',
          message: secondaryWarning
            ? `Secondary copy failed: ${secondaryWarning}`
            : secondaryCopied
              ? 'Copied to secondary destination'
              : null,
        })
        .run()

      if (!opts?.skipPrune) {
        emit(opts?.onProgress, { phase: 'prune', percent: 95, message: 'Applying retention…' })
        pruneRetention()
      }

      emit(opts?.onProgress, { phase: 'done', percent: 100, message: 'Backup complete' })

      return {
        filePath: finalZipPath,
        sizeBytes,
        checksum,
        kind,
        secondaryCopied,
        secondaryWarning,
        manifest,
      }
    } catch (err) {
      safeUnlink(tmpZipPath)
      safeUnlink(finalZipPath)
      const message = err instanceof Error ? err.message : String(err)
      try {
        deps.db
          .insert(backupLog)
          .values({
            createdAt: nowIsoUtc(),
            kind,
            filePath: finalZipPath,
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
    } finally {
      rmrf(tmpDir)
    }
  }

  /**
   * Retention: keep last N daily and M weekly; never prune most recent successful
   * backup or any pre_migration / pre_restore backup.
   */
  function pruneRetention(): void {
    const keepDaily = Math.max(1, deps.getKeepDaily())
    const keepWeekly = Math.max(1, deps.getKeepWeekly())
    const items = deps.db.select().from(backupLog).all()
    const success = items
      .filter((i) => i.status === 'success')
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))

    if (success.length === 0) return
    const mostRecentPath = success[0].filePath
    const exempt = new Set<string>(BACKUP_KINDS_EXEMPT_FROM_PRUNING)

    const daily = success.filter((i) => i.kind === 'daily')
    const weekly = success.filter((i) => i.kind === 'weekly')

    const toPrune = new Set<number>()
    for (const list of [daily.slice(keepDaily), weekly.slice(keepWeekly)]) {
      for (const row of list) {
        if (exempt.has(row.kind)) continue
        if (row.filePath === mostRecentPath) continue
        toPrune.add(row.id)
      }
    }

    for (const row of success) {
      if (!toPrune.has(row.id)) continue
      safeUnlink(row.filePath)
      deps.db
        .update(backupLog)
        .set({ message: (row.message ? `${row.message}; ` : '') + 'pruned by retention' })
        .where(eq(backupLog.id, row.id))
        .run()
    }
  }

  function verifyChecksum(filePath: string, expected: string): boolean {
    if (!fs.existsSync(filePath)) return false
    return sha256File(filePath) === expected
  }

  function listBackups(): {
    items: BackupListItem[]
    lastSuccessAt: string | null
    storageUsedBytes: number
    nextDailyDue: boolean
    nextWeeklyDue: boolean
  } {
    const items = deps.db.select().from(backupLog).all()
    items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    const lastSuccess = items.find((i) => i.status === 'success')
    let storageUsedBytes = 0
    const mapped = items.map((i) => {
      const exists = fs.existsSync(i.filePath)
      if (exists && i.status === 'success') {
        try {
          storageUsedBytes += fs.statSync(i.filePath).size
        } catch {
          // ignore
        }
      }
      return {
        id: i.id,
        createdAt: i.createdAt,
        kind: i.kind as BackupKind,
        filePath: i.filePath,
        sizeBytes: i.sizeBytes,
        checksum: i.checksum,
        status: i.status as 'success' | 'failed',
        message: i.message,
        exists,
      }
    })

    const today = todayBusinessDate()
    const hasDailyToday = mapped.some(
      (i) => i.status === 'success' && i.kind === 'daily' && i.createdAt.slice(0, 10) === today,
    )
    const weekAgo = new Date()
    weekAgo.setDate(weekAgo.getDate() - 7)
    const weekAgoIso = weekAgo.toISOString()
    const hasRecentWeekly = mapped.some(
      (i) => i.status === 'success' && i.kind === 'weekly' && i.createdAt >= weekAgoIso,
    )

    return {
      items: mapped,
      lastSuccessAt: lastSuccess?.createdAt ?? null,
      storageUsedBytes,
      nextDailyDue: !hasDailyToday,
      nextWeeklyDue: !hasRecentWeekly,
    }
  }

  /** Open and validate a backup archive; does not touch live data. */
  function inspectBackup(archivePath: string, password?: string | null): InspectBackupResult {
    if (!fs.existsSync(archivePath)) {
      throw new AppError('NOT_FOUND', `Backup file not found: ${archivePath}`)
    }

    let zipPath = archivePath
    let tmpPlain: string | null = null
    try {
      if (isEncryptedArchive(archivePath)) {
        if (!password) {
          throw new AppError('VALIDATION_FAILED', 'This backup is encrypted — enter the password')
        }
        tmpPlain = path.join(
          os.tmpdir(),
          `aquanuqi-inspect-${crypto.randomBytes(6).toString('hex')}.zip`,
        )
        decryptFileAes(archivePath, tmpPlain, password)
        zipPath = tmpPlain
      }

      const entries = readZipEntries(fs.readFileSync(zipPath))
      const manifestEntry = entries.find((e) => e.name === 'manifest.json')
      if (!manifestEntry) {
        throw new AppError('VALIDATION_FAILED', 'Backup is missing manifest.json')
      }
      let manifest: BackupManifest
      try {
        manifest = JSON.parse(manifestEntry.content.toString('utf8')) as BackupManifest
      } catch {
        throw new AppError('VALIDATION_FAILED', 'Backup manifest.json is not valid JSON')
      }
      if (manifest.formatVersion !== 1) {
        throw new AppError(
          'VALIDATION_FAILED',
          `Unsupported backup format version ${String(manifest.formatVersion)}`,
        )
      }
      const dbEntry = entries.find((e) => e.name === (manifest.dbFileName || DB_FILE_NAME))
      if (!dbEntry) {
        throw new AppError('VALIDATION_FAILED', 'Backup is missing the database file')
      }
      const validChecksum = sha256Buffer(dbEntry.content) === manifest.dbChecksumSha256
      return {
        filePath: archivePath,
        encrypted: isEncryptedArchive(archivePath),
        manifest,
        validChecksum,
      }
    } finally {
      if (tmpPlain) safeUnlink(tmpPlain)
    }
  }

  function verifyBackup(
    archivePath: string,
    password?: string | null,
  ): { ok: boolean; manifest: BackupManifest; message: string } {
    const inspected = inspectBackup(archivePath, password)
    if (!inspected.validChecksum) {
      return {
        ok: false,
        manifest: inspected.manifest,
        message: 'Database checksum does not match the manifest',
      }
    }
    return { ok: true, manifest: inspected.manifest, message: 'Backup archive is valid' }
  }

  /**
   * Extract a backup's DB (+ attachments/logos) into a staging directory for restore
   * or read-only inspection. Caller owns cleanup of stagingDir.
   */
  function extractBackup(
    archivePath: string,
    stagingDir: string,
    password?: string | null,
  ): { manifest: BackupManifest; dbPath: string } {
    const inspected = inspectBackup(archivePath, password)
    if (!inspected.validChecksum) {
      throw new AppError('VALIDATION_FAILED', 'Backup checksum validation failed')
    }

    let zipPath = archivePath
    let tmpPlain: string | null = null
    try {
      if (isEncryptedArchive(archivePath)) {
        if (!password) {
          throw new AppError('VALIDATION_FAILED', 'Password required for encrypted backup')
        }
        tmpPlain = path.join(
          os.tmpdir(),
          `aquanuqi-extract-${crypto.randomBytes(6).toString('hex')}.zip`,
        )
        decryptFileAes(archivePath, tmpPlain, password)
        zipPath = tmpPlain
      }

      rmrf(stagingDir)
      fs.mkdirSync(stagingDir, { recursive: true })
      const entries = readZipEntries(fs.readFileSync(zipPath))
      for (const e of entries) {
        const target = path.join(stagingDir, e.name)
        const resolved = path.resolve(target)
        if (
          !resolved.startsWith(path.resolve(stagingDir) + path.sep) &&
          resolved !== path.resolve(stagingDir)
        ) {
          throw new AppError('VALIDATION_FAILED', `Unsafe path in backup: ${e.name}`)
        }
        fs.mkdirSync(path.dirname(resolved), { recursive: true })
        fs.writeFileSync(resolved, e.content)
      }

      const dbPath = path.join(stagingDir, inspected.manifest.dbFileName || DB_FILE_NAME)
      if (!fs.existsSync(dbPath)) {
        throw new AppError('VALIDATION_FAILED', 'Extracted backup is missing the database file')
      }
      return { manifest: inspected.manifest, dbPath }
    } finally {
      if (tmpPlain) safeUnlink(tmpPlain)
    }
  }

  /** Copy a backup DB file over the live DB path. Caller must close/reopen DB. */
  function restoreDatabaseFile(backupFilePath: string, targetDbPath: string): void {
    if (!fs.existsSync(backupFilePath)) {
      throw new AppError('NOT_FOUND', `Backup file not found: ${backupFilePath}`)
    }
    fs.mkdirSync(path.dirname(targetDbPath), { recursive: true })
    for (const suffix of ['', '-wal', '-shm']) {
      const p = `${targetDbPath}${suffix}`
      if (fs.existsSync(p)) fs.unlinkSync(p)
    }
    fs.copyFileSync(backupFilePath, targetDbPath)
  }

  /** Replace live attachments + logos from a staging extract. */
  function restoreAttachmentFolders(stagingDir: string): void {
    const userData = deps.getUserData()
    for (const name of ['attachments', 'logos'] as const) {
      const src = path.join(stagingDir, name)
      const dest = path.join(userData, name)
      rmrf(dest)
      if (fs.existsSync(src)) {
        copyDirRecursive(src, dest)
      } else {
        fs.mkdirSync(dest, { recursive: true })
      }
    }
  }

  /** Legacy Phase 0 bare-.db restore support. */
  function isLegacyDbBackup(filePath: string): boolean {
    return /\.(db|sqlite)$/i.test(filePath) && !isEncryptedArchive(filePath)
  }

  function needsDailyBackup(): boolean {
    return listBackups().nextDailyDue
  }

  function needsWeeklyBackup(): boolean {
    return listBackups().nextWeeklyDue
  }

  return {
    createBackup,
    verifyChecksum,
    listBackups,
    inspectBackup,
    verifyBackup,
    extractBackup,
    restoreDatabaseFile,
    restoreAttachmentFolders,
    isLegacyDbBackup,
    needsDailyBackup,
    needsWeeklyBackup,
    pruneRetention,
    sha256File,
    collectRowCounts: () => collectRowCounts(deps.raw),
  }
}

export type BackupService = ReturnType<typeof createBackupService>
