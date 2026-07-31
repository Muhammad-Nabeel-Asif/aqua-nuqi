import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import { AppError, isAppError } from '@shared/errors'
import { setAppContext, tryGetAppContext, type BootFatal } from './app-context'
import { closeDatabase, getDb, getRawDb, openDatabase } from './db/client'
import {
  getBundledSchemaVersion,
  getSchemaVersion,
  resolveMigrationsFolder,
  runBootMigrations,
} from './db/migrate'
import { setRouterAuth } from './ipc/router'
import { configureLogger, log } from './lib/logger'
import {
  assertAppIdentity,
  assertUserDataPath,
  ensureDirs,
  readPathConfig,
  resolveAppPaths,
  type AppPaths,
} from './lib/paths'
import { createAuditService } from './services/audit.service'
import { createAuthService } from './services/auth.service'
import { createBackupService } from './services/backup.service'
import { createPeriodService } from './services/period.service'
import { createSettingsService } from './services/settings.service'

function readAppVersion(): string {
  const candidates = [
    path.join(app.getAppPath(), 'package.json'),
    path.join(process.cwd(), 'package.json'),
    path.join(__dirname, '../../package.json'),
  ]
  for (const pkgPath of candidates) {
    try {
      if (!fs.existsSync(pkgPath)) continue
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { version?: string }
      if (pkg.version) return pkg.version
    } catch {
      // try next
    }
  }
  return app.getVersion()
}

export type BootstrapResult =
  | { ok: true; paths: AppPaths; setupRequired: boolean }
  | { ok: false; fatal: BootFatal; paths?: AppPaths }

export function bootstrapApp(): BootstrapResult {
  try {
    assertAppIdentity(app.getName(), undefined, app.getAppPath())
    const userData = app.getPath('userData')
    assertUserDataPath(userData)

    const installDir = path.dirname(app.getPath('exe'))
    const resourcesPath = process.resourcesPath
    const configPath = path.join(userData, 'aqua-nuqi.config.json')
    const pathConfig = readPathConfig(configPath)

    const paths = resolveAppPaths(userData, installDir, resourcesPath, pathConfig)
    ensureDirs(paths)
    configureLogger(paths.logsDir)

    const appVersion = readAppVersion()
    log.info('Bootstrapping Aqua Nuqi', {
      version: appVersion,
      userData,
      dbPath: paths.dbPath,
    })

    const migrationsFolder = resolveMigrationsFolder(app.getAppPath(), resourcesPath)
    const dbMissing = !fs.existsSync(paths.dbPath)

    const outcome = runBootMigrations({
      paths,
      migrationsFolder,
      appVersion,
    })

    if (outcome.kind === 'refused_downgrade') {
      return {
        ok: false,
        fatal: {
          type: 'app_older_than_data',
          schemaVersion: outcome.schemaVersion,
          bundledMax: outcome.bundledMax,
          appVersion,
        },
        paths,
      }
    }

    // Ensure DB is open (fresh/migrated/up_to_date leave it open; refused closed it)
    if (!fs.existsSync(paths.dbPath)) {
      openDatabase(paths.dbPath)
    }
    try {
      getDb()
    } catch {
      openDatabase(paths.dbPath)
    }

    const db = getDb()
    const raw = getRawDb()
    const audit = createAuditService(db)
    const auth = createAuthService(db, audit)
    const settings = createSettingsService(db, audit)
    const period = createPeriodService(db, audit)
    const backup = createBackupService({
      db,
      raw,
      getBackupFolder: () => {
        const configured = settings.get('backup.folder')
        return configured || paths.backupsDir
      },
    })

    const setupRequired = dbMissing || !auth.hasAnyUser()
    const schemaVersion =
      outcome.kind === 'migrated'
        ? outcome.to
        : outcome.kind === 'fresh' || outcome.kind === 'up_to_date'
          ? outcome.schemaVersion
          : getBundledSchemaVersion(migrationsFolder)

    setAppContext({
      paths,
      db,
      raw,
      auth,
      settings,
      audit,
      period,
      backup,
      appVersion,
      schemaVersion: schemaVersion || getSchemaVersion(),
      setupRequired,
      bootFatal: null,
    })
    setRouterAuth(auth)

    return { ok: true, paths, setupRequired }
  } catch (err) {
    if (isAppError(err) && err.code === 'FATAL_PATH') {
      return { ok: false, fatal: { type: 'fatal_path', message: err.message } }
    }
    if (isAppError(err) && err.code === 'MIGRATION_FAILED') {
      return {
        ok: false,
        fatal: {
          type: 'migration_failed',
          message: err.message,
          backupPath: (err.details as { backupPath?: string } | undefined)?.backupPath,
        },
      }
    }
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, fatal: { type: 'fatal_path', message } }
  }
}

export function shutdownApp(): void {
  try {
    const ctx = tryGetAppContext()
    if (ctx && ctx.settings.get('backup.onExit')) {
      try {
        ctx.backup.createBackup('on_exit')
      } catch (err) {
        log.error('Exit backup failed', err)
      }
    }
  } catch (err) {
    log.error('Shutdown error', err)
  } finally {
    closeDatabase()
  }
}

void AppError
