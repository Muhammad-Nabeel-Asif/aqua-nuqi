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
import { createPdfPlatformFromElectron } from './ipc/handlers/pdf.handlers'
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
import { consumePendingRestoreAudit } from './lib/pending-restore'
import { createAdjustmentService } from './services/adjustment.service'
import { createAttendanceService } from './services/attendance.service'
import { createAuditService } from './services/audit.service'
import { createAuthService } from './services/auth.service'
import { createBackupService, getSessionEncryptionPassword } from './services/backup.service'
import { createBalanceService } from './services/balance.service'
import { createBillingService } from './services/billing.service'
import { createCustomerImportService } from './services/customer-import.service'
import { createCustomerService } from './services/customer.service'
import { createDeliveryService } from './services/delivery.service'
import { createEmployeeService } from './services/employee.service'
import { createExpenseService } from './services/expense.service'
import { createIntegrityService } from './services/integrity.service'
import { createLedgerService } from './services/ledger.service'
import { createMasterDataService } from './services/master-data.service'
import { createPaymentService } from './services/payment.service'
import { createPayrollService } from './services/payroll.service'
import { createPdfService } from './services/pdf.service'
import { createPeriodService } from './services/period.service'
import { createRateService } from './services/rate.service'
import { createReceivablesService } from './services/receivables.service'
import { createReportService } from './services/report.service'
import { createSettingsService } from './services/settings.service'
import { createStockService } from './services/stock.service'
import { createTripService } from './services/trip.service'
import { createVehicleService } from './services/vehicle.service'
import { destroyPrintPool, printTemplate, renderTemplateToPdf } from './windows/print-window'

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
      getSecondaryFolder: () => String(settings.get('backup.secondaryFolder') || ''),
      getUserData: () => paths.userData,
      getDbPath: () => paths.dbPath,
      getAppVersion: () => appVersion,
      getKeepDaily: () => Number(settings.get('backup.keepDaily') || 14),
      getKeepWeekly: () => Number(settings.get('backup.keepWeekly') || 8),
      isEncryptionEnabled: () => Boolean(settings.get('backup.encryptionEnabled')),
      getEncryptionPassword: () => getSessionEncryptionPassword(),
    })
    const masterData = createMasterDataService(db, audit)
    const rates = createRateService(db, audit, period)
    const balances = createBalanceService(db, raw)
    const integrity = createIntegrityService({
      db,
      raw,
      balances,
      getDbPath: () => paths.dbPath,
      getUserData: () => paths.userData,
    })
    const ledger = createLedgerService(db, balances)
    const expenses = createExpenseService(db, raw, audit, period)
    const stock = createStockService(db, raw, audit, period, rates, settings, expenses, balances)
    const customers = createCustomerService(db, audit, period, rates, balances, ledger, stock)
    const customerImport = createCustomerImportService(db, customers, masterData)
    const vehicles = createVehicleService(db, audit)
    const trips = createTripService(db, audit, period, rates, stock)
    const deliveries = createDeliveryService(
      db,
      audit,
      period,
      rates,
      balances,
      settings,
      stock,
      trips,
    )
    const adjustments = createAdjustmentService(db, audit, period, balances, ledger)
    const billing = createBillingService(db, audit, period, settings, balances, ledger)
    const payments = createPaymentService(db, audit, period, balances, ledger, billing)
    const receivables = createReceivablesService(db)
    const employees = createEmployeeService(db, audit, period)
    const attendance = createAttendanceService(db, audit, period, settings)
    const payroll = createPayrollService(db, audit, period, employees, attendance, expenses, trips)
    const reports = createReportService(db, raw, {
      expenses,
      receivables,
      stock,
      trips,
    })
    const pdf = createPdfService(
      db,
      audit,
      settings,
      billing,
      payments,
      ledger,
      customers,
      deliveries,
      receivables,
      {
        renderPdf: renderTemplateToPdf,
        print: printTemplate,
      },
      createPdfPlatformFromElectron(),
      payroll,
      employees,
    )

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
      integrity,
      masterData,
      rates,
      balances,
      customers,
      customerImport,
      deliveries,
      ledger,
      adjustments,
      billing,
      payments,
      receivables,
      expenses,
      stock,
      vehicles,
      trips,
      employees,
      attendance,
      payroll,
      reports,
      pdf,
      appVersion,
      schemaVersion: schemaVersion || getSchemaVersion(),
      setupRequired,
      bootFatal: null,
    })
    setRouterAuth(auth)

    // Crash between restore replace and audit.record leaves this file behind.
    consumePendingRestoreAudit(paths.userData, audit)

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
    destroyPrintPool()
    closeDatabase()
  }
}

void AppError
