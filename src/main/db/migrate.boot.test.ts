import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { closeDatabase, getRawDb, openDatabase } from '@main/db/client'
import {
  getBundledSchemaVersion,
  resolveMigrationsFolder,
  runBootMigrations,
} from '@main/db/migrate'
import { ensureDirs, resolveAppPaths } from '@main/lib/paths'
import { PRODUCT_NAME } from '@shared/constants'

describe('runBootMigrations', () => {
  let root: string

  afterEach(() => {
    closeDatabase()
    if (root) fs.rmSync(root, { recursive: true, force: true })
  })

  function makePaths() {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'aqua-boot-mig-'))
    const userData = path.join(root, PRODUCT_NAME)
    const installDir = path.join(root, 'install')
    const resourcesPath = path.join(installDir, 'resources')
    fs.mkdirSync(resourcesPath, { recursive: true })
    const paths = resolveAppPaths(userData, installDir, resourcesPath)
    ensureDirs(paths)
    const migrationsFolder = resolveMigrationsFolder(process.cwd(), resourcesPath)
    return { paths, migrationsFolder }
  }

  it('fresh empty dbPath → kind: fresh', () => {
    const { paths, migrationsFolder } = makePaths()
    const outcome = runBootMigrations({
      paths,
      migrationsFolder,
      appVersion: '1.1.0',
    })
    expect(outcome.kind).toBe('fresh')
    if (outcome.kind === 'fresh') {
      expect(outcome.schemaVersion).toBe(getBundledSchemaVersion(migrationsFolder))
    }
  })

  it('second boot on the same DB → kind: up_to_date', () => {
    const { paths, migrationsFolder } = makePaths()
    runBootMigrations({ paths, migrationsFolder, appVersion: '1.1.0' })
    closeDatabase()
    const outcome = runBootMigrations({
      paths,
      migrationsFolder,
      appVersion: '1.1.0',
    })
    expect(outcome.kind).toBe('up_to_date')
    if (outcome.kind === 'up_to_date') {
      expect(outcome.schemaVersion).toBe(getBundledSchemaVersion(migrationsFolder))
    }
  })

  it('schema_version above bundled max → kind: refused_downgrade', () => {
    const { paths, migrationsFolder } = makePaths()
    runBootMigrations({ paths, migrationsFolder, appVersion: '1.1.0' })
    const bundled = getBundledSchemaVersion(migrationsFolder)
    getRawDb()
      .prepare(`UPDATE app_meta SET value = ? WHERE key = 'schema_version'`)
      .run(String(bundled + 5))
    closeDatabase()
    const outcome = runBootMigrations({
      paths,
      migrationsFolder,
      appVersion: '1.0.0',
    })
    expect(outcome.kind).toBe('refused_downgrade')
    if (outcome.kind === 'refused_downgrade') {
      expect(outcome.schemaVersion).toBe(bundled + 5)
      expect(outcome.bundledMax).toBe(bundled)
    }
  })

  it('migrating an older schema writes a pre-migration VACUUM backup under backups/', () => {
    const { paths, migrationsFolder } = makePaths()
    runBootMigrations({ paths, migrationsFolder, appVersion: '1.1.0' })
    getRawDb().prepare(`UPDATE app_meta SET value = '0' WHERE key = 'schema_version'`).run()
    closeDatabase()
    const outcome = runBootMigrations({
      paths,
      migrationsFolder,
      appVersion: '1.1.1',
    })
    expect(outcome.kind).toBe('migrated')
    if (outcome.kind === 'migrated') {
      expect(fs.existsSync(outcome.backupPath)).toBe(true)
      expect(outcome.backupPath.startsWith(paths.backupsDir)).toBe(true)
      expect(path.basename(outcome.backupPath)).toMatch(/pre_migration/)
    }
  })

  it('opens a real sqlite file for a brand-new path (no leftover singleton)', () => {
    const { paths, migrationsFolder } = makePaths()
    expect(fs.existsSync(paths.dbPath)).toBe(false)
    runBootMigrations({ paths, migrationsFolder, appVersion: '1.1.0' })
    expect(fs.existsSync(paths.dbPath)).toBe(true)
    openDatabase(paths.dbPath)
    const version = getRawDb()
      .prepare(`SELECT value FROM app_meta WHERE key = 'schema_version'`)
      .get() as { value: string }
    expect(Number(version.value)).toBe(getBundledSchemaVersion(migrationsFolder))
  })
})
