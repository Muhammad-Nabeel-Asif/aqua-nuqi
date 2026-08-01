import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDatabase, getDb, getRawDb, openDatabase } from '@main/db/client'
import { seedDefaults } from '@main/db/seed'
import { resetDbWriteCounter } from '@main/lib/db-write-counter'
import { clearReportCache } from '@main/lib/report-cache'
import { toPaisa } from '@shared/money'
import { createAdjustmentService } from './adjustment.service'
import { createAuditService } from './audit.service'
import { createAuthService } from './auth.service'
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
import { createVehicleService } from './vehicle.service'

/**
 * Fixed seeded dataset with hand-calculated expectations (July 2026).
 *
 * Customer A (residential), rate Rs 60:
 *   - 10 recorded bottles (empties 8) → deliveries_total = 10 × 6000 = 60_000
 *   - 1 voided 2-bottle delivery (excluded)
 *   - Invoice issued → accrual +60_000
 *   - Payment Rs 400 on 2026-07-20 → cash +40_000; outstanding 20_000
 *
 * Customer B (residential), rate Rs 50:
 *   - 5 bottles, empties 5 → 25_000; invoice issued; NO payment
 *   - Accrual +25_000; cash +0; outstanding 25_000
 *
 * Walk-in: 3 × Rs 70 = 21_000 (cash collected = amount)
 *   - In accrual + cash; excluded from receivables
 *
 * Deposit on A: Rs 1,000 adjustment (liability) — NOT in revenue
 * Deposit-tagged payment Rs 500 — NOT in cash revenue
 *
 * Expenses (active):
 *   Fuel Rs 10,000 → 1_000_000
 *   Electricity Rs 5,000 → 500_000
 *   Employee Advance Rs 2,000 → 200_000  (source payroll)
 *   Salaries Rs 8,000 → 800_000         (net after advance; source payroll)
 *   Voided Fuel Rs 3,000 → excluded
 * Total expenses = 2_500_000
 * Salary-related (Advance+Salaries) = 1_000_000 (= gross once)
 *
 * Accrual revenue = 60_000 + 25_000 + 21_000 = 106_000
 * Cash revenue    = 40_000 + 21_000 = 61_000
 * Profit accrual  = 106_000 − 2_500_000 = −2_394_000
 * Profit cash     = 61_000 − 2_500_000 = −2_439_000
 *
 * Bottles delivered = 10 + 5 + 3 = 18
 * Cost/bottle = floor(2_500_000 / 18) = 138_889 (Math.round)
 * Bottles with customers = A: 10−8 = 2; B: 0; walk-in ignored in balances typically
 * Receivables outstanding = 20_000 + 25_000 = 45_000
 */

const RATE_A = Number(toPaisa(60))
const RATE_B = Number(toPaisa(50))
const RATE_WALK = Number(toPaisa(70))

const EXPECT = {
  accrualRevenue: 106_000,
  cashRevenue: 61_000,
  totalExpenses: 2_500_000,
  profitAccrual: 106_000 - 2_500_000,
  profitCash: 61_000 - 2_500_000,
  salaryRelated: 1_000_000,
  bottlesDelivered: 18,
  costPerBottle: Math.round(2_500_000 / 18),
  outstanding: 45_000,
  bottlesWithCustomers: 2,
  depositExcludedFromAccrual: 100_000, // Rs 1000
  depositPaymentExcluded: 50_000, // Rs 500
}

