import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { and, eq } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDatabase, getDb, getRawDb, openDatabase } from '@main/db/client'
import { invoices, ledgerEntries, paymentAllocations, sequences } from '@main/db/schema'
import { seedDefaults } from '@main/db/seed'
import { AppError } from '@shared/errors'
import { toPaisa } from '@shared/money'
import { createAdjustmentService } from './adjustment.service'
import { createAuditService } from './audit.service'
import { createAuthService } from './auth.service'
import { createBalanceService } from './balance.service'
import { createBillingService } from './billing.service'
import { createCustomerService } from './customer.service'
import { createDeliveryService } from './delivery.service'
import { createLedgerService } from './ledger.service'
import { createPaymentService } from './payment.service'
import { createPeriodService } from './period.service'
import { createRateService } from './rate.service'
import { createReceivablesService } from './receivables.service'
import { createSettingsService } from './settings.service'

describe('billing Phase 3 acceptance', () => {
  let dir: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqua-bill-'))
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
    const period = createPeriodService(db, audit)
    const settings = createSettingsService(db, audit)
    const rates = createRateService(db, audit, period)
    const balances = createBalanceService(db, raw)
    const ledger = createLedgerService(db, balances)
    const customers = createCustomerService(db, audit, period, rates, balances, ledger)
    const deliveries = createDeliveryService(db, audit, period, rates, balances, settings)
    const adjustments = createAdjustmentService(db, audit, period, balances, ledger)
    const billing = createBillingService(db, audit, period, settings, balances, ledger)
    const payments = createPaymentService(db, audit, period, balances, ledger, billing)
    const receivables = createReceivablesService(db)
    const owner = await auth.createUser({
      username: 'owner',
      displayName: 'Owner',
      password: 'secret12',
      role: 'owner',
    })
    return {
      db,
      customers,
      deliveries,
      adjustments,
      billing,
      payments,
      ledger,
      balances,
      receivables,
      owner,
      settings,
      period,
    }
  }

  it('1. opening 3000 + 20×60 − discount 500 = payable 3700; ledger matches after issue', async () => {
    const { customers, deliveries, adjustments, billing, ledger, owner } = await setup()
    const c = customers.create(
      {
        name: 'Bill Cust',
        openingBalance: Number(toPaisa(3000)),
        openingAsOf: '2026-06-30',
        rate: Number(toPaisa(60)),
      },
      owner.id,
    )

    // 20 bottles across July
    for (let day = 1; day <= 20; day++) {
      deliveries.upsertDelivery({
        customerId: c.id,
        date: `2026-07-${String(day).padStart(2, '0')}`,
        quantity: 1,
        userId: owner.id,
      })
    }

    adjustments.create(
      {
        customerId: c.id,
        adjustmentDate: '2026-07-15',
        kind: 'discount',
        amount: Number(toPaisa(500)),
        description: 'Goodwill discount',
      },
      owner.id,
    )

    const draft = billing.generateInvoice(c.id, '2026-07', { issueDate: '2026-08-01' }, owner.id)
    expect(draft.openingBalance).toBe(Number(toPaisa(3000)))
    expect(draft.deliveriesTotal).toBe(Number(toPaisa(1200)))
    expect(draft.discountTotal).toBe(Number(toPaisa(500)))
    expect(draft.invoiceTotal).toBe(Number(toPaisa(700)))
    expect(draft.totalPayable).toBe(Number(toPaisa(3700)))

    const issued = billing.issueInvoice(draft.id, owner.id)
    expect(issued.status).toBe('issued')
    // Hand check: opening 3000 already in ledger + invoice_total 700 = 3700
    expect(Number(ledger.getBalance(c.id))).toBe(Number(toPaisa(3700)))
  })

  it('2. Rs 2000 payment → balance 1700, partially_paid, one allocation', async () => {
    const { customers, deliveries, adjustments, billing, payments, ledger, db, owner } =
      await setup()
    const c = customers.create(
      {
        name: 'Pay Partial',
        openingBalance: Number(toPaisa(3000)),
        openingAsOf: '2026-06-30',
        rate: Number(toPaisa(60)),
      },
      owner.id,
    )
    for (let day = 1; day <= 20; day++) {
      deliveries.upsertDelivery({
        customerId: c.id,
        date: `2026-07-${String(day).padStart(2, '0')}`,
        quantity: 1,
        userId: owner.id,
      })
    }
    adjustments.create(
      {
        customerId: c.id,
        adjustmentDate: '2026-07-15',
        kind: 'discount',
        amount: Number(toPaisa(500)),
      },
      owner.id,
    )
    const inv = billing.issueInvoice(
      billing.generateInvoice(c.id, '2026-07', { issueDate: '2026-08-01' }, owner.id).id,
      owner.id,
    )

    const pay = payments.recordPayment(
      {
        customerId: c.id,
        date: '2026-08-05',
        amount: Number(toPaisa(2000)),
        method: 'cash',
      },
      owner.id,
    )

    expect(Number(ledger.getBalance(c.id))).toBe(Number(toPaisa(1700)))
    const updated = billing.getById(inv.id)
    expect(updated.status).toBe('partially_paid')
    expect(updated.paidTotal).toBe(Number(toPaisa(2000)))
    expect(pay.allocations).toHaveLength(1)
    const allocs = db
      .select()
      .from(paymentAllocations)
      .where(eq(paymentAllocations.paymentId, pay.id))
      .all()
    expect(allocs).toHaveLength(1)
  })

  it('3. Rs 5000 payment → 1300 credit; next invoice applies credit via opening', async () => {
    const { customers, deliveries, adjustments, billing, payments, ledger, owner } = await setup()
    const c = customers.create(
      {
        name: 'Overpay',
        openingBalance: Number(toPaisa(3000)),
        openingAsOf: '2026-06-30',
        joinedOn: '2026-06-01',
        rate: Number(toPaisa(60)),
      },
      owner.id,
    )
    for (let day = 1; day <= 20; day++) {
      deliveries.upsertDelivery({
        customerId: c.id,
        date: `2026-07-${String(day).padStart(2, '0')}`,
        quantity: 1,
        userId: owner.id,
      })
    }
    adjustments.create(
      {
        customerId: c.id,
        adjustmentDate: '2026-07-15',
        kind: 'discount',
        amount: Number(toPaisa(500)),
      },
      owner.id,
    )
    // Issue + pay within July so August opening (as-of 31 Jul) includes the credit
    const inv = billing.issueInvoice(
      billing.generateInvoice(c.id, '2026-07', { issueDate: '2026-07-31' }, owner.id).id,
      owner.id,
    )

    payments.recordPayment(
      {
        customerId: c.id,
        date: '2026-07-31',
        amount: Number(toPaisa(5000)),
        method: 'cash',
      },
      owner.id,
    )

    expect(Number(ledger.getBalance(c.id))).toBe(Number(toPaisa(-1300)))
    expect(billing.getById(inv.id).status).toBe('paid')

    // August: 10 bottles — credit is in opening_balance carry-forward
    for (let day = 1; day <= 10; day++) {
      deliveries.upsertDelivery({
        customerId: c.id,
        date: `2026-08-${String(day).padStart(2, '0')}`,
        quantity: 1,
        userId: owner.id,
      })
    }
    const next = billing.generateInvoice(c.id, '2026-08', { issueDate: '2026-09-01' }, owner.id)
    expect(next.openingBalance).toBe(Number(toPaisa(-1300)))
    expect(next.deliveriesTotal).toBe(Number(toPaisa(600)))
    expect(next.totalPayable).toBe(Number(toPaisa(-700)))
  })

  it('4. voiding issued invoice restores pre-invoice balance and frees deliveries', async () => {
    const { customers, deliveries, billing, ledger, db, owner } = await setup()
    const c = customers.create(
      {
        name: 'Void Me',
        openingBalance: Number(toPaisa(1000)),
        openingAsOf: '2026-06-30',
        rate: Number(toPaisa(60)),
      },
      owner.id,
    )
    deliveries.upsertDelivery({
      customerId: c.id,
      date: '2026-07-05',
      quantity: 5,
      userId: owner.id,
    })
    const before = Number(ledger.getBalance(c.id))
    const draft = billing.generateInvoice(c.id, '2026-07', {}, owner.id)
    const issued = billing.issueInvoice(draft.id, owner.id)
    expect(Number(ledger.getBalance(c.id))).toBe(before + issued.invoiceTotal)

    const lineCountBeforeVoid = issued.lines.length
    expect(lineCountBeforeVoid).toBeGreaterThan(0)

    billing.voidInvoice(issued.id, 'Correction', owner.id)
    expect(Number(ledger.getBalance(c.id))).toBe(before)

    const voided = billing.getById(issued.id)
    expect(voided.status).toBe('void')
    expect(voided.lines).toHaveLength(lineCountBeforeVoid)

    const rows = db.select().from(ledgerEntries).where(eq(ledgerEntries.customerId, c.id)).all()
    expect(rows.some((r) => r.entryType === 'invoice')).toBe(true)
    expect(rows.some((r) => r.entryType === 'void_reversal')).toBe(true)

    // Deliveries freed for re-billing
    const again = billing.generateInvoice(c.id, '2026-07', {}, owner.id)
    expect(again.deliveriesQty).toBe(5)
  })

  it('5. generating same period twice rejected with INVOICE_EXISTS', async () => {
    const { customers, deliveries, billing, owner } = await setup()
    const c = customers.create(
      { name: 'Dup', openingBalance: 0, rate: Number(toPaisa(60)) },
      owner.id,
    )
    deliveries.upsertDelivery({
      customerId: c.id,
      date: '2026-07-01',
      quantity: 2,
      userId: owner.id,
    })
    const d = billing.generateInvoice(c.id, '2026-07', {}, owner.id)
    billing.issueInvoice(d.id, owner.id)
    try {
      billing.generateInvoice(c.id, '2026-07', {}, owner.id)
      expect.fail('should throw')
    } catch (e) {
      expect(e).toBeInstanceOf(AppError)
      expect((e as AppError).code).toBe('INVOICE_EXISTS')
    }
  })

  it('6. 200 invoice numbers sequential, gapless, including cancelled mid-batch', async () => {
    const { customers, deliveries, billing, db, owner } = await setup()
    const ids: number[] = []
    for (let i = 0; i < 200; i++) {
      const c = customers.create({ name: `Seq ${i}`, rate: Number(toPaisa(50)) }, owner.id)
      deliveries.upsertDelivery({
        customerId: c.id,
        date: '2026-07-02',
        quantity: 1,
        userId: owner.id,
      })
      ids.push(c.id)
    }

    // Generate 120, then "cancel" (stop). Numbers 1–120 used.
    for (let i = 0; i < 120; i++) {
      billing.generateInvoice(ids[i]!, '2026-07', {}, owner.id)
    }
    // Continue with remaining 80 — must continue from 121 with no gaps/dupes
    for (let i = 120; i < 200; i++) {
      billing.generateInvoice(ids[i]!, '2026-07', {}, owner.id)
    }

    const nos = db
      .select()
      .from(invoices)
      .all()
      .map((r) => r.invoiceNo)
      .sort()

    expect(nos).toHaveLength(200)
    expect(new Set(nos).size).toBe(200)
    for (let i = 1; i <= 200; i++) {
      expect(nos[i - 1]).toBe(`INV-2026-07-${String(i).padStart(4, '0')}`)
    }

    const seq = db.select().from(sequences).where(eq(sequences.name, 'invoice:2026-07')).get()
    expect(seq?.nextValue).toBe(201)
  })

  it('7. deposit on invoice as own line, changes balance, excluded from revenue', async () => {
    const { customers, deliveries, adjustments, billing, ledger, owner } = await setup()
    const c = customers.create(
      {
        name: 'Deposit Inv',
        joinedOn: '2026-06-01',
        rate: Number(toPaisa(60)),
      },
      owner.id,
    )
    deliveries.upsertDelivery({
      customerId: c.id,
      date: '2026-07-10',
      quantity: 5,
      userId: owner.id,
    })
    adjustments.create(
      {
        customerId: c.id,
        adjustmentDate: '2026-07-12',
        kind: 'deposit_received',
        amount: Number(toPaisa(1000)),
      },
      owner.id,
    )

    // Deposit credit already in ledger
    expect(Number(ledger.getBalance(c.id))).toBe(Number(toPaisa(-1000)))

    const draft = billing.generateInvoice(c.id, '2026-07', {}, owner.id)
    expect(draft.lines.some((l) => l.lineType === 'deposit')).toBe(true)
    expect(draft.invoiceTotal).toBe(Number(toPaisa(300))) // 5×60 only — deposit not in revenue
    expect(draft.chargesTotal).toBe(0)
    // Document amount due includes deposit credit so it matches the ledger
    expect(draft.totalPayable).toBe(Number(toPaisa(-700)))
    expect(draft.balanceDue).toBe(Number(toPaisa(-700)))

    const issued = billing.issueInvoice(draft.id, owner.id)
    // Balance: −1000 + 300 invoice = −700
    expect(Number(ledger.getBalance(c.id))).toBe(Number(toPaisa(-700)))
    expect(issued.balanceDue).toBe(Number(ledger.getBalance(c.id)))

    expect(billing.revenueAccrual('2026-07')).toBe(Number(toPaisa(300)))
    expect(billing.revenueCash('2026-07')).toBe(0)
  })

  it('8. monthly package 2000 + 4 excess × 50 = 2200', async () => {
    const { customers, deliveries, billing, owner } = await setup()
    const c = customers.create(
      {
        name: 'Package Cust',
        billingMode: 'monthly_package',
        packageAmount: Number(toPaisa(2000)),
        packageIncludedQty: 30,
        packageExcessRate: Number(toPaisa(50)),
        rate: Number(toPaisa(60)),
      },
      owner.id,
    )
    // 34 bottles on one day (package customers still count Σ qty)
    deliveries.upsertDelivery({
      customerId: c.id,
      date: '2026-07-15',
      quantity: 34,
      userId: owner.id,
    })

    const inv = billing.generateInvoice(c.id, '2026-07', {}, owner.id)
    expect(inv.deliveriesQty).toBe(34)
    expect(inv.invoiceTotal).toBe(Number(toPaisa(2200)))
  })

  it('9. batch 300 customers under 20s, per-customer transactional', async () => {
    const { customers, deliveries, billing, owner } = await setup()
    for (let i = 0; i < 300; i++) {
      const c = customers.create({ name: `Batch ${i}`, rate: Number(toPaisa(40)) }, owner.id)
      deliveries.upsertDelivery({
        customerId: c.id,
        date: '2026-07-05',
        quantity: 2,
        userId: owner.id,
      })
    }
    const start = performance.now()
    const result = billing.generateBatch('2026-07', { mode: 'all' }, {}, owner.id)
    const elapsed = performance.now() - start
    expect(result.generated).toBe(300)
    expect(elapsed).toBeLessThan(20_000)
  }, 60_000)

  it('10. ageing buckets across month boundary (1st vs 31st)', async () => {
    const { customers, deliveries, billing, receivables, settings, owner } = await setup()
    // Due 2026-07-01, asOf 2026-08-01 → 31 days → 31-60
    expect(receivables.ageingBucket(receivables.daysBetween('2026-07-01', '2026-08-01'))).toBe(
      '31-60',
    )
    // Due 2026-07-31, asOf 2026-08-01 → 1 day → 1-30
    expect(receivables.ageingBucket(receivables.daysBetween('2026-07-31', '2026-08-01'))).toBe(
      '1-30',
    )
    // Not yet due → current
    expect(receivables.ageingBucket(0)).toBe('current')

    // Integration: real invoices through receivables.report()
    settings.setMany({ 'invoice.dueDays': 0 }, { userId: owner.id })
    const early = customers.create(
      { name: 'Due 1st', rate: Number(toPaisa(100)), joinedOn: '2026-05-01' },
      owner.id,
    )
    const late = customers.create(
      { name: 'Due 31st', rate: Number(toPaisa(100)), joinedOn: '2026-05-01' },
      owner.id,
    )
    deliveries.upsertDelivery({
      customerId: early.id,
      date: '2026-06-15',
      quantity: 10,
      userId: owner.id,
    })
    deliveries.upsertDelivery({
      customerId: late.id,
      date: '2026-07-15',
      quantity: 5,
      userId: owner.id,
    })
    const earlyInv = billing.issueInvoice(
      billing.generateInvoice(early.id, '2026-06', { issueDate: '2026-07-01' }, owner.id).id,
      owner.id,
    )
    const lateInv = billing.issueInvoice(
      billing.generateInvoice(late.id, '2026-07', { issueDate: '2026-07-31' }, owner.id).id,
      owner.id,
    )
    expect(earlyInv.dueDate).toBe('2026-07-01')
    expect(lateInv.dueDate).toBe('2026-07-31')

    const report = receivables.report('2026-08-01')
    const earlyRow = report.outstanding.find((r) => r.customerId === early.id)
    const lateRow = report.outstanding.find((r) => r.customerId === late.id)
    expect(earlyRow?.ageingBucket).toBe('31-60')
    expect(lateRow?.ageingBucket).toBe('1-30')
    expect(report.bucketTotals['31-60']).toBeGreaterThanOrEqual(earlyRow!.balance)
    expect(report.bucketTotals['1-30']).toBeGreaterThanOrEqual(lateRow!.balance)
  })

  it('11. recalculateLedger over seeded data is a no-op', async () => {
    const { customers, deliveries, billing, ledger, owner } = await setup()
    const c = customers.create(
      {
        name: 'Recalc',
        openingBalance: Number(toPaisa(500)),
        openingAsOf: '2026-06-01',
        rate: Number(toPaisa(60)),
      },
      owner.id,
    )
    deliveries.upsertDelivery({
      customerId: c.id,
      date: '2026-07-10',
      quantity: 3,
      userId: owner.id,
    })
    billing.issueInvoice(billing.generateInvoice(c.id, '2026-07', {}, owner.id).id, owner.id)
    const result = ledger.recalculateLedger(c.id)
    expect(result.changed).toBe(0)
  })

  it('never double-counts opening into invoice ledger entry', async () => {
    const { customers, deliveries, billing, ledger, db, owner } = await setup()
    const c = customers.create(
      {
        name: 'No Double',
        openingBalance: Number(toPaisa(5000)),
        openingAsOf: '2026-06-30',
        rate: Number(toPaisa(60)),
      },
      owner.id,
    )
    deliveries.upsertDelivery({
      customerId: c.id,
      date: '2026-07-01',
      quantity: 1,
      userId: owner.id,
    })
    const inv = billing.issueInvoice(
      billing.generateInvoice(c.id, '2026-07', {}, owner.id).id,
      owner.id,
    )
    const invoiceEntry = db
      .select()
      .from(ledgerEntries)
      .where(and(eq(ledgerEntries.customerId, c.id), eq(ledgerEntries.entryType, 'invoice')))
      .get()!
    // Classic bug would debit total_payable (5060); correct is invoice_total (60)
    expect(invoiceEntry.debit).toBe(inv.invoiceTotal)
    expect(invoiceEntry.debit).not.toBe(inv.totalPayable)
    expect(Number(ledger.getBalance(c.id))).toBe(Number(toPaisa(5060)))
  })

  it('closed period blocks generate/issue/void unless forceClosedPeriod', async () => {
    const { customers, deliveries, billing, period, owner } = await setup()
    const c = customers.create(
      { name: 'Locked Bill', rate: Number(toPaisa(60)), joinedOn: '2026-06-01' },
      owner.id,
    )
    deliveries.upsertDelivery({
      customerId: c.id,
      date: '2026-07-10',
      quantity: 2,
      userId: owner.id,
    })
    period.close('2026-07', owner.id)

    expect(() => billing.generateInvoice(c.id, '2026-07', {}, owner.id)).toThrow(AppError)
    try {
      billing.generateInvoice(c.id, '2026-07', {}, owner.id)
    } catch (e) {
      expect((e as AppError).code).toBe('PERIOD_LOCKED')
    }

    const draft = billing.generateInvoice(c.id, '2026-07', { forceClosedPeriod: true }, owner.id)
    expect(() => billing.issueInvoice(draft.id, owner.id)).toThrow(AppError)
    const issued = billing.issueInvoice(draft.id, owner.id, { forceClosedPeriod: true })
    expect(issued.status).toBe('issued')

    expect(() => billing.voidInvoice(issued.id, 'oops', owner.id)).toThrow(AppError)
    try {
      billing.voidInvoice(issued.id, 'oops', owner.id)
    } catch (e) {
      expect((e as AppError).code).toBe('PERIOD_LOCKED')
    }
    const voided = billing.voidInvoice(issued.id, 'Correction', owner.id, {
      forceClosedPeriod: true,
    })
    expect(voided.status).toBe('void')
    expect(voided.lines.length).toBeGreaterThan(0)
  })

  it('revenueAccrual excludes drafts', async () => {
    const { customers, deliveries, billing, owner } = await setup()
    const c = customers.create(
      { name: 'Draft Rev', rate: Number(toPaisa(50)), joinedOn: '2026-06-01' },
      owner.id,
    )
    deliveries.upsertDelivery({
      customerId: c.id,
      date: '2026-07-08',
      quantity: 4,
      userId: owner.id,
    })
    const draft = billing.generateInvoice(c.id, '2026-07', {}, owner.id)
    expect(draft.invoiceTotal).toBe(Number(toPaisa(200)))
    expect(billing.revenueAccrual('2026-07')).toBe(0)

    billing.issueInvoice(draft.id, owner.id)
    expect(billing.revenueAccrual('2026-07')).toBe(Number(toPaisa(200)))
  })

  it('voidPayment soft-voids allocations (keeps history)', async () => {
    const { customers, deliveries, billing, payments, db, owner } = await setup()
    const c = customers.create(
      { name: 'Alloc Hist', rate: Number(toPaisa(100)), joinedOn: '2026-06-01' },
      owner.id,
    )
    deliveries.upsertDelivery({
      customerId: c.id,
      date: '2026-07-01',
      quantity: 3,
      userId: owner.id,
    })
    const inv = billing.issueInvoice(
      billing.generateInvoice(c.id, '2026-07', {}, owner.id).id,
      owner.id,
    )
    const pay = payments.recordPayment(
      {
        customerId: c.id,
        date: '2026-08-01',
        amount: Number(toPaisa(200)),
        method: 'cash',
      },
      owner.id,
    )
    expect(pay.allocations).toHaveLength(1)
    expect(pay.allocations[0]!.invoiceId).toBe(inv.id)

    payments.voidPayment(pay.id, 'Misposted', owner.id)
    const rows = db
      .select()
      .from(paymentAllocations)
      .where(eq(paymentAllocations.paymentId, pay.id))
      .all()
    expect(rows).toHaveLength(1)
    expect(rows[0]!.status).toBe('void')

    const history = billing.getById(inv.id).paymentHistory
    expect(history.some((h) => h.paymentId === pay.id && h.allocationStatus === 'void')).toBe(true)
  })

  it('reallocate supersedes prior allocation rows', async () => {
    const { customers, deliveries, billing, payments, db, owner } = await setup()
    const c = customers.create(
      { name: 'Realloc', rate: Number(toPaisa(100)), joinedOn: '2026-05-01' },
      owner.id,
    )
    deliveries.upsertDelivery({
      customerId: c.id,
      date: '2026-06-10',
      quantity: 2,
      userId: owner.id,
    })
    deliveries.upsertDelivery({
      customerId: c.id,
      date: '2026-07-10',
      quantity: 2,
      userId: owner.id,
    })
    const inv1 = billing.issueInvoice(
      billing.generateInvoice(c.id, '2026-06', {}, owner.id).id,
      owner.id,
    )
    const inv2 = billing.issueInvoice(
      billing.generateInvoice(c.id, '2026-07', {}, owner.id).id,
      owner.id,
    )
    const pay = payments.recordPayment(
      {
        customerId: c.id,
        date: '2026-08-01',
        amount: Number(toPaisa(200)),
        method: 'cash',
        allocations: [{ invoiceId: inv1.id, amount: Number(toPaisa(200)) }],
      },
      owner.id,
    )

    payments.reallocate(pay.id, [{ invoiceId: inv2.id, amount: Number(toPaisa(200)) }], owner.id)
    const rows = db
      .select()
      .from(paymentAllocations)
      .where(eq(paymentAllocations.paymentId, pay.id))
      .all()
    expect(rows).toHaveLength(2)
    expect(rows.filter((r) => r.status === 'superseded')).toHaveLength(1)
    expect(rows.filter((r) => r.status === 'active')).toHaveLength(1)
    expect(rows.find((r) => r.status === 'active')!.invoiceId).toBe(inv2.id)
  })
})
