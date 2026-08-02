import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { eq } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDatabase, getDb, getRawDb, openDatabase } from '@main/db/client'
import { customerBalances } from '@main/db/schema'
import { seedDefaults } from '@main/db/seed'
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
})