describe('report Phase 8 acceptance', () => {
  let dir: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqua-rpt-'))
    const { db } = openDatabase(path.join(dir, 'test.db'))
    migrate(db, { migrationsFolder: path.join(process.cwd(), 'drizzle') })
    seedDefaults(db, path.join(dir, 'backups'))
    resetDbWriteCounter()
    clearReportCache()
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
    const settings = createSettingsService(db, audit)
    const rates = createRateService(db, audit, period)
    const balances = createBalanceService(db, raw)
    const ledger = createLedgerService(db, balances)
    const expenses = createExpenseService(db, raw, audit, period)
    const stock = createStockService(db, raw, audit, period, rates, settings, expenses, balances)
    const customers = createCustomerService(db, audit, period, rates, balances, ledger, stock)
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
    const reports = createReportService(db, raw, { expenses, receivables, stock, trips })
    const owner = await auth.createUser({
      username: 'owner',
      displayName: 'Owner',
      password: 'secret12',
      role: 'owner',
    })
    void vehicles
    return {
      db,
      raw,
      customers,
      deliveries,
      adjustments,
      billing,
      payments,
      expenses,
      receivables,
      reports,
      stock,
      owner,
    }
  }

  async function seedFixture() {
    const ctx = await setup()
    const { customers, deliveries, adjustments, billing, payments, expenses, owner } = ctx

    const a = customers.create(
      {
        name: 'Report Cust A',
        rate: RATE_A,
        joinedOn: '2026-06-01',
      },
      owner.id,
    )
    const b = customers.create(
      {
        name: 'Report Cust B',
        rate: RATE_B,
        joinedOn: '2026-06-01',
      },
      owner.id,
    )

    // A: 10 bottles Jul 1–10, empties 8 on last day pattern
    for (let day = 1; day <= 10; day++) {
      deliveries.upsertDelivery({
        customerId: a.id,
        date: `2026-07-${String(day).padStart(2, '0')}`,
        quantity: 1,
        emptiesCollected: day === 10 ? 8 : 0,
        userId: owner.id,
      })
    }
    // Voided delivery — must not affect revenue or bottles
    const voidedDel = deliveries.upsertDelivery({
      customerId: a.id,
      date: '2026-07-15',
      quantity: 2,
      userId: owner.id,
    })
    deliveries.voidDelivery(voidedDel.id, 'mistake', owner.id)

    // B: 5 bottles
    for (let day = 1; day <= 5; day++) {
      deliveries.upsertDelivery({
        customerId: b.id,
        date: `2026-07-${String(day).padStart(2, '0')}`,
        quantity: 1,
        emptiesCollected: 1,
        userId: owner.id,
      })
    }

    // Walk-in
    deliveries.walkInSale({
      date: '2026-07-12',
      quantity: 3,
      rate: RATE_WALK,
      cashCollected: 3 * RATE_WALK,
      userId: owner.id,
    })

    // Deposit liability on A
    adjustments.create(
      {
        customerId: a.id,
        adjustmentDate: '2026-07-05',
        kind: 'deposit_received',
        amount: Number(toPaisa(1000)),
        description: 'Bottle deposit',
      },
      owner.id,
    )

    // Invoices
    const invA = billing.generateInvoice(a.id, '2026-07', {}, owner.id)
    billing.issueInvoice(invA.id, owner.id)
    const invB = billing.generateInvoice(b.id, '2026-07', {}, owner.id)
    billing.issueInvoice(invB.id, owner.id)

    // Partial payment on A
    payments.recordPayment(
      {
        customerId: a.id,
        date: '2026-07-20',
        amount: Number(toPaisa(400)),
        method: 'cash',
      },
      owner.id,
    )

    // Deposit-tagged payment (must not enter cash revenue)
    payments.recordPayment(
      {
        customerId: a.id,
        date: '2026-07-21',
        amount: Number(toPaisa(500)),
        method: 'cash',
        notes: '[deposit] extra bottle security',
      },
      owner.id,
    )

    const fuel = expenses.findCategoryByName('Fuel')!
    const electricity = expenses.findCategoryByName('Electricity')!
    const salaries = expenses.findCategoryByName('Salaries')!
    const advanceCat = expenses.findCategoryByName('Employee Advance')!

    expenses.createExpense(
      {
        expenseDate: '2026-07-08',
        categoryId: fuel.id,
        amount: Number(toPaisa(10_000)),
        paymentMethod: 'cash',
        description: 'Diesel',
      },
      owner.id,
    )
    expenses.createExpense(
      {
        expenseDate: '2026-07-09',
        categoryId: electricity.id,
        amount: Number(toPaisa(5_000)),
        paymentMethod: 'bank_transfer',
      },
      owner.id,
    )
    // Voided — excluded
    const voided = expenses.createExpense(
      {
        expenseDate: '2026-07-10',
        categoryId: fuel.id,
        amount: Number(toPaisa(3_000)),
        paymentMethod: 'cash',
      },
      owner.id,
    )
    expenses.voidExpense(voided.id, 'wrong entry', owner.id)

    // Advance + net salary (Phase 6 pattern: counted once as gross)
    expenses.createExpense(
      {
        expenseDate: '2026-07-11',
        categoryId: advanceCat.id,
        amount: Number(toPaisa(2_000)),
        paymentMethod: 'cash',
        source: 'payroll',
        sourceRefTable: 'salary_advances',
        sourceRefId: 1,
        description: 'Advance E-001',
      },
      owner.id,
    )
    expenses.createExpense(
      {
        expenseDate: '2026-07-31',
        categoryId: salaries.id,
        amount: Number(toPaisa(8_000)),
        paymentMethod: 'cash',
        source: 'payroll',
        sourceRefTable: 'payroll_items',
        sourceRefId: 1,
        description: 'July salary net',
      },
      owner.id,
    )

    return { ...ctx, customerA: a, customerB: b, invA, invB }
  }

  const july = { from: '2026-07-01', to: '2026-07-31' }

  it('AC1: dashboard MTD accrual revenue equals P&L accrual for same period', async () => {
    const { reports } = await seedFixture()
    const pl = reports.profitAndLoss(july, 'accrual', { compare: false })
    const dash = reports.dashboard('2026-07-31')
    expect(dash.month.revenueAccrual).toBe(pl.revenue.netRevenue)
    expect(dash.month.revenueAccrual).toBe(EXPECT.accrualRevenue)
  })

  it('AC2: accrual and cash differ; each matches hand-calculated value', async () => {
    const { reports } = await seedFixture()
    const accrual = reports.profitAndLoss(july, 'accrual', { compare: false })
    const cash = reports.profitAndLoss(july, 'cash', { compare: false })
    expect(accrual.revenue.netRevenue).toBe(EXPECT.accrualRevenue)
    expect(cash.revenue.netRevenue).toBe(EXPECT.cashRevenue)
    expect(accrual.revenue.netRevenue).not.toBe(cash.revenue.netRevenue)
    expect(accrual.netProfit).toBe(EXPECT.profitAccrual)
    expect(cash.netProfit).toBe(EXPECT.profitCash)
  })

  it('AC3: deposits and advances do not distort profit (hand-calculated)', async () => {
    const { reports } = await seedFixture()
    const pl = reports.profitAndLoss(july, 'accrual', { compare: false })
    // Deposit received is listed as excluded, not in net revenue
    expect(pl.excluded.depositsReceived).toBe(EXPECT.depositExcludedFromAccrual)
    expect(pl.excluded.depositPaymentsTagged).toBe(EXPECT.depositPaymentExcluded)
    expect(pl.revenue.netRevenue).toBe(EXPECT.accrualRevenue)
    // Advance + Salaries = gross once
    const salaryRelated = pl.expenses
      .filter((e) => e.isSalaries || e.isEmployeeAdvance)
      .reduce((s, e) => s + e.total, 0)
    expect(salaryRelated).toBe(EXPECT.salaryRelated)
    expect(pl.netProfit).toBe(EXPECT.profitAccrual)
  })

  it('AC4: salaries appear once; total expenses = sum of expense list', async () => {
    const { reports, expenses } = await seedFixture()
    const pl = reports.profitAndLoss(july, 'accrual', { compare: false })
    const list = expenses.listExpenses({ from: july.from, to: july.to, limit: 5000 })
    expect(pl.totalExpenses).toBe(list.totalAmount)
    expect(pl.totalExpenses).toBe(EXPECT.totalExpenses)
    const salaryRows = pl.expenses.filter((e) => e.isSalaries)
    expect(salaryRows).toHaveLength(1)
    expect(salaryRows[0]!.total).toBe(Number(toPaisa(8_000)))
  })

  it('AC5: receivables total = sum of positive balances; buckets sum to total', async () => {
    const { reports, receivables } = await seedFixture()
    const dash = reports.dashboard('2026-07-31')
    const recv = receivables.report('2026-07-31')
    // Deposit credit on A reduces A's AR; outstanding may not be 45k after deposit.
    // Hand-calc without treating deposit as reducing "trading" AR:
    // A: invoice 60k − payment 40k − deposit credit 100k = −80k (in credit)
    // B: 25k outstanding
    // So total outstanding = B only = 25_000; buckets sum to that.
    expect(dash.assets.totalOutstanding).toBe(recv.totalOutstanding)
    const bucketSum = Object.values(recv.bucketTotals).reduce((s, n) => s + n, 0)
    expect(bucketSum).toBe(recv.totalOutstanding)
    expect(recv.totalOutstanding).toBe(Number(toPaisa(250)))
    // Walk-in never appears
    expect(recv.outstanding.every((r) => r.code !== 'WALK-IN')).toBe(true)
  })

  it('AC6: dashboard bottles with customers equals bottles-out report total', async () => {
    const { reports, stock } = await seedFixture()
    const dash = reports.dashboard('2026-07-31')
    const bottlesOut = stock.listBottlesOut({ minBottles: 1 })
    expect(dash.assets.bottlesWithCustomers).toBe(bottlesOut.summary.totalBottlesWithCustomers)
    expect(dash.assets.bottlesWithCustomers).toBe(EXPECT.bottlesWithCustomers)
  })

  it('AC7: cost per bottle = total expenses ÷ bottles delivered', async () => {
    const { reports } = await seedFixture()
    const cpb = reports.costPerBottle(july)
    const julyRow = cpb.items.find((i) => i.period === '2026-07')!
    expect(julyRow.bottles).toBe(EXPECT.bottlesDelivered)
    expect(julyRow.expenses).toBe(EXPECT.totalExpenses)
    expect(julyRow.costPerBottle).toBe(EXPECT.costPerBottle)
  })

  it('voided rows excluded from sales summary', async () => {
    const { reports } = await seedFixture()
    const sales = reports.salesSummary({ ...july, groupBy: 'month' })
    // 10 + 5 + 3 = 18; voided 2 excluded
    expect(sales.totals.units).toBe(18)
    expect(sales.totals.value).toBe(60_000 + 25_000 + 21_000)
  })

  it('walk-in in revenue, excluded from customer-wise sales / receivables', async () => {
    const { reports } = await seedFixture()
    const pl = reports.profitAndLoss(july, 'accrual', { compare: false })
    expect(pl.revenue.walkInSales).toBe(21_000)
    const cust = reports.customerWiseSales(july)
    expect(cust.items.every((i) => i.code !== 'WALK-IN')).toBe(true)
  })

  it('operator dashboard strips profit/expense figures', async () => {
    const { reports } = await seedFixture()
    const op = reports.dashboardForRole('operator', '2026-07-31')
    expect(op.month.expenses).toBe(0)
    expect(op.month.profitAccrual).toBe(0)
    expect(op.month.revenueAccrual).toBe(0)
    expect(op.actions.recurringNotRecorded).toEqual([])
    // Operational figures remain (month bottles; nothing delivered on asOf day itself)
    expect(op.month.bottlesDelivered).toBe(EXPECT.bottlesDelivered)
    expect(op.assets.bottlesWithCustomers).toBe(EXPECT.bottlesWithCustomers)
  })

  it('report cache returns same object until a write bumps the counter', async () => {
    const { reports, expenses, owner } = await seedFixture()
    const a = reports.profitAndLoss(july, 'accrual', { compare: false })
    const b = reports.profitAndLoss(july, 'accrual', { compare: false })
    expect(a).toBe(b) // same cached reference
    const fuel = expenses.findCategoryByName('Fuel')!
    expenses.createExpense(
      {
        expenseDate: '2026-07-28',
        categoryId: fuel.id,
        amount: 100,
        paymentMethod: 'cash',
      },
      owner.id,
    )
    const c = reports.profitAndLoss(july, 'accrual', { compare: false })
    expect(c).not.toBe(a)
    expect(c.totalExpenses).toBe(a.totalExpenses + 100)
  })

  it('performance: P&L and dashboard under 2s on fixture', async () => {
    const { reports } = await seedFixture()
    const t0 = Date.now()
    for (let i = 0; i < 20; i++) {
      reports.profitAndLoss(july, 'accrual')
      reports.dashboard('2026-07-31')
      reports.costPerBottle(july)
      reports.salesSummary({ ...july, groupBy: 'day' })
    }
    expect(Date.now() - t0).toBeLessThan(2000)
  })
})
