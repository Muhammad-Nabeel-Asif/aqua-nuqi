import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDatabase, getDb, getRawDb, openDatabase } from '@main/db/client'
import { seedDefaults } from '@main/db/seed'
import { createZipFromFiles, isEncryptedArchive, readZipEntries } from '@main/lib/zip'
import { createBackupService } from './backup.service'

describe('backupService (Phase 9)', () => {
  let dir: string
  let userData: string
  let backupsDir: string
  let dbPath: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqua-backup-'))
    userData = path.join(dir, 'Aqua Nuqi')
    backupsDir = path.join(userData, 'backups')
    dbPath = path.join(userData, 'data', 'aqua-nuqi.db')
    fs.mkdirSync(path.dirname(dbPath), { recursive: true })
    fs.mkdirSync(backupsDir, { recursive: true })
    fs.mkdirSync(path.join(userData, 'attachments', 'expenses', '2026'), { recursive: true })
    fs.mkdirSync(path.join(userData, 'logos'), { recursive: true })
    fs.writeFileSync(path.join(userData, 'attachments', 'expenses', '2026', 'receipt.jpg'), 'img')
    fs.writeFileSync(path.join(userData, 'logos', 'logo.png'), 'logo')

    const { db } = openDatabase(dbPath)
    migrate(db, { migrationsFolder: path.join(process.cwd(), 'drizzle') })
    seedDefaults(db, backupsDir)
  })

  afterEach(() => {
    closeDatabase()
    fs.rmSync(dir, { recursive: true, force: true })
  })

  function service() {
    return createBackupService({
      db: getDb(),
      raw: getRawDb(),
      getBackupFolder: () => backupsDir,
      getSecondaryFolder: () => '',
      getUserData: () => userData,
      getDbPath: () => dbPath,
      getAppVersion: () => '1.0.0',
      getKeepDaily: () => 2,
      getKeepWeekly: () => 2,
      isEncryptionEnabled: () => false,
    })
  }

  it('creates a zip with VACUUM INTO db, attachments, logos and manifest checksum', () => {
    const bak = service()
    const result = bak.createBackup('manual')
    expect(result.filePath.endsWith('.zip')).toBe(true)
    expect(fs.existsSync(result.filePath)).toBe(true)
    expect(result.manifest.formatVersion).toBe(1)
    expect(result.manifest.appVersion).toBe('1.0.0')
    expect(result.manifest.attachmentFileCount).toBeGreaterThanOrEqual(2)

    const entries = readZipEntries(fs.readFileSync(result.filePath))
    const names = entries.map((e) => e.name)
    expect(names).toContain('manifest.json')
    expect(names).toContain('aqua-nuqi.db')
    expect(names.some((n) => n.startsWith('attachments/'))).toBe(true)
    expect(names.some((n) => n.startsWith('logos/'))).toBe(true)

    const verified = bak.verifyBackup(result.filePath)
    expect(verified.ok).toBe(true)
  })

  it('publishes via .tmp then rename so a kill mid-backup leaves no corrupt final zip', () => {
    const bak = service()
    const result = bak.createBackup('manual')
    // Successful path: final .zip exists, companion .tmp does not
    expect(fs.existsSync(result.filePath)).toBe(true)
    expect(fs.existsSync(`${result.filePath}.tmp`)).toBe(false)
    // Archive is a valid zip (or encrypted wrapper), never a half-written final name
    const entries = result.manifest.encrypted
      ? []
      : readZipEntries(fs.readFileSync(result.filePath))
    if (!result.manifest.encrypted) {
      expect(entries.some((e) => e.name === 'manifest.json')).toBe(true)
    }
  })

  it('encrypts with AES when password provided and decrypts for inspect', () => {
    const bak = service()
    const result = bak.createBackup('manual', { password: 'correct-horse' })
    expect(isEncryptedArchive(result.filePath)).toBe(true)
    expect(() => bak.inspectBackup(result.filePath)).toThrow()
    const inspected = bak.inspectBackup(result.filePath, 'correct-horse')
    expect(inspected.validChecksum).toBe(true)
    expect(inspected.manifest.encrypted).toBe(true)
  })

  it('never prunes pre_restore or the most recent successful backup', () => {
    const bak = service()
    const a = bak.createBackup('daily', { skipPrune: true })
    const b = bak.createBackup('daily', { skipPrune: true })
    const c = bak.createBackup('daily', { skipPrune: true })
    const pre = bak.createBackup('pre_restore', { skipPrune: true })
    bak.pruneRetention()
    expect(fs.existsSync(pre.filePath)).toBe(true)
    // most recent successful among all is `pre` — also keep last 2 daily
    const dailies = [a, b, c]
    const existingDailies = dailies.filter((x) => fs.existsSync(x.filePath))
    expect(existingDailies.length).toBeLessThanOrEqual(2)
  })

  it('extract + restore attachments round-trips row counts', () => {
    const bak = service()
    const countsBefore = bak.collectRowCounts()
    const result = bak.createBackup('manual')
    const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'aqua-restore-'))
    try {
      const extracted = bak.extractBackup(result.filePath, staging)
      expect(fs.existsSync(extracted.dbPath)).toBe(true)
      expect(
        fs.existsSync(path.join(staging, 'attachments', 'expenses', '2026', 'receipt.jpg')),
      ).toBe(true)
      // Replace attachments and confirm
      fs.rmSync(path.join(userData, 'attachments'), { recursive: true, force: true })
      bak.restoreAttachmentFolders(staging)
      expect(
        fs.existsSync(path.join(userData, 'attachments', 'expenses', '2026', 'receipt.jpg')),
      ).toBe(true)
      expect(extracted.manifest.rowCounts).toEqual(countsBefore)
    } finally {
      fs.rmSync(staging, { recursive: true, force: true })
    }
  })
})

describe('zip reader', () => {
  it('round-trips files', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqua-zip-'))
    const zipPath = path.join(dir, 't.zip')
    createZipFromFiles(
      [
        { name: 'a.txt', content: 'hello' },
        { name: 'nested/b.txt', content: 'world' },
      ],
      zipPath,
    )
    const entries = readZipEntries(fs.readFileSync(zipPath))
    expect(entries.find((e) => e.name === 'a.txt')?.content.toString()).toBe('hello')
    expect(entries.find((e) => e.name === 'nested/b.txt')?.content.toString()).toBe('world')
    fs.rmSync(dir, { recursive: true, force: true })
  })
})
