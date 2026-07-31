import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { eq } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDatabase, getDb, openDatabase, getRawDb } from '@main/db/client'
import { customerRates, products } from '@main/db/schema'
import { seedDefaults } from '@main/db/seed'
import { toPaisa } from '@shared/money'
import { createAuditService } from './audit.service'
import { createAuthService } from './auth.service'
import { createBalanceService } from './balance.service'
import { createCustomerService } from './customer.service'
import { createPeriodService } from './period.service'
import { createRateService } from './rate.service'

describe('rateService', () => {
  let dir: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqua-rate-'))
    const dbPath = path.join(dir, 'test.db')
    const { db } = openDatabase(dbPath)
    migrate(db, { migrationsFolder: path.join(process.cwd(), 'drizzle') })
    seedDefaults(db, path.join(dir, 'backups'))
  })

  afterEach(() => {
    closeDatabase()
    fs.rmSync(dir, { recursive: true, force: true })
  })

  async function setup() {
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
    const product = db.select().from(products).where(eq(products.isDefault, 1)).get()!
    return { db, rates, customers, owner, product, period }
  }

  it('getRateFor returns historical and new rates after dated change (criteria 3–4)', async () => {
    const { db, rates, customers, owner, product } = await setup()

    const customer = customers.create(
      {
        name: 'Test Customer',
        rate: Number(toPaisa(60)),
        productId: product.id,
        joinedOn: '2026-06-01',
      },
      owner.id,
    )

    rates.changeRate({
      customerId: customer.id,
      productId: product.id,
      rate: Number(toPaisa(70)),
      effectiveFrom: '2026-08-01',
      reason: 'Price rise',
      userId: owner.id,
    })

    expect(rates.getRateFor(customer.id, product.id, '2026-07-20')).toBe(6000)
    expect(rates.getRateFor(customer.id, product.id, '2026-08-05')).toBe(7000)

    const rows = db
      .select()
      .from(customerRates)
      .where(eq(customerRates.customerId, customer.id))
      .all()
      .sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? -1 : 1))

    expect(rows).toHaveLength(2)
    expect(rows[0]!.rate).toBe(6000)
    expect(rows[0]!.effectiveTo).toBe('2026-07-31')
    expect(rows[1]!.rate).toBe(7000)
    expect(rows[1]!.effectiveTo).toBeNull()
    // Never updated in place: first row still has original rate
    expect(rows[0]!.rate).toBe(6000)
  })

  it('bulk rate change is all-or-nothing', async () => {
    const { rates, customers, owner, product } = await setup()
    const ids: number[] = []
    for (let i = 0; i < 5; i++) {
      const c = customers.create(
        { name: `Bulk ${i}`, rate: Number(toPaisa(60)), productId: product.id },
        owner.id,
      )
      ids.push(c.id)
    }

    const result = rates.bulkChangeRate({
      customerIds: ids,
      productId: product.id,
      rate: Number(toPaisa(75)),
      effectiveFrom: '2026-09-01',
      reason: 'Bulk',
      userId: owner.id,
    })
    expect(result.created).toBe(5)

    // Force failure mid-bulk with a bad effective date vs existing open rate starting later
    // Create a customer with rate from 2026-10-01 then try bulk from 2026-09-15 including them —
    // instead: pass a non-existent customer id to force NOT_FOUND and rollback.
    const beforeCount = getDb().select().from(customerRates).all().length
    try {
      rates.bulkChangeRate({
        customerIds: [...ids, 999999],
        productId: product.id,
        rate: Number(toPaisa(80)),
        effectiveFrom: '2026-10-01',
        userId: owner.id,
      })
      expect.unreachable()
    } catch {
      // expected
    }
    expect(getDb().select().from(customerRates).all().length).toBe(beforeCount)
  })

  it('falls back to product default_rate when no customer rate', async () => {
    const { db, rates, customers, owner, product } = await setup()
    db.update(products)
      .set({ defaultRate: Number(toPaisa(55)) })
      .where(eq(products.id, product.id))
      .run()

    const customer = customers.create({ name: 'No Rate Yet' }, owner.id)
    expect(rates.getRateFor(customer.id, product.id, '2026-07-15')).toBe(5500)
  })
})
