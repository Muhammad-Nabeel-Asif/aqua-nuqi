import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { eq } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDatabase, getDb, getRawDb, openDatabase } from '@main/db/client'
import {
  deliveries,
  expenses as expensesTable,
  payrollItems,
  products,
  salaryAdvances,
} from '@main/db/schema'
import { seedDefaults } from '@main/db/seed'
import { newUuid } from '@main/lib/ids'
import { createAttendanceService } from '@main/services/attendance.service'
import { createAuditService } from '@main/services/audit.service'
import { createAuthService } from '@main/services/auth.service'
import { createEmployeeService } from '@main/services/employee.service'
import { createExpenseService } from '@main/services/expense.service'
import { createPayrollService, computePayrollMath } from '@main/services/payroll.service'
import { createPeriodService } from '@main/services/period.service'
import { createSettingsService } from '@main/services/settings.service'
import { nowIsoUtc } from '@shared/date'
import { AppError } from '@shared/errors'
import { toPaisa } from '@shared/money'
import { salarySlipPdfFileName } from '@shared/slug'

describe('Phase 6 payroll acceptance', () => {
  let dir: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqua-pay-'))
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
    const period = createPeriodService(db, audit)
    const settings = createSettingsService(db, audit)
    const auth = createAuthService(db, audit)
    const expensesSvc = createExpenseService(db, raw, audit, period)
    const employeesSvc = createEmployeeService(db, audit, period)
    const attendance = createAttendanceService(db, audit, period, settings)
    const payroll = createPayrollService(db, audit, period, employeesSvc, attendance, expensesSvc)
    const owner = await auth.createUser({
      username: 'owner',
      password: 'secret12',
      displayName: 'Owner',
      role: 'owner',
    })
    return {
      db,
      raw,
      audit,
      period,
      settings,
      expensesSvc,
      employeesSvc,
      attendance,
      payroll,
      owner,
    }
  }

  it('AC1: dated salary — August uses 30k, September uses 35k', async () => {
    const { employeesSvc, attendance, payroll, owner } = await setup()
    const emp = employeesSvc.create(
      {
        name: 'Ali',
        role: 'delivery',
        joiningDate: '2026-01-01',
        salaryType: 'monthly',
        baseAmount: Number(toPaisa(30_000)),
        salaryEffectiveFrom: '2026-01-01',
      },
      owner.id,
    )
    employeesSvc.changeSalary({
      employeeId: emp.id,
      salaryType: 'monthly',
      baseAmount: Number(toPaisa(35_000)),
      effectiveFrom: '2026-09-01',
      reason: 'Raise',
      userId: owner.id,
    })

    attendance.markAllPresent({ period: '2026-08' }, owner.id)
    attendance.markAllPresent({ period: '2026-09' }, owner.id)

    const aug = payroll.generate({ period: '2026-08' }, owner.id)
    const sep = payroll.generate({ period: '2026-09' }, owner.id)
    expect(aug.items[0]!.baseAmount).toBe(Number(toPaisa(30_000)))
    expect(sep.items[0]!.baseAmount).toBe(Number(toPaisa(35_000)))
  })

  it('AC3: 2 absences on fixed_26 with Rs 26,000 deducts exactly Rs 2,000', async () => {
    const { employeesSvc, attendance, payroll, owner, settings } = await setup()
    expect(settings.get('payroll.workingDaysBasis')).toBe('fixed_26')
    const emp = employeesSvc.create(
      {
        name: 'Bilal',
        salaryType: 'monthly',
        baseAmount: Number(toPaisa(26_000)),
        salaryEffectiveFrom: '2026-07-01',
        joiningDate: '2026-07-01',
      },
      owner.id,
    )
    attendance.markAllPresent({ period: '2026-07' }, owner.id)
    attendance.setOne({ employeeId: emp.id, date: '2026-07-05', status: 'absent' }, owner.id)
    attendance.setOne({ employeeId: emp.id, date: '2026-07-12', status: 'absent' }, owner.id)

    const run = payroll.generate({ period: '2026-07' }, owner.id)
    const item = run.items.find((i) => i.employeeId === emp.id)!
    expect(item.workingDays).toBe(26)
    expect(item.daysAbsent).toBe(2)
    expect(item.absenceDeduction).toBe(Number(toPaisa(2_000)))
  })

  it('AC4: commission = bottles × rate matching deliveries query', async () => {
    const { db, employeesSvc, attendance, payroll, owner } = await setup()
    const emp = employeesSvc.create(
      {
        name: 'Driver',
        role: 'delivery',
        salaryType: 'monthly_plus_commission',
        baseAmount: Number(toPaisa(20_000)),
        commissionPerBottle: Number(toPaisa(2)),
        salaryEffectiveFrom: '2026-07-01',
        joiningDate: '2026-07-01',
      },
      owner.id,
    )
    attendance.markAllPresent({ period: '2026-07' }, owner.id)

    const product = db.select().from(products).where(eq(products.isDefault, 1)).get()!
    const now = nowIsoUtc()
    const raw = getRawDb()
    raw
      .prepare(
        `INSERT INTO customers (uuid, code, name, customer_type, billing_mode, status, opening_bottles, opening_balance, security_deposit_held, created_at, updated_at)
         VALUES (?, 'C-9001', 'Test Cust', 'residential', 'per_bottle', 'active', 0, 0, 0, ?, ?)`,
      )
      .run(newUuid(), now, now)
    const customerId = (
      raw.prepare(`SELECT id FROM customers WHERE code = 'C-9001'`).get() as { id: number }
    ).id

    // 900 bottles across a few days
    let left = 900
    let day = 1
    while (left > 0) {
      const qty = Math.min(50, left)
      const date = `2026-07-${String(day).padStart(2, '0')}`
      db.insert(deliveries)
        .values({
          uuid: newUuid(),
          customerId,
          productId: product.id,
          deliveryDate: date,
          quantity: qty,
          emptiesCollected: qty,
          rate: 6000,
          amount: qty * 6000,
          isFree: 0,
          employeeId: emp.id,
          cashCollected: 0,
          status: 'recorded',
          slotKey: '',
          createdAt: now,
          updatedAt: now,
        })
        .run()
      left -= qty
      day += 1
    }
    // Delivery with no employee — must NOT count toward commission
    db.insert(deliveries)
      .values({
        uuid: newUuid(),
        customerId,
        productId: product.id,
        deliveryDate: '2026-07-28',
        quantity: 100,
        emptiesCollected: 100,
        rate: 6000,
        amount: 600_000,
        isFree: 0,
        employeeId: null,
        cashCollected: 0,
        status: 'recorded',
        slotKey: '',
        createdAt: now,
        updatedAt: now,
      })
      .run()

    const run = payroll.generate({ period: '2026-07' }, owner.id)
    const item = run.items.find((i) => i.employeeId === emp.id)!
    expect(item.bottlesDelivered).toBe(900)
    expect(item.commissionAmount).toBe(Number(toPaisa(1_800)))
  })

  it('AC5 / §6.5: Rs 30k salary + Rs 10k advance → Advance 10k + Salaries 20k, no double-count', async () => {
    const { employeesSvc, attendance, payroll, expensesSvc, owner, db } = await setup()
    const emp = employeesSvc.create(
      {
        name: 'Cash Test',
        salaryType: 'monthly',
        baseAmount: Number(toPaisa(30_000)),
        salaryEffectiveFrom: '2026-07-01',
        joiningDate: '2026-07-01',
      },
      owner.id,
    )
    attendance.markAllPresent({ period: '2026-07' }, owner.id)

    const advance = payroll.createAdvance(
      {
        employeeId: emp.id,
        advanceDate: '2026-07-10',
        amount: Number(toPaisa(10_000)),
        reason: 'Mid-month',
      },
      owner.id,
    )
    expect(advance.expenseId).not.toBeNull()

    const advExp = expensesSvc.getById(advance.expenseId!)
    expect(advExp.categoryName).toBe('Employee Advance')
    expect(advExp.amount).toBe(Number(toPaisa(10_000)))
    expect(advExp.source).toBe('payroll')
    expect(advExp.readOnly).toBe(true)

    const { run } = payroll.generate({ period: '2026-07' }, owner.id)
    const finalized = payroll.finalize({ id: run.id, paymentDate: '2026-07-31' }, owner.id)

    const item = finalized.items.find((i) => i.employeeId === emp.id)!
    expect(item.advancesDeducted).toBe(Number(toPaisa(10_000)))
    expect(item.netPayable).toBe(Number(toPaisa(20_000)))
    expect(finalized.salariesExpenseTotal).toBe(Number(toPaisa(20_000)))

    const salaryCat = expensesSvc.findCategoryByName('Salaries')!
    const advCat = expensesSvc.findCategoryByName('Employee Advance')!
    const periodExpenses = db
      .select()
      .from(expensesTable)
      .all()
      .filter(
        (e) =>
          e.status === 'active' && e.expenseDate >= '2026-07-01' && e.expenseDate <= '2026-07-31',
      )

    const advanceTotal = periodExpenses
      .filter((e) => e.categoryId === advCat.id)
      .reduce((s, e) => s + e.amount, 0)
    const salariesTotal = periodExpenses
      .filter((e) => e.categoryId === salaryCat.id)
      .reduce((s, e) => s + e.amount, 0)

    expect(advanceTotal).toBe(Number(toPaisa(10_000)))
    expect(salariesTotal).toBe(Number(toPaisa(20_000)))
    expect(advanceTotal + salariesTotal).toBe(Number(toPaisa(30_000)))

    // "P&L" category totals — same numbers, counted once
    const summary = expensesSvc.summaryByCategory('2026-07-01', '2026-07-31')
    const advRow = summary.items.find((i) => i.categoryName === 'Employee Advance')
    const salRow = summary.items.find((i) => i.categoryName === 'Salaries')
    expect(advRow?.total).toBe(Number(toPaisa(10_000)))
    expect(salRow?.total).toBe(Number(toPaisa(20_000)))
    expect((advRow?.total ?? 0) + (salRow?.total ?? 0)).toBe(Number(toPaisa(30_000)))
  })

  it('AC6: finalise creates one Salaries expense per paid employee, read-only', async () => {
    const { employeesSvc, attendance, payroll, expensesSvc, owner } = await setup()
    const a = employeesSvc.create(
      {
        name: 'A',
        baseAmount: Number(toPaisa(15_000)),
        salaryEffectiveFrom: '2026-07-01',
        joiningDate: '2026-07-01',
      },
      owner.id,
    )
    const b = employeesSvc.create(
      {
        name: 'B',
        baseAmount: Number(toPaisa(18_000)),
        salaryEffectiveFrom: '2026-07-01',
        joiningDate: '2026-07-01',
      },
      owner.id,
    )
    attendance.markAllPresent({ period: '2026-07' }, owner.id)
    const { run } = payroll.generate({ period: '2026-07' }, owner.id)
    const before = expensesSvc.listExpenses({ from: '2026-07-01', to: '2026-07-31' }).totalAmount
    const fin = payroll.finalize({ id: run.id }, owner.id)
    expect(fin.items.filter((i) => i.expenseId != null)).toHaveLength(2)
    const after = expensesSvc.listExpenses({ from: '2026-07-01', to: '2026-07-31' })
    expect(after.totalAmount - before).toBe(Number(toPaisa(15_000)) + Number(toPaisa(18_000)))

    const sal = expensesSvc.getById(fin.items.find((i) => i.employeeId === a.id)!.expenseId!)
    expect(sal.readOnly).toBe(true)
    expect(sal.source).toBe('payroll')
    expect(() => expensesSvc.voidExpense(sal.id, 'nope', owner.id)).toThrow(AppError)
    void b
  })

  it('AC7: voiding finalised run reverses Salaries expenses and un-settles advances', async () => {
    const { employeesSvc, attendance, payroll, expensesSvc, owner } = await setup()
    const emp = employeesSvc.create(
      {
        name: 'Void Me',
        baseAmount: Number(toPaisa(25_000)),
        salaryEffectiveFrom: '2026-07-01',
        joiningDate: '2026-07-01',
      },
      owner.id,
    )
    attendance.markAllPresent({ period: '2026-07' }, owner.id)
    payroll.createAdvance(
      { employeeId: emp.id, advanceDate: '2026-07-05', amount: Number(toPaisa(5_000)) },
      owner.id,
    )
    const { run } = payroll.generate({ period: '2026-07' }, owner.id)
    const fin = payroll.finalize({ id: run.id }, owner.id)
    const salExpenseId = fin.items[0]!.expenseId!
    payroll.voidRun(run.id, 'mistake', owner.id)

    expect(expensesSvc.getById(salExpenseId).status).toBe('void')
    const adv = payroll.listAdvances({ employeeId: emp.id })
    expect(
      adv.items.some((a) => a.status === 'outstanding' && a.amount === Number(toPaisa(5_000))),
    ).toBe(true)
  })

  it('AC8: advance larger than net pay caps deduction and shows warning', async () => {
    const { employeesSvc, attendance, payroll, owner } = await setup()
    const emp = employeesSvc.create(
      {
        name: 'Overdrawn',
        baseAmount: Number(toPaisa(20_000)),
        salaryEffectiveFrom: '2026-07-01',
        joiningDate: '2026-07-01',
      },
      owner.id,
    )
    attendance.markAllPresent({ period: '2026-07' }, owner.id)
    payroll.createAdvance(
      { employeeId: emp.id, advanceDate: '2026-07-02', amount: Number(toPaisa(35_000)) },
      owner.id,
    )
    const { run, items } = payroll.generate({ period: '2026-07' }, owner.id)
    const item = items.find((i) => i.employeeId === emp.id)!
    expect(item.advancesDeducted).toBe(Number(toPaisa(20_000)))
    expect(item.netPayable).toBe(0)
    expect(item.advancesCarryForward).toBe(Number(toPaisa(15_000)))
    expect(item.warning).toMatch(/remain/i)

    payroll.finalize({ id: run.id }, owner.id)
    const still = payroll.listAdvances({ employeeId: emp.id, status: 'outstanding' })
    expect(still.outstandingTotal).toBe(Number(toPaisa(15_000)))
  })

  it('AC10: closed period blocks generate and finalize', async () => {
    const { employeesSvc, attendance, payroll, period, owner } = await setup()
    employeesSvc.create(
      {
        name: 'Locked',
        baseAmount: Number(toPaisa(10_000)),
        salaryEffectiveFrom: '2026-06-01',
        joiningDate: '2026-06-01',
      },
      owner.id,
    )
    attendance.markAllPresent({ period: '2026-06', forceClosedPeriod: true }, owner.id)
    period.close('2026-06', owner.id)
    expect(() => payroll.generate({ period: '2026-06' }, owner.id)).toThrow(AppError)

    // reopen to generate, then close and try finalize
    period.reopen('2026-06', owner.id, 'test')
    const { run } = payroll.generate({ period: '2026-06' }, owner.id)
    period.close('2026-06', owner.id)
    expect(() => payroll.finalize({ id: run.id }, owner.id)).toThrow(AppError)
  })

  it('computePayrollMath unit: absence and advance cap', () => {
    const m = computePayrollMath({
      salaryType: 'monthly',
      baseAmount: 2_600_000,
      workingDays: 26,
      daysPresent: 24,
      daysAbsent: 2,
      commissionPerBottle: 0,
      bottlesDelivered: 0,
      overtimeHours: 0,
      overtimeHourlyRate: 0,
      bonusAmount: 0,
      outstandingAdvances: 5_000_000,
      otherDeductions: 0,
    })
    expect(m.absenceDeduction).toBe(200_000)
    expect(m.netPayable).toBe(0)
    expect(m.advancesDeducted).toBe(2_400_000)
    expect(m.advancesCarryForward).toBe(2_600_000)
  })

  it('review: unmarked attendance does not pay full monthly salary', async () => {
    const { employeesSvc, payroll, owner } = await setup()
    employeesSvc.create(
      {
        name: 'Blank Grid',
        salaryType: 'monthly',
        baseAmount: Number(toPaisa(26_000)),
        salaryEffectiveFrom: '2026-07-01',
        joiningDate: '2026-07-01',
      },
      owner.id,
    )
    // No attendance marks at all
    const { items } = payroll.generate({ period: '2026-07' }, owner.id)
    expect(items[0]!.daysAbsent).toBe(26)
    expect(items[0]!.absenceDeduction).toBe(Number(toPaisa(26_000)))
    expect(items[0]!.netPayable).toBe(0)
  })

  it('review: finalize leaves paidAmount=0; recordPayment / payAll update paid', async () => {
    const { employeesSvc, attendance, payroll, owner } = await setup()
    employeesSvc.create(
      {
        name: 'Partial Pay',
        baseAmount: Number(toPaisa(20_000)),
        salaryEffectiveFrom: '2026-07-01',
        joiningDate: '2026-07-01',
      },
      owner.id,
    )
    attendance.markAllPresent({ period: '2026-07' }, owner.id)
    const { run } = payroll.generate({ period: '2026-07' }, owner.id)
    const fin = payroll.finalize({ id: run.id, paymentDate: '2026-07-31' }, owner.id)
    const item = fin.items[0]!
    expect(item.netPayable).toBe(Number(toPaisa(20_000)))
    expect(item.paidAmount).toBe(0)
    expect(item.paymentDate).toBeNull()
    expect(item.expenseId).not.toBeNull()

    const half = payroll.recordPayment(
      {
        itemId: item.id,
        amount: Number(toPaisa(8_000)),
        paymentDate: '2026-08-02',
        paymentMethod: 'cash',
      },
      owner.id,
    )
    expect(half.paidAmount).toBe(Number(toPaisa(8_000)))
    expect(half.paymentDate).toBe('2026-08-02')

    const paid = payroll.payAll(
      { runId: run.id, paymentDate: '2026-08-05', paymentMethod: 'bank_transfer' },
      owner.id,
    )
    expect(paid[0]!.paidAmount).toBe(Number(toPaisa(20_000)))
    expect(paid[0]!.paymentDate).toBe('2026-08-05')
    expect(paid[0]!.paymentMethod).toBe('bank_transfer')
  })

  it('review: capped advance uses settled_amount; void restores expense + balance', async () => {
    const { employeesSvc, attendance, payroll, expensesSvc, owner, db } = await setup()
    const emp = employeesSvc.create(
      {
        name: 'Cap Void',
        baseAmount: Number(toPaisa(20_000)),
        salaryEffectiveFrom: '2026-07-01',
        joiningDate: '2026-07-01',
      },
      owner.id,
    )
    attendance.markAllPresent({ period: '2026-07' }, owner.id)
    const advance = payroll.createAdvance(
      { employeeId: emp.id, advanceDate: '2026-07-02', amount: Number(toPaisa(35_000)) },
      owner.id,
    )
    const advExpenseId = advance.expenseId!
    const { run } = payroll.generate({ period: '2026-07' }, owner.id)
    payroll.finalize({ id: run.id }, owner.id)

    const rows = db.select().from(salaryAdvances).where(eq(salaryAdvances.employeeId, emp.id)).all()
    expect(rows).toHaveLength(1)
    expect(rows[0]!.amount).toBe(Number(toPaisa(35_000)))
    expect(rows[0]!.settledAmount).toBe(Number(toPaisa(20_000)))
    expect(rows[0]!.status).toBe('outstanding')
    expect(rows[0]!.expenseId).toBe(advExpenseId)
    expect(
      payroll.listAdvances({ employeeId: emp.id, status: 'outstanding' }).outstandingTotal,
    ).toBe(Number(toPaisa(15_000)))

    payroll.voidRun(run.id, 'cap void test', owner.id)
    const after = db.select().from(salaryAdvances).where(eq(salaryAdvances.id, advance.id)).get()!
    expect(after.settledAmount).toBe(0)
    expect(after.status).toBe('outstanding')
    expect(after.amount).toBe(Number(toPaisa(35_000)))
    expect(expensesSvc.getById(advExpenseId).status).toBe('active')
    expect(payroll.listAdvances({ employeeId: emp.id }).outstandingTotal).toBe(
      Number(toPaisa(35_000)),
    )
  })

  it('review: multi-month capped advance — void July leaves August slice only', async () => {
    const { employeesSvc, attendance, payroll, owner, db } = await setup()
    const emp = employeesSvc.create(
      {
        name: 'Two Month Cap',
        baseAmount: Number(toPaisa(20_000)),
        salaryEffectiveFrom: '2026-07-01',
        joiningDate: '2026-07-01',
      },
      owner.id,
    )
    attendance.markAllPresent({ period: '2026-07' }, owner.id)
    attendance.markAllPresent({ period: '2026-08' }, owner.id)
    payroll.createAdvance(
      { employeeId: emp.id, advanceDate: '2026-07-02', amount: Number(toPaisa(35_000)) },
      owner.id,
    )

    const july = payroll.generate({ period: '2026-07' }, owner.id)
    payroll.finalize({ id: july.run.id }, owner.id)
    const aug = payroll.generate({ period: '2026-08' }, owner.id)
    payroll.finalize({ id: aug.run.id }, owner.id)

    const afterBoth = db
      .select()
      .from(salaryAdvances)
      .where(eq(salaryAdvances.employeeId, emp.id))
      .all()
    expect(afterBoth).toHaveLength(1)
    expect(afterBoth[0]!.settledAmount).toBe(Number(toPaisa(35_000)))
    expect(afterBoth[0]!.status).toBe('settled')
    expect(afterBoth[0]!.settledInPayrollItemId).toBe(aug.items[0]!.id)

    payroll.voidRun(july.run.id, 'void earlier month', owner.id)

    const afterVoid = db
      .select()
      .from(salaryAdvances)
      .where(eq(salaryAdvances.employeeId, emp.id))
      .get()!
    expect(afterVoid.settledAmount).toBe(Number(toPaisa(15_000)))
    expect(afterVoid.status).toBe('outstanding')
    expect(afterVoid.settledInPayrollItemId).toBe(aug.items[0]!.id)
    expect(
      payroll.listAdvances({ employeeId: emp.id, status: 'outstanding' }).outstandingTotal,
    ).toBe(Number(toPaisa(20_000)))

    // Regenerating July after void must deduct the July slice again.
    const regen = payroll.generate({ period: '2026-07' }, owner.id)
    const regenItem = regen.items.find((i) => i.employeeId === emp.id)!
    expect(regenItem.advancesDeducted).toBe(Number(toPaisa(20_000)))
    payroll.finalize({ id: regen.run.id }, owner.id)
    const restored = db
      .select()
      .from(salaryAdvances)
      .where(eq(salaryAdvances.employeeId, emp.id))
      .get()!
    expect(restored.settledAmount).toBe(Number(toPaisa(35_000)))
    expect(restored.status).toBe('settled')
  })

  it('review: regenerating from void supersedes items (no hard delete)', async () => {
    const { employeesSvc, attendance, payroll, owner, db } = await setup()
    employeesSvc.create(
      {
        name: 'Regen',
        baseAmount: Number(toPaisa(12_000)),
        salaryEffectiveFrom: '2026-07-01',
        joiningDate: '2026-07-01',
      },
      owner.id,
    )
    attendance.markAllPresent({ period: '2026-07' }, owner.id)
    const first = payroll.generate({ period: '2026-07' }, owner.id)
    const oldItemId = first.items[0]!.id
    payroll.finalize({ id: first.run.id }, owner.id)
    payroll.voidRun(first.run.id, 'regen', owner.id)

    const second = payroll.generate({ period: '2026-07' }, owner.id)
    expect(second.items[0]!.id).not.toBe(oldItemId)
    const oldRow = db.select().from(payrollItems).where(eq(payrollItems.id, oldItemId)).get()
    expect(oldRow).toBeTruthy()
    expect(oldRow!.supersededAt).not.toBeNull()
    const newRow = db
      .select()
      .from(payrollItems)
      .where(eq(payrollItems.id, second.items[0]!.id))
      .get()
    expect(newRow!.supersededAt).toBeNull()
  })

  it('review: absence deduction rounds once (non-divisible base)', () => {
    // Rs 30,000 / 26 × 2 — two-step round = 230770; one-step = 230769
    const m = computePayrollMath({
      salaryType: 'monthly',
      baseAmount: 3_000_000,
      workingDays: 26,
      daysPresent: 24,
      daysAbsent: 2,
      commissionPerBottle: 0,
      bottlesDelivered: 0,
      overtimeHours: 0,
      overtimeHourlyRate: 0,
      bonusAmount: 0,
      outstandingAdvances: 0,
      otherDeductions: 0,
    })
    expect(m.absenceDeduction).toBe(Math.round((3_000_000 * 2) / 26))
    expect(m.absenceDeduction).toBe(230_769)
  })

  it('review: daily wage = rate × days present', async () => {
    const { employeesSvc, attendance, payroll, owner } = await setup()
    const emp = employeesSvc.create(
      {
        name: 'Daily',
        salaryType: 'daily',
        baseAmount: Number(toPaisa(1_000)),
        salaryEffectiveFrom: '2026-07-01',
        joiningDate: '2026-07-01',
      },
      owner.id,
    )
    attendance.markAllPresent({ period: '2026-07' }, owner.id)
    // Mark 3 absences so present = 28 in July
    attendance.setOne({ employeeId: emp.id, date: '2026-07-01', status: 'absent' }, owner.id)
    attendance.setOne({ employeeId: emp.id, date: '2026-07-02', status: 'absent' }, owner.id)
    attendance.setOne({ employeeId: emp.id, date: '2026-07-03', status: 'absent' }, owner.id)
    const { items } = payroll.generate({ period: '2026-07' }, owner.id)
    const item = items.find((i) => i.employeeId === emp.id)!
    expect(item.daysPresent).toBe(28)
    expect(item.baseAmount).toBe(Number(toPaisa(28_000)))
    expect(item.netPayable).toBe(Number(toPaisa(28_000)))
  })

  it('review: waiveAdvance respects period lock', async () => {
    const { employeesSvc, payroll, period, owner } = await setup()
    const emp = employeesSvc.create(
      {
        name: 'Waive Lock',
        baseAmount: Number(toPaisa(10_000)),
        salaryEffectiveFrom: '2026-06-01',
        joiningDate: '2026-06-01',
      },
      owner.id,
    )
    const adv = payroll.createAdvance(
      { employeeId: emp.id, advanceDate: '2026-06-10', amount: Number(toPaisa(1_000)) },
      owner.id,
    )
    period.close('2026-06', owner.id)
    expect(() => payroll.waiveAdvance(adv.id, 'forgive', owner.id)).toThrow(AppError)
    const waived = payroll.waiveAdvance(adv.id, 'forgive', owner.id, { forceClosedPeriod: true })
    expect(waived.status).toBe('waived')
  })

  it('review: salary slip PDF filename convention', () => {
    expect(
      salarySlipPdfFileName({
        period: '2026-07',
        employeeCode: 'E-001',
        employeeName: 'Ali Khan',
      }),
    ).toBe('Salary-2026-07-E-001-Ali-Khan.pdf')
  })
})
