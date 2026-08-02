import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { eq } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDatabase, getDb, getRawDb, openDatabase } from '@main/db/client'
import {
  customerBalances,
  invoices,
  ledgerEntries,
  products,
  stockMovements,
} from '@main/db/schema'
import { seedDefaults } from '@main/db/seed'
import { newUuid } from '@main/lib/ids'
import { nowIsoUtc } from '@shared/date'
import { toPaisa } from '@shared/money'
import { createAuditService } from './audit.service'
import { createAuthService } from './auth.service'
import { createBalanceService } from './balance.service'
import { createCustomerService } from './customer.service'
import { createIntegrityService } from './integrity.service'
import { createPeriodService } from './period.service'
import { createRateService } from './rate.service'

describe('integrityService', () => {
  let dir: string
  let userData: string
  let dbPath: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqua-integrity-'))
    userData = path.join(dir, 'Aqua Nuqi')
    dbPath = path.join(userData, 'data', 'aqua-nuqi.db')
    fs.mkdirSync(path.dirname(dbPath), { recursive: true })
    const { db } = openDatabase(dbPath)
    migrate(db, { migrationsFolder: path.join(process.cwd(), 'drizzle') })
    seedDefaults(db, path.join(userData, 'backups'))
  })

  afterEach(() => {
    closeDatabase()
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('detects a corrupted customer_balances row and Fix repairs it', async () => {
    const db = getDb()
    const raw = getRawDb()
    const audit = createAuditService(db)
    const auth = createAuthService(db, audit)
    const period = createPeriodService(db, audit)
    const rates = createRateService(db, audit, period)
    const balances = createBalanceService(db, raw)
    const customers = createCustomerService(db, audit, period, rates, balances)
    const integrity = createIntegrityService({
      db,
      raw,
      balances,
      getDbPath: () => dbPath,
      getUserData: () => userData,
    })

    const owner = await auth.createUser({
      username: 'owner',
      displayName: 'Owner',
      password: 'secret12',
      role: 'owner',
    })
    const c = customers.create(
      {
        name: 'Integrity Cust',
        openingBalance: Number(toPaisa(35)),
        openingBottles: 2,
        openingAsOf: '2026-07-01',
        rate: Number(toPaisa(60)),
      },
      owner.id,
    )

    db.update(customerBalances)
      .set({ balance: 999999, bottlesWithCustomer: 999 })
      .where(eq(customerBalances.customerId, c.id))
      .run()

    const report = integrity.runCheck()
    expect(report.issues.some((i) => i.category === 'balances' && i.fixable)).toBe(true)

    const fix = integrity.applyFix('recalculate_balances')
    expect(fix.fixed).toBeGreaterThan(0)

    const after = integrity.runCheck()
    expect(after.issues.filter((i) => i.category === 'balances')).toHaveLength(0)

    const summary = db
      .select()
      .from(customerBalances)
      .where(eq(customerBalances.customerId, c.id))
      .get()!
    expect(summary.balance).toBe(balances.computeLiveBalance(c.id))
    expect(summary.bottlesWithCustomer).toBe(balances.computeLiveBottles(c.id))
  })

  it('detects a missing customer_balances row and Fix recreates it', async () => {
    const db = getDb()
    const raw = getRawDb()
    const audit = createAuditService(db)
    const auth = createAuthService(db, audit)
    const period = createPeriodService(db, audit)
    const rates = createRateService(db, audit, period)
    const balances = createBalanceService(db, raw)
    const customers = createCustomerService(db, audit, period, rates, balances)
    const integrity = createIntegrityService({
      db,
      raw,
      balances,
      getDbPath: () => dbPath,
      getUserData: () => userData,
    })

    const owner = await auth.createUser({
      username: 'owner2',
      displayName: 'Owner',
      password: 'secret12',
      role: 'owner',
    })
    const c = customers.create(
      {
        name: 'Missing Balance Cust',
        openingBalance: Number(toPaisa(10)),
        openingBottles: 1,
        openingAsOf: '2026-07-01',
        rate: Number(toPaisa(60)),
      },
      owner.id,
    )

    db.delete(customerBalances).where(eq(customerBalances.customerId, c.id)).run()

    const report = integrity.runCheck()
    expect(report.issues.some((i) => i.id === `balance-missing-${c.id}` && i.fixable)).toBe(true)

    const fix = integrity.applyFix('recalculate_balances')
    expect(fix.fixed).toBeGreaterThan(0)

    const after = integrity.runCheck()
    expect(after.issues.filter((i) => i.category === 'balances')).toHaveLength(0)
    const summary = db
      .select()
      .from(customerBalances)
      .where(eq(customerBalances.customerId, c.id))
      .get()
    expect(summary).toBeTruthy()
    expect(summary!.balance).toBe(balances.computeLiveBalance(c.id))
  })

  it('marks stock-vs-bottles mismatch as not fixable via recalculate_balances', async () => {
    const db = getDb()
    const raw = getRawDb()
    const audit = createAuditService(db)
    const auth = createAuthService(db, audit)
    const period = createPeriodService(db, audit)
    const rates = createRateService(db, audit, period)
    const balances = createBalanceService(db, raw)
    const customers = createCustomerService(db, audit, period, rates, balances)
    const integrity = createIntegrityService({
      db,
      raw,
      balances,
      getDbPath: () => dbPath,
      getUserData: () => userData,
    })

    const owner = await auth.createUser({
      username: 'owner-stock',
      displayName: 'Owner',
      password: 'secret12',
      role: 'owner',
    })
    customers.create(
      {
        name: 'Stock Cust',
        openingBalance: 0,
        openingBottles: 1,
        openingAsOf: '2026-07-01',
        rate: Number(toPaisa(60)),
      },
      owner.id,
    )

    const product = db.select().from(products).where(eq(products.isDefault, 1)).get()!
    // Phantom stock movement to customer — invents bottle liability stock side only
    db.insert(stockMovements)
      .values({
        uuid: newUuid(),
        movementDate: '2026-07-02',
        productId: product.id,
        bottleState: 'filled',
        quantity: 99,
        fromLocation: 'plant',
        toLocation: 'customer',
        reason: 'adjustment',
        createdAt: nowIsoUtc(),
        createdBy: owner.id,
      })
      .run()

    const report = integrity.runCheck()
    const stockIssue = report.issues.find((i) => i.id === 'stock-vs-balances')
    expect(stockIssue).toBeTruthy()
    expect(stockIssue!.fixable).toBe(false)
    expect(stockIssue!.fixAction).toBe('none')
  })

  it('detects ledger balance_after chain breaks and invoices with no lines', async () => {
    const db = getDb()
    const raw = getRawDb()
    const audit = createAuditService(db)
    const auth = createAuthService(db, audit)
    const period = createPeriodService(db, audit)
    const rates = createRateService(db, audit, period)
    const balances = createBalanceService(db, raw)
    const customers = createCustomerService(db, audit, period, rates, balances)
    const integrity = createIntegrityService({
      db,
      raw,
      balances,
      getDbPath: () => dbPath,
      getUserData: () => userData,
    })

    const owner = await auth.createUser({
      username: 'owner-ledger',
      displayName: 'Owner',
      password: 'secret12',
      role: 'owner',
    })
    const c = customers.create(
      {
        name: 'Ledger Cust',
        openingBalance: Number(toPaisa(100)),
        openingAsOf: '2026-07-01',
        rate: Number(toPaisa(60)),
      },
      owner.id,
    )

    const entry = db.select().from(ledgerEntries).where(eq(ledgerEntries.customerId, c.id)).all()[0]
    expect(entry).toBeTruthy()
    db.update(ledgerEntries)
      .set({ balanceAfter: entry.balanceAfter + 1 })
      .where(eq(ledgerEntries.id, entry.id))
      .run()

    db.insert(invoices)
      .values({
        uuid: newUuid(),
        invoiceNo: 'INV-ORPHAN-1',
        customerId: c.id,
        period: '2026-07',
        periodStart: '2026-07-01',
        periodEnd: '2026-07-31',
        issueDate: '2026-07-31',
        status: 'issued',
        createdAt: nowIsoUtc(),
        updatedAt: nowIsoUtc(),
        createdBy: owner.id,
      })
      .run()

    const report = integrity.runCheck()
    expect(
      report.issues.some((i) => i.category === 'ledger' && i.id.startsWith('ledger-chain-')),
    ).toBe(true)
    expect(
      report.issues.some((i) => i.category === 'invoices' && i.message.includes('no lines')),
    ).toBe(true)
  })
})
