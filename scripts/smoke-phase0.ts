/**
 * Headless Phase 0 smoke checks against an isolated temp userData tree.
 * Covers: migrate/seed, setup owner, login reject/accept, period lock,
 * backup VACUUM INTO, restore, schema downgrade refusal, install-dir path guard.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3' // eslint-disable-line import/no-named-as-default
import { closeDatabase, getDb, getRawDb } from '../src/main/db/client'
import {
  getBundledSchemaVersion,
  resolveMigrationsFolder,
  runBootMigrations,
} from '../src/main/db/migrate'
import { assertDbPathSafe, ensureDirs, resolveAppPaths } from '../src/main/lib/paths'
import { createAuditService } from '../src/main/services/audit.service'
import { createAuthService } from '../src/main/services/auth.service'
import { createBackupService } from '../src/main/services/backup.service'
import { createPeriodService } from '../src/main/services/period.service'
import { createSettingsService } from '../src/main/services/settings.service'
import { AppError } from '../src/shared/errors'

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg)
}

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aqua-smoke-'))
  const userData = path.join(root, 'userData')
  const installDir = path.join(root, 'install')
  const resourcesPath = path.join(installDir, 'resources')
  fs.mkdirSync(resourcesPath, { recursive: true })

  const paths = resolveAppPaths(userData, installDir, resourcesPath)
  ensureDirs(paths)
  const migrationsFolder = resolveMigrationsFolder(process.cwd(), resourcesPath)

  // Fresh migrate
  let outcome = runBootMigrations({
    paths,
    migrationsFolder,
    appVersion: '0.1.0',
  })
  assert(outcome.kind === 'fresh', `expected fresh, got ${outcome.kind}`)
  console.log('✓ fresh migrate + seed')

  const db = getDb()
  const raw = getRawDb()
  const audit = createAuditService(db)
  const auth = createAuthService(db, audit)
  const settings = createSettingsService(db, audit)
  const period = createPeriodService(db, audit)
  const backup = createBackupService({
    db,
    raw,
    getBackupFolder: () => paths.backupsDir,
    getSecondaryFolder: () => '',
    getUserData: () => paths.userData,
    getDbPath: () => paths.dbPath,
    getAppVersion: () => '1.0.0',
    getKeepDaily: () => 14,
    getKeepWeekly: () => 8,
    isEncryptionEnabled: () => false,
  })

  settings.setMany(
    {
      'business.name': 'Smoke Plant',
      'backup.folder': paths.backupsDir,
    },
    { allowOwnerOnly: true },
  )
  await auth.createUser({
    username: 'owner',
    displayName: 'Owner',
    password: 'secret12',
    role: 'owner',
  })
  const user = await auth.login('owner', 'secret12')
  assert(user.role === 'owner', 'login failed')
  console.log('✓ owner created and logged in')

  await expectReject(() => auth.login('owner', 'wrong'), 'UNAUTHORIZED')
  console.log('✓ wrong password rejected')

  const op = await auth.createUser({
    username: 'clerk',
    displayName: 'Clerk',
    password: 'secret12',
    role: 'operator',
  })
  assert(op.role === 'operator', 'operator not created')
  console.log('✓ operator user created')

  period.close('2026-06', user.id)
  await expectReject(() => period.guardPeriodOpen('2026-06-15'), 'PERIOD_LOCKED')
  console.log('✓ period lock throws PERIOD_LOCKED')

  const bak = backup.createBackup('manual')
  assert(fs.existsSync(bak.filePath), 'backup missing')
  assert(bak.checksum.length === 64, 'checksum missing')
  // Verify SQLite can open the VACUUM INTO file
  const probe = new Database(bak.filePath, { readonly: true })
  const tables = probe.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all()
  probe.close()
  assert(tables.length > 0, 'backup DB empty')
  console.log('✓ VACUUM INTO backup opens in SQLite')

  // Exit-style backup
  const exitBak = backup.createBackup('on_exit')
  assert(fs.existsSync(exitBak.filePath), 'on_exit backup missing')
  console.log('✓ on_exit backup created')

  // Pre-migration path: bump schema artificially lower and re-run
  raw.prepare(`UPDATE app_meta SET value = '0' WHERE key = 'schema_version'`).run()
  closeDatabase()
  outcome = runBootMigrations({
    paths,
    migrationsFolder,
    appVersion: '0.1.1',
  })
  assert(outcome.kind === 'migrated', `expected migrated, got ${JSON.stringify(outcome)}`)
  assert(fs.existsSync(outcome.backupPath), 'pre_migration backup missing')
  const upgradeRow = getRawDb()
    .prepare(`SELECT summary FROM audit_log WHERE action = 'app_upgrade' ORDER BY id DESC LIMIT 1`)
    .get() as { summary: string } | undefined
  assert(upgradeRow?.summary.includes('schema'), 'app_upgrade audit missing')
  console.log('✓ migrate older DB → pre_migration backup + app_upgrade audit')

  // Downgrade refusal
  getRawDb()
    .prepare(`UPDATE app_meta SET value = ? WHERE key = 'schema_version'`)
    .run(String(getBundledSchemaVersion(migrationsFolder) + 5))
  closeDatabase()
  outcome = runBootMigrations({
    paths,
    migrationsFolder,
    appVersion: '0.1.0',
  })
  assert(outcome.kind === 'refused_downgrade', 'expected refused_downgrade')
  console.log('✓ refuses to open DB newer than app')

  // Install-dir path guard
  let threw = false
  try {
    assertDbPathSafe(path.join(installDir, 'aqua-nuqi.db'), userData, installDir, resourcesPath)
  } catch (err) {
    threw = err instanceof AppError && err.code === 'FATAL_PATH'
  }
  assert(threw, 'install-dir path should be fatal')
  console.log('✓ install-directory DB path is fatal')

  // Restore path: copy backup over a new empty location
  const restoreRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aqua-restore-'))
  const restoreUserData = path.join(restoreRoot, 'userData')
  const restorePaths = resolveAppPaths(
    restoreUserData,
    path.join(restoreRoot, 'install'),
    path.join(restoreRoot, 'install', 'resources'),
  )
  ensureDirs(restorePaths)
  fs.copyFileSync(bak.filePath, restorePaths.dbPath)
  const restoreOutcome = runBootMigrations({
    paths: restorePaths,
    migrationsFolder,
    appVersion: '0.1.0',
  })
  assert(
    restoreOutcome.kind === 'up_to_date' || restoreOutcome.kind === 'migrated',
    'restore migrate failed',
  )
  const restoredAuth = createAuthService(getDb(), createAuditService(getDb()))
  assert(restoredAuth.hasAnyUser(), 'restored DB has no users')
  console.log('✓ restore-from-backup yields working DB with users')

  closeDatabase()
  fs.rmSync(root, { recursive: true, force: true })
  fs.rmSync(restoreRoot, { recursive: true, force: true })
  console.log('\nAll Phase 0 smoke checks passed.')
}

async function expectReject(fn: () => unknown, code: string) {
  try {
    await fn()
    throw new Error(`expected ${code}`)
  } catch (err) {
    if (!(err instanceof AppError) || err.code !== code) throw err
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
