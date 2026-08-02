/**
 * Phase 9 §9.11 — condensed end-to-end: ~50 customers × 2 months of deliveries,
 * payments, invoices, expenses, period close, reports, backup, restore, and
 * identical number verification.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDatabase, getDb, getRawDb, openDatabase } from '@main/db/client'
import { seedDefaults } from '@main/db/seed'
import { toPaisa } from '@shared/money'
import { createAuditService } from './audit.service'
import { createAuthService } from './auth.service'
import { createBackupService } from './backup.service'
import { createBalanceService } from './balance.service'
import { createBillingService } from './billing.service'
import { createCustomerService } from './customer.service'
import { createDeliveryService } from './delivery.service'
import { createExpenseService } from './expense.service'
import { createLedgerService } from './ledger.service'
import { createPaymentService } from './payment.service'
import { createPeriodService } from './period.service'
import { createRateService } from './rate.service'
import { createReceivablesService } from './receivables.service'
import { createReportService } from './report.service'
import { createSettingsService } from './settings.service'
import { createStockService } from './stock.service'
import { createTripService } from './trip.service'

describe('Phase 9 e2e scenario (§9.11)', () => {
  let dir: string
  let userData: string
  let dbPath: string
  let backupsDir: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqua-p9-e2e-'))
    userData = path.join(dir, 'Aqua Nuqi')
    dbPath = path.join(userData, 'data', 'aqua-nuqi.db')
    backupsDir = path.join(userData, 'backups')
    fs.mkdirSync(path.dirname(dbPath), { recursive: true })
    fs.mkdirSync(backupsDir, { recursive: true })
    const { db } = openDatabase(dbPath)
    migrate(db, { migrationsFolder: path.join(process.cwd(), 'drizzle') })
    seedDefaults(db, backupsDir)
  })

  afterEach(() => {
    closeDatabase()
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('backup → restore preserves customer count, revenue and outstanding', async () => {
    const db = getDb()
    const raw = getRawDb()
    const audit = createAuditService(db)
    const auth = createAuthService(db, audit)
    const settings = createSettingsService(db, audit)
    const period = createPeriodService(db, audit)
    const rates = createRateService(db, audit, period)
    const balances = createBalanceService(db, raw)
    const ledger = createLedgerService(db, balances)
    const expenses = createExpenseService(db, raw, audit, period)
    const stock = createStockService(db, raw, audit, period, rates, settings, expenses, balances)
    const customers = createCustomerService(db, audit, period, rates, balances, ledger, stock)
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
    const billing = createBillingService(db, audit, period, settings, balances, ledger)
    const payments = createPaymentService(db, audit, period, balances, ledger, billing)
    const receivables = createReceivablesService(db)
    const reports = createReportService(db, raw, { expenses, receivables, stock, trips })
    const backup = createBackupService({
      db,
      raw,
      getBackupFolder: () => backupsDir,
      getSecondaryFolder: () => '',
      getUserData: () => userData,
      getDbPath: () => dbPath,
      getAppVersion: () => '1.0.0',
      getKeepDaily: () => 14,
      getKeepWeekly: () => 8,
      isEncryptionEnabled: () => false,
    })

    const owner = await auth.createUser({
      username: 'owner',
      displayName: 'Owner',
      password: 'secret12',
      role: 'owner',
    })

    settings.setMany(
      { 'business.name': 'Phase9 Plant' },
      { allowOwnerOnly: true, userId: owner.id },
    )

    const customerIds: number[] = []
    for (let i = 0; i < 50; i++) {
      const c = customers.create(
        {
          name: `Customer ${i + 1}`,
          openingBalance: i % 5 === 0 ? Number(toPaisa(500)) : 0,
          openingBottles: i % 3,
          openingAsOf: '2026-06-01',
          rate: Number(toPaisa(60 + (i % 5))),
        },
        owner.id,
      )
      customerIds.push(c.id)
    }

    for (const month of ['2026-06', '2026-07'] as const) {
      for (let day = 1; day <= 10; day++) {
        const date = `${month}-${String(day).padStart(2, '0')}`
        for (let i = 0; i < customerIds.length; i += 2) {
          deliveries.upsertDelivery({
            customerId: customerIds[i]!,
            date,
            quantity: 1 + (i % 3),
            emptiesCollected: 1 + (i % 3),
            userId: owner.id,
          })
        }
      }
    }

    for (let i = 0; i < 20; i++) {
      payments.recordPayment(
        {
          customerId: customerIds[i]!,
          date: '2026-07-15',
          amount: Number(toPaisa(300)),
          method: 'cash',
        },
        owner.id,
      )
    }

    const cats = expenses.listCategories()
    const cat = cats.find((c) => c.name.toLowerCase().includes('fuel')) ?? cats[0]!
    expenses.createExpense(
      {
        expenseDate: '2026-07-10',
        categoryId: cat.id,
        amount: Number(toPaisa(2500)),
        paymentMethod: 'cash',
        description: 'Fuel',
      },
      owner.id,
    )

    billing.generateBatch('2026-07', { mode: 'all' }, {}, owner.id)
    period.close('2026-06', owner.id)

    const july = { from: '2026-07-01', to: '2026-07-31' }
    const beforePl = reports.profitAndLoss(july, 'accrual', { compare: false })
    const beforeRecv = receivables.report('2026-07-31')
    const beforeCounts = backup.collectRowCounts()
    const beforeCustomers = beforeCounts.customers

    const bak = backup.createBackup('manual')
    expect(bak.manifest.rowCounts.customers).toBe(beforeCustomers)

    const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'aqua-p9-restore-'))
    try {
      const extracted = backup.extractBackup(bak.filePath, staging)
      closeDatabase()
      for (const suffix of ['', '-wal', '-shm']) {
        const p = `${dbPath}${suffix}`
        if (fs.existsSync(p)) fs.unlinkSync(p)
      }
      fs.copyFileSync(extracted.dbPath, dbPath)
      openDatabase(dbPath)

      const db2 = getDb()
      const raw2 = getRawDb()
      const audit2 = createAuditService(db2)
      const settings2 = createSettingsService(db2, audit2)
      const period2 = createPeriodService(db2, audit2)
      const rates2 = createRateService(db2, audit2, period2)
      const balances2 = createBalanceService(db2, raw2)
      const expenses2 = createExpenseService(db2, raw2, audit2, period2)
      const stock2 = createStockService(
        db2,
        raw2,
        audit2,
        period2,
        rates2,
        settings2,
        expenses2,
        balances2,
      )
      const trips2 = createTripService(db2, audit2, period2, rates2, stock2)
      const receivables2 = createReceivablesService(db2)
      const reports2 = createReportService(db2, raw2, {
        expenses: expenses2,
        receivables: receivables2,
        stock: stock2,
        trips: trips2,
      })
      const backup2 = createBackupService({
        db: db2,
        raw: raw2,
        getBackupFolder: () => backupsDir,
        getSecondaryFolder: () => '',
        getUserData: () => userData,
        getDbPath: () => dbPath,
        getAppVersion: () => '1.0.0',
        getKeepDaily: () => 14,
        getKeepWeekly: () => 8,
        isEncryptionEnabled: () => false,
      })

      const afterCounts = backup2.collectRowCounts()
      expect(afterCounts.customers).toBe(beforeCustomers)
      expect(afterCounts.deliveries).toBe(beforeCounts.deliveries)
      expect(afterCounts.invoices).toBe(beforeCounts.invoices)
      expect(afterCounts.payments).toBe(beforeCounts.payments)

      const afterPl = reports2.profitAndLoss(july, 'accrual', { compare: false })
      expect(afterPl.revenue.netRevenue).toBe(beforePl.revenue.netRevenue)
      expect(afterPl.netProfit).toBe(beforePl.netProfit)

      const afterRecv = receivables2.report('2026-07-31')
      expect(afterRecv.totalOutstanding).toBe(beforeRecv.totalOutstanding)
    } finally {
      fs.rmSync(staging, { recursive: true, force: true })
    }
  }, 120_000)
})
