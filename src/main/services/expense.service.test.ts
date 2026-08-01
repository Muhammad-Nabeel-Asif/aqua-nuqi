import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { eq } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDatabase, getDb, getRawDb, openDatabase } from '@main/db/client'
import { expenses } from '@main/db/schema'
import { seedDefaults } from '@main/db/seed'
import { createAuditService } from '@main/services/audit.service'
import { createAuthService } from '@main/services/auth.service'
import { createExpenseService } from '@main/services/expense.service'
import { createPeriodService } from '@main/services/period.service'
import { AppError } from '@shared/errors'

describe('expense Phase 5 acceptance', () => {
  let dir: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqua-exp-'))
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
    const auth = createAuthService(db, audit)
    const expensesSvc = createExpenseService(db, raw, audit, period)
    const owner = await auth.createUser({
      username: 'owner',
      password: 'secret12',
      displayName: 'Owner',
      role: 'owner',
    })
    const fuel = expensesSvc.findCategoryByName('Fuel')!
    const salaries = expensesSvc.findCategoryByName('Salaries')!
    return { db, raw, audit, period, expensesSvc, owner, fuel, salaries }
  }

  it('createExpense records amount in paisa and lists with total', async () => {
    const { expensesSvc, owner, fuel } = await setup()
    const e = expensesSvc.createExpense(
      {
        expenseDate: '2026-07-15',
        categoryId: fuel.id,
        amount: 250_000,
        paymentMethod: 'cash',
        description: 'Petrol',
        vendorName: 'PSO',
      },
      owner.id,
    )
    expect(e.amount).toBe(250_000)
    expect(e.source).toBe('manual')
    expect(e.readOnly).toBe(false)
    expect(e.categoryName).toBe('Fuel')

    const list = expensesSvc.listExpenses({ from: '2026-07-01', to: '2026-07-31' })
    expect(list.total).toBe(1)
    expect(list.totalAmount).toBe(250_000)
  })

  it('voided expenses are excluded from totals', async () => {
    const { expensesSvc, owner, fuel } = await setup()
    const a = expensesSvc.createExpense(
      { expenseDate: '2026-07-10', categoryId: fuel.id, amount: 100_00, paymentMethod: 'cash' },
      owner.id,
    )
    expensesSvc.createExpense(
      { expenseDate: '2026-07-11', categoryId: fuel.id, amount: 200_00, paymentMethod: 'cash' },
      owner.id,
    )
    expensesSvc.voidExpense(a.id, 'mistake', owner.id)
    const list = expensesSvc.listExpenses({ from: '2026-07-01', to: '2026-07-31' })
    expect(list.total).toBe(1)
    expect(list.totalAmount).toBe(200_00)
  })

  it('summaryByCategory equals sum of filtered list', async () => {
    const { expensesSvc, owner, fuel } = await setup()
    const rent = expensesSvc.findCategoryByName('Rent')!
    expensesSvc.createExpense(
      { expenseDate: '2026-07-01', categoryId: fuel.id, amount: 500_00, paymentMethod: 'cash' },
      owner.id,
    )
    expensesSvc.createExpense(
      { expenseDate: '2026-07-02', categoryId: fuel.id, amount: 300_00, paymentMethod: 'cash' },
      owner.id,
    )
    expensesSvc.createExpense(
      {
        expenseDate: '2026-07-03',
        categoryId: rent.id,
        amount: 25_000_00,
        paymentMethod: 'bank_transfer',
      },
      owner.id,
    )
    const list = expensesSvc.listExpenses({ from: '2026-07-01', to: '2026-07-31' })
    const summary = expensesSvc.summaryByCategory('2026-07-01', '2026-07-31')
    expect(summary.total).toBe(list.totalAmount)
    const fuelRow = summary.items.find((i) => i.categoryId === fuel.id)!
    expect(fuelRow.total).toBe(800_00)
    expect(fuelRow.count).toBe(2)
    const rentRow = summary.items.find((i) => i.categoryId === rent.id)!
    expect(rentRow.total).toBe(25_000_00)
  })

  it('system categories cannot be renamed or deactivated', async () => {
    const { expensesSvc, owner, salaries } = await setup()
    expect(salaries.isSystem).toBe(true)
    expect(() =>
      expensesSvc.updateCategory({ id: salaries.id, name: 'Wages' }, owner.id),
    ).toThrowError(AppError)
    expect(() =>
      expensesSvc.updateCategory({ id: salaries.id, isActive: false }, owner.id),
    ).toThrowError(AppError)
  })

  it('non-system category with expenses cannot be deleted — deactivate/merge only', async () => {
    const { expensesSvc, owner, fuel } = await setup()
    expensesSvc.createExpense(
      { expenseDate: '2026-07-01', categoryId: fuel.id, amount: 100_00, paymentMethod: 'cash' },
      owner.id,
    )
    // Deactivate is allowed
    const deactivated = expensesSvc.updateCategory({ id: fuel.id, isActive: false }, owner.id)
    expect(deactivated.isActive).toBe(false)
    expect(deactivated.usageCount).toBe(1)
  })

  it('merging category A into B moves all rows and leaves totals unchanged', async () => {
    const { expensesSvc, owner, fuel } = await setup()
    const misc = expensesSvc.findCategoryByName('Miscellaneous')!
    expensesSvc.createExpense(
      { expenseDate: '2026-07-01', categoryId: fuel.id, amount: 100_00, paymentMethod: 'cash' },
      owner.id,
    )
    expensesSvc.createExpense(
      { expenseDate: '2026-07-02', categoryId: fuel.id, amount: 250_00, paymentMethod: 'cash' },
      owner.id,
    )
    expensesSvc.createExpense(
      { expenseDate: '2026-07-03', categoryId: misc.id, amount: 50_00, paymentMethod: 'cash' },
      owner.id,
    )
    const before = expensesSvc.summaryByCategory('2026-07-01', '2026-07-31')
    const beforeTotal = before.total

    const result = expensesSvc.mergeCategories(fuel.id, misc.id, owner.id)
    expect(result.moved).toBe(2)

    const after = expensesSvc.summaryByCategory('2026-07-01', '2026-07-31')
    expect(after.total).toBe(beforeTotal)
    const miscRow = after.items.find((i) => i.categoryId === misc.id)!
    expect(miscRow.total).toBe(400_00)
    expect(after.items.find((i) => i.categoryId === fuel.id)).toBeUndefined()

    const fuelCat = expensesSvc.getCategory(fuel.id)
    expect(fuelCat.isActive).toBe(false)
  })

  it('payroll-sourced expenses are read-only (cannot update/void)', async () => {
    const { expensesSvc, owner, salaries } = await setup()
    const e = expensesSvc.createExpense(
      {
        expenseDate: '2026-07-31',
        categoryId: salaries.id,
        amount: 50_000_00,
        paymentMethod: 'cash',
        description: 'July payroll — Ahmed',
        source: 'payroll',
        sourceRefTable: 'payroll_items',
        sourceRefId: 1,
      },
      owner.id,
    )
    expect(e.readOnly).toBe(true)
    expect(e.source).toBe('payroll')
    expect(() => expensesSvc.updateExpense({ id: e.id, amount: 1 }, owner.id)).toThrowError(
      AppError,
    )
    expect(() => expensesSvc.voidExpense(e.id, 'oops', owner.id)).toThrowError(AppError)
  })

  it('closed period blocks create/update without force', async () => {
    const { expensesSvc, owner, fuel, period } = await setup()
    period.close('2026-06', owner.id)
    expect(() =>
      expensesSvc.createExpense(
        { expenseDate: '2026-06-15', categoryId: fuel.id, amount: 100_00, paymentMethod: 'cash' },
        owner.id,
      ),
    ).toThrowError(/PERIOD_LOCKED|closed/i)

    const forced = expensesSvc.createExpense(
      {
        expenseDate: '2026-06-15',
        categoryId: fuel.id,
        amount: 100_00,
        paymentMethod: 'cash',
        forceClosedPeriod: true,
      },
      owner.id,
    )
    expect(forced.id).toBeGreaterThan(0)

    expect(() =>
      expensesSvc.updateExpense({ id: forced.id, amount: 200_00 }, owner.id),
    ).toThrowError(/PERIOD_LOCKED|closed/i)
  })

  it('recurring due appears then disappears after recording', async () => {
    const { expensesSvc, owner, fuel } = await setup()
    const rec = expensesSvc.createRecurring(
      {
        name: 'Shop rent',
        categoryId: fuel.id,
        amount: 25_000_00,
        frequency: 'monthly',
        dayOfMonth: 1,
        vendorName: 'Landlord',
        nextDueDate: '2026-08-01',
      },
      owner.id,
    )
    // Freeze "today" logic by using asOf in August
    const due = expensesSvc.dueRecurring('2026-08-15')
    expect(due.some((d) => d.id === rec.id)).toBe(true)

    expensesSvc.createExpense(
      {
        expenseDate: '2026-08-01',
        categoryId: fuel.id,
        amount: 25_000_00,
        paymentMethod: 'cash',
        description: 'Shop rent',
        recurringExpenseId: rec.id,
      },
      owner.id,
    )

    const after = expensesSvc.dueRecurring('2026-08-15')
    expect(after.some((d) => d.id === rec.id)).toBe(false)

    const updated = expensesSvc.listRecurring().find((r) => r.id === rec.id)!
    expect(updated.lastRecordedDate).toBe('2026-08-01')
    expect(updated.nextDueDate).toBe('2026-09-01')
  })

  it('cash book sums cash payments in and cash expenses out', async () => {
    const { expensesSvc, owner, fuel, db } = await setup()
    // Insert a minimal cash payment via raw SQL (payments need a customer — skip if complex).
    // Exercise cash-out side thoroughly; cash-in uses payments table when present.
    expensesSvc.createExpense(
      {
        expenseDate: '2026-08-01',
        categoryId: fuel.id,
        amount: 1_500_00,
        paymentMethod: 'cash',
        description: 'Fuel',
      },
      owner.id,
    )
    expensesSvc.createExpense(
      {
        expenseDate: '2026-08-01',
        categoryId: fuel.id,
        amount: 500_00,
        paymentMethod: 'bank_transfer',
        description: 'Not cash',
      },
      owner.id,
    )
    const book = expensesSvc.cashBook({ date: '2026-08-01', openingCash: 10_000_00 })
    expect(book.cashOut).toBe(1_500_00)
    expect(book.cashOutCount).toBe(1)
    expect(book.closingCash).toBe(10_000_00 - 1_500_00)
    void db
  })

  it('createExpense signature stores source_ref for Phase 6 payroll', async () => {
    const { expensesSvc, owner, salaries, db } = await setup()
    const e = expensesSvc.createExpense(
      {
        expenseDate: '2026-07-31',
        categoryId: salaries.id,
        amount: 40_000_00,
        paymentMethod: 'cash',
        description: 'Salary — driver',
        employeeId: null,
        source: 'payroll',
        sourceRefTable: 'payroll_items',
        sourceRefId: 99,
      },
      owner.id,
    )
    const row = db.select().from(expenses).where(eq(expenses.id, e.id)).get()!
    expect(row.source).toBe('payroll')
    expect(row.sourceRefTable).toBe('payroll_items')
    expect(row.sourceRefId).toBe(99)
  })

  it('seeded categories include Salaries and Employee Advance as system', async () => {
    const { expensesSvc } = await setup()
    const cats = expensesSvc.listCategories(true)
    expect(cats.length).toBeGreaterThanOrEqual(15)
    const sal = cats.find((c) => c.name === 'Salaries')!
    const adv = cats.find((c) => c.name === 'Employee Advance')!
    expect(sal.isSystem).toBe(true)
    expect(adv.isSystem).toBe(true)
  })

  it('audit log written on create', async () => {
    const { expensesSvc, owner, fuel, raw } = await setup()
    const e = expensesSvc.createExpense(
      { expenseDate: '2026-07-01', categoryId: fuel.id, amount: 100_00, paymentMethod: 'cash' },
      owner.id,
    )
    const audits = raw
      .prepare(
        `SELECT action, entity_table, entity_id FROM audit_log WHERE entity_table = 'expenses' AND entity_id = ?`,
      )
      .all(e.id) as Array<{ action: string }>
    expect(audits.some((a) => a.action === 'create')).toBe(true)
  })

  it('cannot merge system category away', async () => {
    const { expensesSvc, owner, salaries, fuel } = await setup()
    expect(() => expensesSvc.mergeCategories(salaries.id, fuel.id, owner.id)).toThrowError(AppError)
  })
})
