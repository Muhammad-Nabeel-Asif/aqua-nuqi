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
import { createPeriodService } from './period.service'
import { createRateService } from './rate.service'

describe('balanceService', () => {
  let dir: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqua-bal-'))
    const dbPath = path.join(dir, 'test.db')
    const { db } = openDatabase(dbPath)
    migrate(db, { migrationsFolder: path.join(process.cwd(), 'drizzle') })
    seedDefaults(db, path.join(dir, 'backups'))
  })

  afterEach(() => {
    closeDatabase()
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('summary equals live aggregate after random openings', async () => {
    const db = getDb()
    const raw = getRawDb()
    const audit = createAuditService(db)
    const auth = createAuthService(db, audit)
    const period = createPeriodService(db, audit)
    const rates = createRateService(db, audit, period)
    const balances = createBalanceService(db, raw)
    const customers = createCustomerService(db, audit, period, rates, balances)

    const owner = await auth.createUser({
      username: 'owner',
      displayName: 'Owner',
      password: 'secret12',
      role: 'owner',
    })

    const amounts = [0, 3500, 1200, 0, 500, 999, 0, 2500]
    const bottles = [0, 4, 2, 0, 6, 1, 3, 8]
    const ids: number[] = []

    for (let i = 0; i < amounts.length; i++) {
      const openingBalance = Number(toPaisa(amounts[i]!))
      const openingBottles = bottles[i]!
      const c = customers.create(
        {
          name: `Cust ${i}`,
          openingBalance,
          openingBottles,
          openingAsOf: openingBalance !== 0 || openingBottles !== 0 ? '2026-07-01' : null,
          rate: Number(toPaisa(60)),
        },
        owner.id,
      )
      ids.push(c.id)
    }

    // Corrupt summaries then recalculate
    for (const id of ids) {
      db.update(customerBalances)
        .set({ balance: 1, bottlesWithCustomer: 99 })
        .where(eq(customerBalances.customerId, id))
        .run()
    }

    balances.recalculate()

    for (const id of ids) {
      const summary = db
        .select()
        .from(customerBalances)
        .where(eq(customerBalances.customerId, id))
        .get()!
      const liveBal = balances.computeLiveBalance(id)
      const liveBottles = balances.computeLiveBottles(id)
      expect(summary.balance).toBe(liveBal)
      expect(summary.bottlesWithCustomer).toBe(liveBottles)
    }
  })

  it('opening balance Rs 3500 and 4 bottles appear on customer and ledger', async () => {
    const db = getDb()
    const raw = getRawDb()
    const audit = createAuditService(db)
    const auth = createAuthService(db, audit)
    const period = createPeriodService(db, audit)
    const rates = createRateService(db, audit, period)
    const balances = createBalanceService(db, raw)
    const customers = createCustomerService(db, audit, period, rates, balances)
    const owner = await auth.createUser({
      username: 'owner2',
      displayName: 'Owner',
      password: 'secret12',
      role: 'owner',
    })

    const c = customers.create(
      {
        name: 'Opening Test',
        openingBalance: Number(toPaisa(3500)),
        openingBottles: 4,
        openingAsOf: '2026-07-01',
        rate: Number(toPaisa(60)),
      },
      owner.id,
    )

    expect(c.balance).toBe(350000)
    expect(c.bottlesWithCustomer).toBe(4)
    expect(c.openingBalance).toBe(350000)

    const { ledgerEntries } = await import('@main/db/schema')
    const entry = db.select().from(ledgerEntries).where(eq(ledgerEntries.customerId, c.id)).get()
    expect(entry?.entryType).toBe('opening_balance')
    expect(entry?.debit).toBe(350000)
    expect(entry?.balanceAfter).toBe(350000)
  })
})
