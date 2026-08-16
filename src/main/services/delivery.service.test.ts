import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { and, eq } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDatabase, getDb, getRawDb, openDatabase } from '@main/db/client'
import { auditLog, customerBalances, customers, deliveries, products } from '@main/db/schema'
import { seedDefaults } from '@main/db/seed'
import { todayBusinessDate } from '@shared/date'
import { matrixCardQtyUpsert } from '@shared/delivery-entry'
import { toPaisa } from '@shared/money'
import { createAuditService } from './audit.service'
import { createAuthService } from './auth.service'
import { createBalanceService } from './balance.service'
import { createCustomerService } from './customer.service'
import { createDeliveryService } from './delivery.service'
import { createPeriodService } from './period.service'
import { createRateService } from './rate.service'
import { createSettingsService } from './settings.service'

describe('deliveryService', () => {
  let dir: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqua-del-'))
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
    const settings = createSettingsService(db, audit)
    const period = createPeriodService(db, audit)
    const rates = createRateService(db, audit, period)
    const balances = createBalanceService(db, raw)
    const customersSvc = createCustomerService(db, audit, period, rates, balances)
    const deliveriesSvc = createDeliveryService(db, audit, period, rates, balances, settings)
    const owner = await auth.createUser({
      username: 'owner',
      displayName: 'Owner',
      password: 'secret12',
      role: 'owner',
    })
    const product = db.select().from(products).where(eq(products.isDefault, 1)).get()!
    db.update(products)
      .set({ defaultRate: Number(toPaisa(60)), defaultDeposit: Number(toPaisa(500)) })
      .where(eq(products.id, product.id))
      .run()

    const customer = customersSvc.create(
      {
        name: 'Delivery Test',
        rate: Number(toPaisa(60)),
        productId: product.id,
        openingBottles: 2,
        openingAsOf: '2026-06-01',
        joinedOn: '2026-06-01',
      },
      owner.id,
    )
    return {
      db,
      raw,
      rates,
      customers: customersSvc,
      deliveriesSvc,
      owner,
      product,
      period,
      balances,
      customer,
      settings,
    }
  }

  it('upserts qty with default empties and amount from rate (criteria 1)', async () => {
    const { deliveriesSvc, customer, owner } = await setup()
    const d = deliveriesSvc.upsertDelivery({
      customerId: customer.id,
      date: '2026-07-10',
      quantity: 3,
      userId: owner.id,
    })
    expect(d.quantity).toBe(3)
    expect(d.emptiesCollected).toBe(3)
    expect(d.rate).toBe(6000)
    expect(d.amount).toBe(18000)
    expect(d.status).toBe('recorded')
  })

  it('second entry for same slot updates the same row (criteria 2)', async () => {
    const { db, deliveriesSvc, customer, owner } = await setup()
    const a = deliveriesSvc.upsertDelivery({
      customerId: customer.id,
      date: '2026-07-10',
      quantity: 2,
      userId: owner.id,
    })
    const b = deliveriesSvc.upsertDelivery({
      customerId: customer.id,
      date: '2026-07-10',
      quantity: 5,
      userId: owner.id,
    })
    expect(b.id).toBe(a.id)
    const rows = db
      .select()
      .from(deliveries)
      .where(eq(deliveries.customerId, customer.id))
      .all()
      .filter((r) => r.status === 'recorded')
    expect(rows).toHaveLength(1)
    expect(rows[0]!.quantity).toBe(5)
  })

  it('clearing qty voids the row without deleting and writes audit (criteria 3)', async () => {
    const { db, deliveriesSvc, customer, owner } = await setup()
    const a = deliveriesSvc.upsertDelivery({
      customerId: customer.id,
      date: '2026-07-10',
      quantity: 2,
      userId: owner.id,
    })
    const voided = deliveriesSvc.upsertDelivery({
      customerId: customer.id,
      date: '2026-07-10',
      quantity: 0,
      emptiesCollected: 0,
      userId: owner.id,
    })
    expect(voided.status).toBe('void')
    const row = db.select().from(deliveries).where(eq(deliveries.id, a.id)).get()!
    expect(row.status).toBe('void')
    const audits = db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entityTable, 'deliveries'), eq(auditLog.entityId, a.id)))
      .all()
    expect(audits.some((x) => x.action === 'void')).toBe(true)
  })

  it('empties independent including qty 0 empties 5 (criteria 4)', async () => {
    const { deliveriesSvc, customer, owner, balances } = await setup()
    const d = deliveriesSvc.upsertDelivery({
      customerId: customer.id,
      date: '2026-07-10',
      quantity: 0,
      emptiesCollected: 5,
      userId: owner.id,
    })
    expect(d.status).toBe('recorded')
    expect(d.quantity).toBe(0)
    expect(d.emptiesCollected).toBe(5)
    // opening 2 + 0 - 5 = -3
    expect(balances.computeLiveBottles(customer.id)).toBe(-3)
  })

  it('bottles_with_customer matches live aggregate (criteria 5)', async () => {
    const { deliveriesSvc, customer, owner, balances, db } = await setup()
    deliveriesSvc.upsertDelivery({
      customerId: customer.id,
      date: '2026-07-05',
      quantity: 4,
      emptiesCollected: 2,
      userId: owner.id,
    })
    deliveriesSvc.upsertDelivery({
      customerId: customer.id,
      date: '2026-07-08',
      quantity: 1,
      emptiesCollected: 1,
      userId: owner.id,
    })
    deliveriesSvc.recordBottleLoss({
      customerId: customer.id,
      date: '2026-07-09',
      kind: 'lost_bottle',
      quantity: 1,
      userId: owner.id,
    })
    const live = balances.computeLiveBottles(customer.id)
    // 2 + 4 + 1 - 2 - 1 - 1 = 3
    expect(live).toBe(3)
    const summary = db
      .select()
      .from(customerBalances)
      .where(eq(customerBalances.customerId, customer.id))
      .get()!
    expect(summary.bottlesWithCustomer).toBe(live)
    balances.recalculate(customer.id)
    const again = db
      .select()
      .from(customerBalances)
      .where(eq(customerBalances.customerId, customer.id))
      .get()!
    expect(again.bottlesWithCustomer).toBe(live)
  })

  it('rate change on 1 Aug does not alter July delivery amounts (criteria 6)', async () => {
    const { deliveriesSvc, customers, rates, customer, owner, product, db } = await setup()
    void customers
    const july = deliveriesSvc.upsertDelivery({
      customerId: customer.id,
      date: '2026-07-20',
      quantity: 2,
      userId: owner.id,
    })
    expect(july.amount).toBe(12000)
    rates.changeRate({
      customerId: customer.id,
      productId: product.id,
      rate: Number(toPaisa(80)),
      effectiveFrom: '2026-08-01',
      reason: 'Aug rise',
      userId: owner.id,
    })
    const still = db.select().from(deliveries).where(eq(deliveries.id, july.id)).get()!
    expect(still.rate).toBe(6000)
    expect(still.amount).toBe(12000)
    const aug = deliveriesSvc.upsertDelivery({
      customerId: customer.id,
      date: '2026-08-02',
      quantity: 2,
      userId: owner.id,
    })
    expect(aug.rate).toBe(8000)
    expect(aug.amount).toBe(16000)
  })

  it('closed period rejects writes with PERIOD_LOCKED (criteria 7)', async () => {
    const { deliveriesSvc, customer, owner, period } = await setup()
    period.close('2026-07', owner.id)
    expect(() =>
      deliveriesSvc.upsertDelivery({
        customerId: customer.id,
        date: '2026-07-15',
        quantity: 1,
        userId: owner.id,
      }),
    ).toThrowError(/PERIOD_LOCKED|closed|locked/i)
  })

  it('invoice_id blocks edits with DELIVERY_INVOICED', async () => {
    const { db, deliveriesSvc, customer, owner } = await setup()
    const d = deliveriesSvc.upsertDelivery({
      customerId: customer.id,
      date: '2026-07-10',
      quantity: 2,
      userId: owner.id,
    })
    const { invoices } = await import('@main/db/schema')
    const inv = db
      .insert(invoices)
      .values({
        uuid: '00000000-0000-4000-8000-000000000099',
        invoiceNo: 'INV-TEST-LOCK',
        customerId: customer.id,
        period: '2026-07',
        periodStart: '2026-07-01',
        periodEnd: '2026-07-31',
        issueDate: '2026-08-01',
        openingBalance: 0,
        deliveriesQty: 2,
        deliveriesTotal: 0,
        chargesTotal: 0,
        discountTotal: 0,
        taxTotal: 0,
        invoiceTotal: 0,
        totalPayable: 0,
        paidTotal: 0,
        closingBalance: 0,
        bottlesWithCustomerAtIssue: 0,
        status: 'issued',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: owner.id,
      })
      .returning()
      .get()!
    db.update(deliveries).set({ invoiceId: inv.id }).where(eq(deliveries.id, d.id)).run()
    expect(() =>
      deliveriesSvc.upsertDelivery({
        customerId: customer.id,
        date: '2026-07-10',
        quantity: 3,
        userId: owner.id,
      }),
    ).toThrowError(/invoice/i)
  })

  it('monthly_package customers store amount 0 but snapshot rate', async () => {
    const { deliveriesSvc, customers, owner, product } = await setup()
    const pkg = customers.create(
      {
        name: 'Package Cust',
        billingMode: 'monthly_package',
        packageAmount: Number(toPaisa(2500)),
        packageIncludedQty: 40,
        packageExcessRate: Number(toPaisa(70)),
        rate: Number(toPaisa(70)),
        productId: product.id,
      },
      owner.id,
    )
    const d = deliveriesSvc.upsertDelivery({
      customerId: pkg.id,
      date: '2026-07-10',
      quantity: 3,
      userId: owner.id,
    })
    expect(d.rate).toBeGreaterThan(0)
    expect(d.amount).toBe(0)
  })

  it('walk-in sale uses WALK-IN system customer', async () => {
    const { deliveriesSvc, owner } = await setup()
    const d = deliveriesSvc.walkInSale({
      date: '2026-07-12',
      quantity: 2,
      rate: Number(toPaisa(60)),
      cashCollected: Number(toPaisa(120)),
      name: 'Street buyer',
      userId: owner.id,
    })
    expect(d.quantity).toBe(2)
    expect(d.cashCollected).toBe(12000)
    expect(d.customerCode ?? '').toMatch(/WALK/i)
  })

  it('two walk-in sales on the same day both persist as separate rows', async () => {
    const { db, deliveriesSvc, owner } = await setup()
    const a = deliveriesSvc.walkInSale({
      date: '2026-07-12',
      quantity: 2,
      rate: Number(toPaisa(60)),
      cashCollected: Number(toPaisa(120)),
      name: 'Buyer A',
      userId: owner.id,
    })
    const b = deliveriesSvc.walkInSale({
      date: '2026-07-12',
      quantity: 5,
      rate: Number(toPaisa(60)),
      cashCollected: Number(toPaisa(300)),
      name: 'Buyer B',
      userId: owner.id,
    })
    expect(a.id).not.toBe(b.id)
    expect(a.quantity).toBe(2)
    expect(b.quantity).toBe(5)
    const walkIn = db.select().from(customers).where(eq(customers.code, 'WALK-IN')).get()!
    const rows = db
      .select()
      .from(deliveries)
      .where(and(eq(deliveries.customerId, walkIn.id), eq(deliveries.status, 'recorded')))
      .all()
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => r.quantity).sort()).toEqual([2, 5])
  })

  it('qty update without emptiesCollected keeps prior independent empties', async () => {
    const { deliveriesSvc, customer, owner } = await setup()
    deliveriesSvc.upsertDelivery({
      customerId: customer.id,
      date: '2026-07-10',
      quantity: 3,
      emptiesCollected: 1,
      userId: owner.id,
    })
    const updated = deliveriesSvc.upsertDelivery({
      customerId: customer.id,
      date: '2026-07-10',
      quantity: 5,
      userId: owner.id,
    })
    expect(updated.quantity).toBe(5)
    expect(updated.emptiesCollected).toBe(1)
    expect(updated.amount).toBe(30000)
  })

  it('matrix/card clear path voids even when prior empties differed from qty', async () => {
    const { db, deliveriesSvc, customer, owner } = await setup()
    const created = deliveriesSvc.upsertDelivery({
      customerId: customer.id,
      date: '2026-07-10',
      quantity: 3,
      emptiesCollected: 1,
      userId: owner.id,
    })
    // Same payload MonthMatrixPage / CustomerCardView send on clear
    const cleared = deliveriesSvc.upsertDelivery({
      customerId: customer.id,
      date: '2026-07-10',
      ...matrixCardQtyUpsert(null),
      userId: owner.id,
    })
    expect(cleared.status).toBe('void')
    const row = db.select().from(deliveries).where(eq(deliveries.id, created.id)).get()!
    expect(row.status).toBe('void')
    expect(row.quantity).toBe(0)
    expect(row.emptiesCollected).toBe(0)
  })

  it('isFree stores amount 0', async () => {
    const { deliveriesSvc, customer, owner } = await setup()
    const d = deliveriesSvc.upsertDelivery({
      customerId: customer.id,
      date: '2026-07-10',
      quantity: 3,
      isFree: true,
      freeReason: 'complimentary',
      userId: owner.id,
    })
    expect(d.isFree).toBe(true)
    expect(d.amount).toBe(0)
    expect(d.rate).toBe(6000)
  })

  it('listMissedDeliveries reads deliveries.missedDaysThreshold from settings', async () => {
    const { deliveriesSvc, customers, owner, product, settings } = await setup()
    const asOf = '2026-07-20'
    const c = customers.create(
      {
        name: 'Missed threshold',
        rate: Number(toPaisa(60)),
        productId: product.id,
        status: 'active',
      },
      owner.id,
    )
    deliveriesSvc.upsertDelivery({
      customerId: c.id,
      date: '2026-07-10',
      quantity: 1,
      userId: owner.id,
    })
    settings.setMany({ 'deliveries.missedDaysThreshold': 5 })
    const tight = deliveriesSvc.listMissedDeliveries({ asOf })
    expect(tight.items.some((i) => i.customerId === c.id)).toBe(true)

    settings.setMany({ 'deliveries.missedDaysThreshold': 30 })
    const loose = deliveriesSvc.listMissedDeliveries({ asOf })
    expect(loose.items.some((i) => i.customerId === c.id)).toBe(false)
  })

  it('bottles-out daysSinceLastReturn uses last day with empties > 0', async () => {
    const { deliveriesSvc, customer, owner } = await setup()
    deliveriesSvc.upsertDelivery({
      customerId: customer.id,
      date: '2026-07-01',
      quantity: 5,
      emptiesCollected: 0,
      userId: owner.id,
    })
    deliveriesSvc.upsertDelivery({
      customerId: customer.id,
      date: '2026-07-10',
      quantity: 0,
      emptiesCollected: 3,
      userId: owner.id,
    })
    deliveriesSvc.upsertDelivery({
      customerId: customer.id,
      date: '2026-07-20',
      quantity: 2,
      emptiesCollected: 0,
      userId: owner.id,
    })
    const list = deliveriesSvc.listBottlesOut({})
    const row = list.items.find((i) => i.customerId === customer.id)
    expect(row).toBeTruthy()
    expect(row!.lastDeliveryDate).toBe('2026-07-20')
    const today = todayBusinessDate()
    const expectedDays = Math.max(
      0,
      Math.round(
        (new Date(`${today}T12:00:00`).getTime() - new Date('2026-07-10T12:00:00').getTime()) /
          86_400_000,
      ),
    )
    expect(row!.daysSinceLastReturn).toBe(expectedDays)
  })

  it('getMonthGrid returns pivoted cells in one shot', async () => {
    const { deliveriesSvc, customers, owner, product } = await setup()
    for (let i = 0; i < 5; i++) {
      const c = customers.create(
        { name: `Grid ${i}`, rate: Number(toPaisa(60)), productId: product.id },
        owner.id,
      )
      deliveriesSvc.upsertDelivery({
        customerId: c.id,
        date: '2026-07-03',
        quantity: 2,
        userId: owner.id,
      })
      deliveriesSvc.upsertDelivery({
        customerId: c.id,
        date: '2026-07-15',
        quantity: 1,
        userId: owner.id,
      })
    }
    const grid = deliveriesSvc.getMonthGrid({ period: '2026-07' })
    expect(grid.daysInMonth).toBe(31)
    expect(grid.rows.length).toBeGreaterThanOrEqual(5)
    const withCells = grid.rows.filter((r) => r.cells.length === 2)
    expect(withCells.length).toBeGreaterThanOrEqual(5)
    expect(grid.grandTotalUnits).toBeGreaterThanOrEqual(15)
  })

  it('getMonthGrid for 500 customers stays under 1.5s (criteria 8 service budget)', async () => {
    const { deliveriesSvc, customers, owner, product } = await setup()
    for (let i = 0; i < 500; i++) {
      const c = customers.create(
        {
          name: `Perf ${i}`,
          rate: Number(toPaisa(60)),
          productId: product.id,
          status: 'active',
        },
        owner.id,
      )
      if (i % 3 === 0) {
        deliveriesSvc.upsertDelivery({
          customerId: c.id,
          date: '2026-07-05',
          quantity: 2,
          userId: owner.id,
        })
      }
    }
    const t0 = performance.now()
    const grid = deliveriesSvc.getMonthGrid({ period: '2026-07' })
    const elapsedMs = performance.now() - t0
    // eslint-disable-next-line no-console
    console.log(`[MONTH_GRID_500] ${grid.rows.length} rows in ${elapsedMs.toFixed(1)}ms`)
    expect(grid.rows.length).toBeGreaterThanOrEqual(500)
    expect(elapsedMs).toBeLessThan(1500)
  })

  it('service upsert path for 100 customers is fast (not UI keyboard timing)', async () => {
    const { deliveriesSvc, customers, owner, product } = await setup()
    const ids: number[] = []
    for (let i = 0; i < 100; i++) {
      const c = customers.create(
        {
          name: `Speed ${i}`,
          rate: Number(toPaisa(60)),
          productId: product.id,
          status: 'active',
        },
        owner.id,
      )
      ids.push(c.id)
    }

    // Service-only budget. Acceptance #9 still requires a timed daily-screen keyboard run.
    const t0 = performance.now()
    for (const id of ids) {
      deliveriesSvc.upsertDelivery({
        customerId: id,
        date: '2026-07-21',
        quantity: 2,
        userId: owner.id,
      })
    }
    const elapsedMs = performance.now() - t0
    // eslint-disable-next-line no-console
    console.log(`[SERVICE_UPSERT_100] ${(elapsedMs / 1000).toFixed(2)}s`)
    expect(elapsedMs).toBeLessThan(15_000)
  })
})
