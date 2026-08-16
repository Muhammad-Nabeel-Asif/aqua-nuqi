import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import {
  closeDatabase,
  getDb,
  getRawDb,
  openDatabase,
  type AppDatabase,
  type RawDatabase,
} from '@main/db/client'
import { seedDefaults } from '@main/db/seed'
import { createAdjustmentService } from '@main/services/adjustment.service'
import { createAttendanceService } from '@main/services/attendance.service'
import { createAuditService } from '@main/services/audit.service'
import { createAuthService } from '@main/services/auth.service'
import { createBackupService } from '@main/services/backup.service'
import { createBalanceService } from '@main/services/balance.service'
import { createBillingService } from '@main/services/billing.service'
import { createCustomerImportService } from '@main/services/customer-import.service'
import { createCustomerService } from '@main/services/customer.service'
import { createDeliveryService } from '@main/services/delivery.service'
import { createEmployeeService } from '@main/services/employee.service'
import { createExpenseService } from '@main/services/expense.service'
import { createLedgerService } from '@main/services/ledger.service'
import { createMasterDataService } from '@main/services/master-data.service'
import { createPaymentService } from '@main/services/payment.service'
import { createPayrollService } from '@main/services/payroll.service'
import { createPeriodService } from '@main/services/period.service'
import { createRateService } from '@main/services/rate.service'
import { createReceivablesService } from '@main/services/receivables.service'
import { createReportService } from '@main/services/report.service'
import { createSettingsService } from '@main/services/settings.service'
import { createStockService } from '@main/services/stock.service'
import { createTripService } from '@main/services/trip.service'
import { createVehicleService } from '@main/services/vehicle.service'
import type { UserDto } from '@shared/contracts'

export type TestDb = {
  dir: string
  dbPath: string
  backupsDir: string
  db: AppDatabase
  raw: RawDatabase
  cleanup: () => void
}

export type TestServices = {
  audit: ReturnType<typeof createAuditService>
  auth: ReturnType<typeof createAuthService>
  settings: ReturnType<typeof createSettingsService>
  period: ReturnType<typeof createPeriodService>
  backup: ReturnType<typeof createBackupService>
  masterData: ReturnType<typeof createMasterDataService>
  rates: ReturnType<typeof createRateService>
  balances: ReturnType<typeof createBalanceService>
  ledger: ReturnType<typeof createLedgerService>
  expenses: ReturnType<typeof createExpenseService>
  stock: ReturnType<typeof createStockService>
  customers: ReturnType<typeof createCustomerService>
  customerImport: ReturnType<typeof createCustomerImportService>
  vehicles: ReturnType<typeof createVehicleService>
  trips: ReturnType<typeof createTripService>
  deliveries: ReturnType<typeof createDeliveryService>
  adjustments: ReturnType<typeof createAdjustmentService>
  billing: ReturnType<typeof createBillingService>
  payments: ReturnType<typeof createPaymentService>
  receivables: ReturnType<typeof createReceivablesService>
  employees: ReturnType<typeof createEmployeeService>
  attendance: ReturnType<typeof createAttendanceService>
  payroll: ReturnType<typeof createPayrollService>
  reports: ReturnType<typeof createReportService>
}

export type TestApp = TestDb & {
  services: TestServices
  owner: UserDto
}

/** Isolated temp SQLite + drizzle migrate + seedDefaults. Unique os.tmpdir() tree. */
export function openTestDb(prefix = 'aqua-test-'): TestDb {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  const dbPath = path.join(dir, 'test.db')
  const backupsDir = path.join(dir, 'backups')
  fs.mkdirSync(backupsDir, { recursive: true })
  const { db, raw } = openDatabase(dbPath)
  migrate(db, { migrationsFolder: path.join(process.cwd(), 'drizzle') })
  seedDefaults(db, backupsDir)
  return {
    dir,
    dbPath,
    backupsDir,
    db,
    raw,
    cleanup: () => {
      closeDatabase()
      fs.rmSync(dir, { recursive: true, force: true })
    },
  }
}

export function createTestServices(
  db: AppDatabase,
  raw: RawDatabase,
  backupsDir: string,
  dbPath: string,
): TestServices {
  const audit = createAuditService(db)
  const auth = createAuthService(db, audit)
  const settings = createSettingsService(db, audit)
  const period = createPeriodService(db, audit)
  const backup = createBackupService({
    db,
    raw,
    getBackupFolder: () => {
      const configured = settings.get('backup.folder')
      return (typeof configured === 'string' && configured) || backupsDir
    },
    getSecondaryFolder: () => String(settings.get('backup.secondaryFolder') || ''),
    getUserData: () => path.dirname(dbPath),
    getDbPath: () => dbPath,
    getAppVersion: () => '1.1.0',
    getKeepDaily: () => Number(settings.get('backup.keepDaily') || 14),
    getKeepWeekly: () => Number(settings.get('backup.keepWeekly') || 8),
    isEncryptionEnabled: () => Boolean(settings.get('backup.encryptionEnabled')),
  })
  const masterData = createMasterDataService(db, audit)
  const rates = createRateService(db, audit, period)
  const balances = createBalanceService(db, raw)
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
  const reports = createReportService(db, raw, { expenses, receivables, stock, trips })
  return {
    audit,
    auth,
    settings,
    period,
    backup,
    masterData,
    rates,
    balances,
    ledger,
    expenses,
    stock,
    customers,
    customerImport,
    vehicles,
    trips,
    deliveries,
    adjustments,
    billing,
    payments,
    receivables,
    employees,
    attendance,
    payroll,
    reports,
  }
}

export async function createOwner(
  auth: ReturnType<typeof createAuthService>,
  input?: { username?: string; password?: string; displayName?: string },
): Promise<UserDto> {
  return auth.createUser({
    username: input?.username ?? 'owner',
    displayName: input?.displayName ?? 'Owner',
    password: input?.password ?? 'secret12',
    role: 'owner',
  })
}

/** Full service graph on a temp DB, plus an owner user. */
export async function openTestApp(prefix = 'aqua-app-'): Promise<TestApp> {
  const opened = openTestDb(prefix)
  const services = createTestServices(opened.db, opened.raw, opened.backupsDir, opened.dbPath)
  const owner = await createOwner(services.auth)
  return { ...opened, services, owner }
}

export function closeAndRm(handle: { cleanup: () => void }): void {
  handle.cleanup()
}

/** Re-read the process-wide singleton after tests that close/reopen the DB. */
export function currentDb(): { db: AppDatabase; raw: RawDatabase } {
  return { db: getDb(), raw: getRawDb() }
}
