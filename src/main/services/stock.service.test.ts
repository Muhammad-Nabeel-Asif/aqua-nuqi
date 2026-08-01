import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { eq } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { backfillStockMovements } from '@main/db/backfill-stock-movements'
import { closeDatabase, getDb, getRawDb, openDatabase } from '@main/db/client'
import { customerBalances, expenses, products, stockMovements } from '@main/db/schema'
import { seedDefaults } from '@main/db/seed'
import { toPaisa } from '@shared/money'
import { createAuditService } from './audit.service'
import { createAuthService } from './auth.service'
import { createBalanceService } from './balance.service'
import { createCustomerService } from './customer.service'
import { createDeliveryService } from './delivery.service'
import { createEmployeeService } from './employee.service'
import { createExpenseService } from './expense.service'
import { createPeriodService } from './period.service'
import { createRateService } from './rate.service'
import { createSettingsService } from './settings.service'
import { createStockService } from './stock.service'
import { createTripService } from './trip.service'
import { createVehicleService } from './vehicle.service'

describe('stockService (Phase 7)', () => {
  let dir: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqua-stock-'))
    const { db } = openDatabase(path.join(dir, 'test.db'))
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
    const expensesSvc = createExpenseService(db, raw, audit, period)
    const stock = createStockService(db, raw, audit, period, rates, settings, expensesSvc, balances)
    const customers = createCustomerService(db, audit, period, rates, balances, undefined, stock)
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
    const employees = createEmployeeService(db, audit, period)
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
    const customer = customers.create(
      {
        name: 'Stock Test',
        rate: Number(toPaisa(60)),
        productId: product.id,
        openingBottles: 0,
        joinedOn: '2026-06-01',
      },
      owner.id,
    )
    return {
      db,
      raw,
      stock,
      deliveries,
      trips,
      vehicles,
      employees,
      expensesSvc,
      customers,
      owner,
      product,
      customer,
      settings,
      balances,
    }
  }

  it('AC1: opening 500 empty + 200 filled ⇒ totalOwned 700', async () => {
    const { stock, owner } = await setup()
    stock.recordOpeningStock({
      date: '2026-07-01',
      bottleState: 'empty',
      quantity: 500,
      userId: owner.id,
    })
    stock.recordOpeningStock({
      date: '2026-07-01',
      bottleState: 'filled',
      quantity: 200,
      userId: owner.id,
    })
    const bal = stock.getBalances()
    expect(bal.totals.emptyAtPlant).toBe(500)
    expect(bal.totals.filledAtPlant).toBe(200)
    expect(bal.totals.totalOwned).toBe(700)
  })

  it('AC2: deliver 3 collect 3 — owned unchanged; stock moves filled→customer→empty', async () => {
    const { stock, deliveries, customer, owner } = await setup()
    stock.recordOpeningStock({
      date: '2026-07-01',
      bottleState: 'empty',
      quantity: 100,
      userId: owner.id,
    })
    stock.recordOpeningStock({
      date: '2026-07-01',
      bottleState: 'filled',
      quantity: 50,
      userId: owner.id,
    })
    const before = stock.getBalances().totals
    deliveries.upsertDelivery({
      customerId: customer.id,
      date: '2026-07-03',
      quantity: 3,
      emptiesCollected: 3,
      userId: owner.id,
    })
    const after = stock.getBalances().totals
    expect(after.totalOwned).toBe(before.totalOwned)
    expect(after.filledAtPlant).toBe(before.filledAtPlant - 3)
    expect(after.emptyAtPlant).toBe(before.emptyAtPlant + 3)
    expect(after.withCustomers).toBe(before.withCustomers)
  })

  it('AC3: deliver 3 collect 0 increases withCustomers by 3; owned same', async () => {
    const { stock, deliveries, customer, owner } = await setup()
    stock.recordOpeningStock({
      date: '2026-07-01',
      bottleState: 'filled',
      quantity: 20,
      userId: owner.id,
    })
    const before = stock.getBalances().totals
    deliveries.upsertDelivery({
      customerId: customer.id,
      date: '2026-07-03',
      quantity: 3,
      emptiesCollected: 0,
      userId: owner.id,
    })
    const after = stock.getBalances().totals
    expect(after.withCustomers).toBe(before.withCustomers + 3)
    expect(after.totalOwned).toBe(before.totalOwned)
  })

  it('AC4: voiding delivery reverses movements exactly (append-only)', async () => {
    const { stock, deliveries, customer, owner, db } = await setup()
    stock.recordOpeningStock({
      date: '2026-07-01',
      bottleState: 'filled',
      quantity: 20,
      userId: owner.id,
    })
    const before = stock.getBalances().totals
    const d = deliveries.upsertDelivery({
      customerId: customer.id,
      date: '2026-07-03',
      quantity: 3,
      emptiesCollected: 1,
      userId: owner.id,
    })
    const afterInsert = db
      .select()
      .from(stockMovements)
      .where(eq(stockMovements.refTable, 'deliveries'))
      .all()
      .filter((m) => m.refId === d.id)
    expect(afterInsert.length).toBeGreaterThan(0)

    deliveries.voidDelivery(d.id, 'test void', owner.id)
    const after = stock.getBalances().totals
    expect(after).toEqual(before)

    const movs = db
      .select()
      .from(stockMovements)
      .where(eq(stockMovements.refTable, 'deliveries'))
      .all()
      .filter((m) => m.refId === d.id)
    // Append-only: originals kept, opposite reversal rows added
    expect(movs.length).toBeGreaterThan(afterInsert.length)
    expect(movs.some((m) => m.notes?.startsWith('[reversal of #'))).toBe(true)
    // No hard deletes — every insert-time id still present
    for (const m of afterInsert) {
      expect(movs.some((x) => x.id === m.id)).toBe(true)
    }
  })

  it('AC5: backfill withCustomers equals Σ customer_balances.bottles_with_customer', async () => {
    const { stock, deliveries, customers, owner, raw, balances, product } = await setup()
    const c2 = customers.create(
      {
        name: 'Hist Cust',
        rate: Number(toPaisa(60)),
        productId: product.id,
        openingBottles: 5,
        openingAsOf: '2026-06-01',
        joinedOn: '2026-06-01',
      },
      owner.id,
    )
    deliveries.upsertDelivery({
      customerId: c2.id,
      date: '2026-07-05',
      quantity: 4,
      emptiesCollected: 2,
      userId: owner.id,
    })
    raw.prepare(`DELETE FROM stock_movements`).run()
    const n1 = backfillStockMovements(raw)
    expect(n1).toBeGreaterThan(0)
    const n2 = backfillStockMovements(raw)
    expect(n2).toBe(0)

    balances.recalculate()
    const sumBal = stock.sumCustomerBottles()
    const withCust = stock.getBalances().totals.withCustomers
    expect(withCust).toBe(sumBal)
    const row = getDb()
      .select()
      .from(customerBalances)
      .where(eq(customerBalances.customerId, c2.id))
      .get()
    expect(row?.bottlesWithCustomer).toBe(7)
    expect(withCust).toBe(7)
  })

  it('AC6: purchase 100 @ Rs 350 → empty+100 and Bottle purchase expense Rs 35,000', async () => {
    const { stock, owner, db } = await setup()
    const r = stock.purchaseBottles({
      date: '2026-07-10',
      quantity: 100,
      unitCost: Number(toPaisa(350)),
      vendorName: 'Bottle Co',
      userId: owner.id,
    })
    expect(stock.getBalances().totals.emptyAtPlant).toBe(100)
    expect(r.expenseAmount).toBe(3_500_000)
    const exp = db.select().from(expenses).where(eq(expenses.id, r.expenseId)).get()!
    expect(exp.source).toBe('purchase')
    expect(exp.amount).toBe(3_500_000)
  })

  it('AC7: scrap 5 reduces totalOwned by 5', async () => {
    const { stock, owner } = await setup()
    stock.recordOpeningStock({
      date: '2026-07-01',
      bottleState: 'filled',
      quantity: 50,
      userId: owner.id,
    })
    const before = stock.getBalances().totals.totalOwned
    stock.recordDamage({
      date: '2026-07-11',
      quantity: 5,
      bottleState: 'filled',
      fromLocation: 'plant',
      reason: 'damaged',
      notes: 'broken necks',
      userId: owner.id,
    })
    const after = stock.getBalances()
    expect(after.totals.totalOwned).toBe(before - 5)
    expect(after.totals.scrapped).toBe(5)
    const hist = stock.listMovements({ reason: 'damaged' })
    expect(hist.items.some((m) => m.quantity === 5)).toBe(true)
  })

  it('AC8–9: trip variance requires note; cash expected from linked deliveries', async () => {
    const { stock, deliveries, trips, vehicles, customer, owner, employees, product } =
      await setup()
    stock.recordOpeningStock({
      date: '2026-07-01',
      bottleState: 'filled',
      quantity: 200,
      userId: owner.id,
    })
    const vehicle = vehicles.create({ name: 'Van 1', vehicleType: 'van' }, owner.id)
    const emp = employees.create(
      {
        name: 'Driver One',
        role: 'delivery',
        joiningDate: '2026-01-01',
      },
      owner.id,
    )

    const trip = trips.startTrip({
      tripDate: '2026-07-15',
      employeeId: emp.id,
      vehicleId: vehicle.id,
      filledLoaded: 60,
      userId: owner.id,
    })

    // Auto-links via employee + date
    deliveries.upsertDelivery({
      customerId: customer.id,
      date: '2026-07-15',
      quantity: 52,
      emptiesCollected: 50,
      cashCollected: Number(toPaisa(2000)),
      employeeId: emp.id,
      userId: owner.id,
    })

    const recon = trips.getReconciliation(trip.id)
    expect(recon.reconciliation.cashExpected).toBe(Number(toPaisa(2000)))
    expect(recon.reconciliation.filledExpected).toBe(8) // 60 - 52

    expect(() =>
      trips.closeTrip({
        id: trip.id,
        filledReturned: 6,
        emptiesReturned: 50,
        cashSubmitted: Number(toPaisa(2000)),
      }),
    ).toThrow(/note/i)

    const ownedBeforeClose = stock.getBalances().totals.totalOwned
    const closed = trips.closeTrip({
      id: trip.id,
      filledReturned: 6,
      emptiesReturned: 50,
      cashSubmitted: Number(toPaisa(1500)),
      notes: '2 bottles missing; cash short Rs 500',
      userId: owner.id,
    })
    // Schema: loaded − returned − delivered = 60 − 6 − 52 = +2 (short)
    expect(closed.bottleVariance).toBe(2)
    expect(closed.cashExpected).toBe(Number(toPaisa(2000)))
    expect(closed.cashVariance).toBe(-Number(toPaisa(500)))

    const closedRecon = trips.getReconciliation(trip.id)
    expect(closedRecon.reconciliation.filledVariance).toBe(2)

    // Ghost-stock fix: shortfall written off as lost — van empty, owned drops
    const bal = stock.getBalances().totals
    expect(bal.filledInVans).toBe(0)
    expect(bal.emptyInVans).toBe(0)
    expect(bal.totalOwned).toBe(ownedBeforeClose - 2)
    expect(bal.scrapped).toBe(2)

    const empVar = trips.employeeVarianceSummary('2026-07-01', '2026-07-31')
    const row = empVar.items.find((i) => i.employeeId === emp.id)
    expect(row?.totalBottleVariance).toBe(2)
    expect(row?.totalCashVariance).toBe(-Number(toPaisa(500)))
    void product
  })

  it('voidTrip after shortfall close restores van/scrap/owned (no ghost −2)', async () => {
    const { stock, deliveries, trips, vehicles, customer, owner, employees } = await setup()
    stock.recordOpeningStock({
      date: '2026-07-01',
      bottleState: 'filled',
      quantity: 200,
      userId: owner.id,
    })
    const ownedAtStart = stock.getBalances().totals.totalOwned
    const vehicle = vehicles.create({ name: 'Van Void', vehicleType: 'van' }, owner.id)
    const emp = employees.create(
      {
        name: 'Driver Void',
        role: 'delivery',
        joiningDate: '2026-01-01',
      },
      owner.id,
    )

    const trip = trips.startTrip({
      tripDate: '2026-07-16',
      employeeId: emp.id,
      vehicleId: vehicle.id,
      filledLoaded: 60,
      userId: owner.id,
    })
    const delivery = deliveries.upsertDelivery({
      customerId: customer.id,
      date: '2026-07-16',
      quantity: 52,
      emptiesCollected: 50,
      cashCollected: Number(toPaisa(2000)),
      employeeId: emp.id,
      userId: owner.id,
    })

    trips.closeTrip({
      id: trip.id,
      filledReturned: 6,
      emptiesReturned: 50,
      cashSubmitted: Number(toPaisa(1500)),
      notes: '2 bottles missing; mistaken close',
      userId: owner.id,
    })
    expect(stock.getBalances().totals.filledInVans).toBe(0)
    expect(stock.getBalances().totals.scrapped).toBe(2)
    expect(stock.getBalances().totals.totalOwned).toBe(ownedAtStart - 2)

    deliveries.voidDelivery(delivery.id, 'unlink before trip void', owner.id)
    const voided = trips.voidTrip(trip.id, 'mistaken trip', owner.id)
    expect(voided.status).toBe('void')

    const bal = stock.getBalances().totals
    expect(bal.filledInVans).toBe(0)
    expect(bal.emptyInVans).toBe(0)
    // Trip shortfall write-off must not stick after void
    expect(bal.scrapped).toBe(0)
    expect(bal.totalOwned).toBe(ownedAtStart)
    expect(bal.filledAtPlant).toBe(200)
  })

  it('AC10: deliveries work with no open trip (plant → customer)', async () => {
    const { stock, deliveries, customer, owner } = await setup()
    stock.recordOpeningStock({
      date: '2026-07-01',
      bottleState: 'filled',
      quantity: 10,
      userId: owner.id,
    })
    deliveries.upsertDelivery({
      customerId: customer.id,
      date: '2026-07-20',
      quantity: 2,
      emptiesCollected: 2,
      userId: owner.id,
    })
    const bal = stock.getBalances().totals
    expect(bal.filledInVans).toBe(0)
    expect(bal.filledAtPlant).toBe(8)
    expect(bal.emptyAtPlant).toBe(2)
  })

  it('negative stock adjustment uses none sink (not scrap)', async () => {
    const { stock, owner } = await setup()
    stock.recordOpeningStock({
      date: '2026-07-01',
      bottleState: 'filled',
      quantity: 50,
      userId: owner.id,
    })
    stock.recordAdjustment({
      date: '2026-07-12',
      bottleState: 'filled',
      location: 'plant',
      delta: -5,
      notes: 'Physical count correction',
      userId: owner.id,
    })
    const bal = stock.getBalances().totals
    expect(bal.filledAtPlant).toBe(45)
    expect(bal.scrapped).toBe(0)
    expect(bal.totalOwned).toBe(45)
  })

  it('rejects production and trip load when plant stock is insufficient', async () => {
    const { stock, trips, vehicles, owner } = await setup()
    stock.recordOpeningStock({
      date: '2026-07-01',
      bottleState: 'empty',
      quantity: 10,
      userId: owner.id,
    })
    stock.recordOpeningStock({
      date: '2026-07-01',
      bottleState: 'filled',
      quantity: 5,
      userId: owner.id,
    })
    expect(() =>
      stock.recordProduction({ date: '2026-07-02', quantity: 11, userId: owner.id }),
    ).toThrow(/Insufficient empty/)

    const vehicle = vehicles.create({ name: 'Van 2', vehicleType: 'van' }, owner.id)
    expect(() =>
      trips.startTrip({
        tripDate: '2026-07-02',
        vehicleId: vehicle.id,
        filledLoaded: 6,
        userId: owner.id,
      }),
    ).toThrow(/Insufficient filled/)
  })

  it('bottles-out shortfall matches bottles × defaultDeposit − held for sampled customers', async () => {
    const { stock, customers, owner, product, db } = await setup()
    const deposit = Number(toPaisa(500))
    db.update(products).set({ defaultDeposit: deposit }).where(eq(products.id, product.id)).run()

    const samples = [
      { name: 'A', bottles: 4, held: Number(toPaisa(1000)) },
      { name: 'B', bottles: 2, held: Number(toPaisa(1500)) },
      { name: 'C', bottles: 6, held: 0 },
      { name: 'D', bottles: 1, held: Number(toPaisa(500)) },
      { name: 'E', bottles: 10, held: Number(toPaisa(2000)) },
    ]
    for (const s of samples) {
      customers.create(
        {
          name: s.name,
          rate: Number(toPaisa(60)),
          productId: product.id,
          openingBottles: s.bottles,
          openingAsOf: '2026-06-01',
          joinedOn: '2026-06-01',
          securityDepositHeld: s.held,
        },
        owner.id,
      )
    }

    const report = stock.listBottlesOut({ minBottles: 1 })
    for (const s of samples) {
      const row = report.items.find((i) => i.name === s.name)
      expect(row).toBeTruthy()
      const expectedShortfall = Math.max(0, s.bottles * deposit - s.held)
      expect(row!.depositShortfallAmount).toBe(expectedShortfall)
      expect(row!.bottlesWithCustomer).toBe(s.bottles)
    }
  })

  it('purchase expense is read-only (update/void rejected)', async () => {
    const { stock, owner, expensesSvc } = await setup()
    const r = stock.purchaseBottles({
      date: '2026-07-10',
      quantity: 10,
      unitCost: Number(toPaisa(100)),
      vendorName: 'Co',
      userId: owner.id,
    })
    expect(() =>
      expensesSvc.updateExpense({ id: r.expenseId, description: 'hack' }, owner.id),
    ).toThrow(/bottle purchase/i)
    expect(() => expensesSvc.voidExpense(r.expenseId, 'nope', owner.id)).toThrow(/bottle purchase/i)
  })

  it('delivery edit keeps prior movement rows (append-only replace)', async () => {
    const { stock, deliveries, customer, owner, db } = await setup()
    stock.recordOpeningStock({
      date: '2026-07-01',
      bottleState: 'filled',
      quantity: 30,
      userId: owner.id,
    })
    const d = deliveries.upsertDelivery({
      customerId: customer.id,
      date: '2026-07-03',
      quantity: 3,
      emptiesCollected: 1,
      userId: owner.id,
    })
    const firstIds = db
      .select()
      .from(stockMovements)
      .where(eq(stockMovements.refTable, 'deliveries'))
      .all()
      .filter((m) => m.refId === d.id)
      .map((m) => m.id)

    deliveries.upsertDelivery({
      customerId: customer.id,
      date: '2026-07-03',
      quantity: 5,
      emptiesCollected: 2,
      userId: owner.id,
    })

    const after = db
      .select()
      .from(stockMovements)
      .where(eq(stockMovements.refTable, 'deliveries'))
      .all()
      .filter((m) => m.refId === d.id)
    for (const id of firstIds) {
      expect(after.some((m) => m.id === id)).toBe(true)
    }
    expect(after.some((m) => m.notes?.startsWith('[reversal of #'))).toBe(true)
    expect(stock.getBalances().totals.withCustomers).toBe(3) // 5 delivered − 2 empties
  })
})
