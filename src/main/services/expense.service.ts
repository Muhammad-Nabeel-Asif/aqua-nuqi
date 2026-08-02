import { and, asc, desc, eq, gte, lte, sql } from 'drizzle-orm'
import type { AppDatabase, RawDatabase } from '@main/db/client'
import { expenseCategories, expenses, payments, recurringExpenses } from '@main/db/schema'
import { newUuid } from '@main/lib/ids'
import type {
  CategoryTotalDto,
  CreateExpenseInput,
  ExpenseCategoryDto,
  ExpenseDto,
  ExpensePaymentMethod,
  ExpenseSource,
  ListExpensesInput,
  MonthTotalDto,
  RecurringExpenseDto,
  UpdateExpenseInput,
  VendorTotalDto,
} from '@shared/contracts'
import {
  addBusinessDays,
  addBusinessMonths,
  assertBusinessDate,
  currentPeriod,
  nowIsoUtc,
  periodEnd,
  periodFromDate,
  periodStart,
  todayBusinessDate,
} from '@shared/date'
import { AppError } from '@shared/errors'
import type { AuditService } from './audit.service'
import type { PeriodService } from './period.service'

const SOURCE_EDIT_HINT: Record<string, string> = {
  payroll: 'This expense was created by payroll. Edit it from Employees → Payroll.',
  purchase: 'This expense was created by a bottle purchase. Edit it from Inventory.',
  recurring: 'This expense was recorded from a recurring template.',
}

function tableExists(raw: RawDatabase, name: string): boolean {
  const row = raw
    .prepare(`SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ?`)
    .get(name) as { ok: number } | undefined
  return Boolean(row)
}

function advanceDueDate(
  fromDate: string,
  frequency: 'monthly' | 'quarterly' | 'yearly',
  dayOfMonth: number | null,
): string {
  const months = frequency === 'monthly' ? 1 : frequency === 'quarterly' ? 3 : 12
  let next = addBusinessMonths(fromDate, months)
  if (dayOfMonth != null && dayOfMonth >= 1 && dayOfMonth <= 28) {
    const period = periodFromDate(next)
    next = `${period}-${String(dayOfMonth).padStart(2, '0')}`
  }
  return next
}

/** Same-length inclusive window immediately before `from` (YYYY-MM-DD arithmetic only). */
export function previousEquivalentRange(from: string, to: string): { from: string; to: string } {
  assertBusinessDate(from)
  assertBusinessDate(to)
  if (to < from) {
    throw new AppError('VALIDATION_FAILED', 'Range end must be on or after start')
  }
  let days = 0
  let cursor = from
  while (cursor <= to) {
    days += 1
    cursor = addBusinessDays(cursor, 1)
    if (days > 4000) break
  }
  const prevTo = addBusinessDays(from, -1)
  const prevFrom = addBusinessDays(prevTo, -(days - 1))
  return { from: prevFrom, to: prevTo }
}

export function createExpenseService(
  db: AppDatabase,
  raw: RawDatabase,
  audit: AuditService,
  period: PeriodService,
) {
  // ── Category helpers ────────────────────────────────────────────────

  function categoryUsage(categoryId: number): number {
    return (
      db
        .select({ c: sql<number>`count(*)` })
        .from(expenses)
        .where(and(eq(expenses.categoryId, categoryId), eq(expenses.status, 'active')))
        .get()?.c ?? 0
    )
  }

  function categoryPeriodTotal(categoryId: number, from: string, to: string): number {
    return (
      db
        .select({ s: sql<number>`coalesce(sum(${expenses.amount}), 0)` })
        .from(expenses)
        .where(
          and(
            eq(expenses.categoryId, categoryId),
            eq(expenses.status, 'active'),
            gte(expenses.expenseDate, from),
            lte(expenses.expenseDate, to),
          ),
        )
        .get()?.s ?? 0
    )
  }

  function toCategoryDto(row: typeof expenseCategories.$inferSelect): ExpenseCategoryDto {
    const now = todayBusinessDate()
    const month = currentPeriod()
    const year = now.slice(0, 4)
    let parentName: string | null = null
    if (row.parentId != null) {
      parentName =
        db
          .select({ name: expenseCategories.name })
          .from(expenseCategories)
          .where(eq(expenseCategories.id, row.parentId))
          .get()?.name ?? null
    }
    return {
      id: row.id,
      uuid: row.uuid,
      name: row.name,
      parentId: row.parentId,
      parentName,
      isSystem: row.isSystem === 1,
      sortOrder: row.sortOrder,
      isActive: row.isActive === 1,
      usageCount: categoryUsage(row.id),
      thisMonthTotal: categoryPeriodTotal(row.id, periodStart(month), periodEnd(month)),
      thisYearTotal: categoryPeriodTotal(row.id, `${year}-01-01`, `${year}-12-31`),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }
  }

  function getCategoryRow(id: number) {
    const row = db.select().from(expenseCategories).where(eq(expenseCategories.id, id)).get()
    if (!row) throw new AppError('NOT_FOUND', `Expense category ${id} not found`)
    return row
  }

  function listCategories(includeInactive = false): ExpenseCategoryDto[] {
    const rows = db
      .select()
      .from(expenseCategories)
      .orderBy(asc(expenseCategories.sortOrder), asc(expenseCategories.name))
      .all()
      .filter((r) => includeInactive || r.isActive === 1)
    return rows.map(toCategoryDto)
  }

  function createCategory(
    input: { name: string; parentId?: number | null },
    userId: number,
  ): ExpenseCategoryDto {
    const name = input.name.trim()
    if (!name) throw new AppError('VALIDATION_FAILED', 'Category name is required')
    const clash = db.select().from(expenseCategories).where(eq(expenseCategories.name, name)).get()
    if (clash) throw new AppError('CONFLICT', `Category "${name}" already exists`)

    if (input.parentId != null) {
      const parent = getCategoryRow(input.parentId)
      if (parent.parentId != null) {
        throw new AppError('VALIDATION_FAILED', 'Only one level of parent grouping is allowed')
      }
    }

    const maxSort =
      db
        .select({ m: sql<number>`coalesce(max(${expenseCategories.sortOrder}), -1)` })
        .from(expenseCategories)
        .get()?.m ?? -1

    const now = nowIsoUtc()
    const row = db.transaction((tx) => {
      const inserted = tx
        .insert(expenseCategories)
        .values({
          uuid: newUuid(),
          name,
          parentId: input.parentId ?? null,
          isSystem: 0,
          sortOrder: maxSort + 1,
          isActive: 1,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get()!
      audit.record(
        {
          userId,
          action: 'create',
          entityTable: 'expense_categories',
          entityId: inserted.id,
          summary: `Created expense category "${name}"`,
          after: { id: inserted.id, name },
        },
        tx,
      )
      return inserted
    })
    return toCategoryDto(row)
  }

  function updateCategory(
    input: {
      id: number
      name?: string
      parentId?: number | null
      isActive?: boolean
    },
    userId: number,
  ): ExpenseCategoryDto {
    const before = getCategoryRow(input.id)
    if (before.isSystem === 1 && input.name != null && input.name.trim() !== before.name) {
      throw new AppError('CONFLICT', 'System categories cannot be renamed')
    }
    if (before.isSystem === 1 && input.isActive === false) {
      throw new AppError('CONFLICT', 'System categories cannot be deactivated')
    }
    if (input.parentId != null) {
      if (input.parentId === input.id) {
        throw new AppError('VALIDATION_FAILED', 'A category cannot be its own parent')
      }
      const parent = getCategoryRow(input.parentId)
      if (parent.parentId != null) {
        throw new AppError('VALIDATION_FAILED', 'Only one level of parent grouping is allowed')
      }
    }
    if (input.name != null) {
      const name = input.name.trim()
      const clash = db
        .select()
        .from(expenseCategories)
        .where(eq(expenseCategories.name, name))
        .get()
      if (clash && clash.id !== input.id) {
        throw new AppError('CONFLICT', `Category "${name}" already exists`)
      }
    }

    const now = nowIsoUtc()
    db.transaction((tx) => {
      tx.update(expenseCategories)
        .set({
          name: input.name != null ? input.name.trim() : before.name,
          parentId: input.parentId !== undefined ? input.parentId : before.parentId,
          isActive: input.isActive !== undefined ? (input.isActive ? 1 : 0) : before.isActive,
          updatedAt: now,
        })
        .where(eq(expenseCategories.id, input.id))
        .run()
      audit.record(
        {
          userId,
          action: 'update',
          entityTable: 'expense_categories',
          entityId: input.id,
          summary: `Updated expense category "${before.name}"`,
          before: { name: before.name, isActive: before.isActive, parentId: before.parentId },
          after: {
            name: input.name ?? before.name,
            isActive: input.isActive ?? before.isActive === 1,
            parentId: input.parentId !== undefined ? input.parentId : before.parentId,
          },
        },
        tx,
      )
    })
    return toCategoryDto(getCategoryRow(input.id))
  }

  function reorderCategories(orderedIds: number[], userId: number): void {
    const now = nowIsoUtc()
    db.transaction((tx) => {
      orderedIds.forEach((id, index) => {
        tx.update(expenseCategories)
          .set({ sortOrder: index, updatedAt: now })
          .where(eq(expenseCategories.id, id))
          .run()
      })
      audit.record(
        {
          userId,
          action: 'update',
          entityTable: 'expense_categories',
          summary: `Reordered ${orderedIds.length} expense categories`,
          after: { orderedIds },
        },
        tx,
      )
    })
  }

  function mergeCategories(
    fromId: number,
    intoId: number,
    userId: number,
  ): {
    moved: number
    item: ExpenseCategoryDto
  } {
    if (fromId === intoId) {
      throw new AppError('VALIDATION_FAILED', 'Cannot merge a category into itself')
    }
    const from = getCategoryRow(fromId)
    const into = getCategoryRow(intoId)
    if (from.isSystem === 1) {
      throw new AppError('CONFLICT', 'System categories cannot be merged away')
    }
    if (into.isActive !== 1) {
      throw new AppError('VALIDATION_FAILED', 'Target category must be active')
    }

    const now = nowIsoUtc()
    const moved = db.transaction((tx) => {
      const count =
        tx
          .select({ c: sql<number>`count(*)` })
          .from(expenses)
          .where(eq(expenses.categoryId, fromId))
          .get()?.c ?? 0
      tx.update(expenses)
        .set({ categoryId: intoId, updatedAt: now, updatedBy: userId })
        .where(eq(expenses.categoryId, fromId))
        .run()
      tx.update(recurringExpenses)
        .set({ categoryId: intoId, updatedAt: now })
        .where(eq(recurringExpenses.categoryId, fromId))
        .run()
      tx.update(expenseCategories)
        .set({ isActive: 0, updatedAt: now })
        .where(eq(expenseCategories.id, fromId))
        .run()
      // Re-parent children of the deactivated category onto the target.
      tx.update(expenseCategories)
        .set({ parentId: intoId, updatedAt: now })
        .where(eq(expenseCategories.parentId, fromId))
        .run()
      audit.record(
        {
          userId,
          action: 'update',
          entityTable: 'expense_categories',
          entityId: intoId,
          summary: `Merged category "${from.name}" into "${into.name}" (${count} expenses moved)`,
          before: { fromId, intoId },
          after: { moved: count, deactivatedId: fromId },
        },
        tx,
      )
      return count
    })
    return { moved, item: toCategoryDto(getCategoryRow(intoId)) }
  }

  // ── Expense DTO / CRUD ──────────────────────────────────────────────

  function toExpenseDto(row: typeof expenses.$inferSelect): ExpenseDto {
    const cat = db
      .select({ name: expenseCategories.name })
      .from(expenseCategories)
      .where(eq(expenseCategories.id, row.categoryId))
      .get()
    const source = row.source as ExpenseSource
    return {
      id: row.id,
      uuid: row.uuid,
      expenseDate: row.expenseDate,
      categoryId: row.categoryId,
      categoryName: cat?.name ?? '—',
      amount: row.amount,
      paymentMethod: row.paymentMethod as ExpensePaymentMethod,
      vendorName: row.vendorName,
      description: row.description,
      referenceNo: row.referenceNo,
      attachmentPath: row.attachmentPath,
      employeeId: row.employeeId,
      vehicleId: row.vehicleId,
      source,
      sourceRefTable: row.sourceRefTable,
      sourceRefId: row.sourceRefId,
      status: row.status as 'active' | 'void',
      readOnly: source !== 'manual',
      periodClosed: period.isClosed(periodFromDate(row.expenseDate)),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      createdBy: row.createdBy,
      updatedBy: row.updatedBy,
    }
  }

  function getById(id: number): ExpenseDto {
    const row = db.select().from(expenses).where(eq(expenses.id, id)).get()
    if (!row) throw new AppError('NOT_FOUND', `Expense ${id} not found`)
    return toExpenseDto(row)
  }

  function guardWritable(row: typeof expenses.$inferSelect): void {
    if (row.source !== 'manual') {
      const hint = SOURCE_EDIT_HINT[row.source] ?? 'This expense is system-generated and read-only.'
      throw new AppError('CONFLICT', hint, {
        source: row.source,
        sourceRefTable: row.sourceRefTable,
      })
    }
  }

  function createExpense(
    input: CreateExpenseInput,
    userId: number,
    outerTx?: AppDatabase,
  ): ExpenseDto {
    assertBusinessDate(input.expenseDate)
    if (!input.forceClosedPeriod) {
      period.guardPeriodOpen(input.expenseDate)
    }
    if (input.amount <= 0) {
      throw new AppError('VALIDATION_FAILED', 'Expense amount must be positive')
    }
    const cat = getCategoryRow(input.categoryId)
    if (cat.isActive !== 1) {
      throw new AppError('VALIDATION_FAILED', 'Category is inactive')
    }

    const source: ExpenseSource = input.source ?? 'manual'
    if (source !== 'manual' && (!input.sourceRefTable || input.sourceRefId == null)) {
      // Allow missing refs for flexibility, but payroll/purchase should set them.
    }

    // Link confirmed recurring recordings so void can restore the template due date.
    const sourceRefTable =
      input.sourceRefTable ?? (input.recurringExpenseId != null ? 'recurring_expenses' : null)
    const sourceRefId =
      input.sourceRefId ?? (input.recurringExpenseId != null ? input.recurringExpenseId : null)

    const now = nowIsoUtc()
    const run = (tx: AppDatabase): number => {
      const inserted = tx
        .insert(expenses)
        .values({
          uuid: newUuid(),
          expenseDate: input.expenseDate,
          categoryId: input.categoryId,
          amount: input.amount,
          paymentMethod: input.paymentMethod ?? 'cash',
          vendorName: input.vendorName?.trim() || null,
          description: input.description?.trim() || null,
          referenceNo: input.referenceNo?.trim() || null,
          attachmentPath: input.attachmentPath ?? null,
          employeeId: input.employeeId ?? null,
          vehicleId: input.vehicleId ?? null,
          source,
          sourceRefTable,
          sourceRefId,
          status: 'active',
          createdAt: now,
          updatedAt: now,
          createdBy: userId,
          updatedBy: userId,
        })
        .returning()
        .get()!

      if (input.recurringExpenseId != null) {
        const rec = tx
          .select()
          .from(recurringExpenses)
          .where(eq(recurringExpenses.id, input.recurringExpenseId))
          .get()
        if (rec) {
          const next = advanceDueDate(
            input.expenseDate,
            rec.frequency as 'monthly' | 'quarterly' | 'yearly',
            rec.dayOfMonth,
          )
          tx.update(recurringExpenses)
            .set({
              lastRecordedDate: input.expenseDate,
              nextDueDate: next,
              updatedAt: now,
            })
            .where(eq(recurringExpenses.id, rec.id))
            .run()
        }
      }

      audit.record(
        {
          userId,
          action: 'create',
          entityTable: 'expenses',
          entityId: inserted.id,
          summary: `Expense ${input.amount} on ${input.expenseDate} (${cat.name})`,
          after: {
            id: inserted.id,
            amount: input.amount,
            categoryId: input.categoryId,
            source,
            expenseDate: input.expenseDate,
          },
        },
        tx,
      )
      return inserted.id
    }

    const expenseId = outerTx ? run(outerTx) : db.transaction(run)
    // Within an outer txn, read via the same connection so the new row is visible.
    const row = (outerTx ?? db).select().from(expenses).where(eq(expenses.id, expenseId)).get()
    if (!row) throw new AppError('INTERNAL', `Expense ${expenseId} missing after insert`)
    return toExpenseDto(row)
  }

  /**
   * Void a system-generated expense (payroll / purchase). Used by originating modules only —
   * the public voidExpense path still rejects non-manual sources.
   */
  function voidSystemExpense(
    id: number,
    reason: string,
    userId: number,
    outerTx?: AppDatabase,
    opts: { forceClosedPeriod?: boolean } = {},
  ): ExpenseDto {
    if (!reason.trim()) throw new AppError('VALIDATION_FAILED', 'Void reason is required')
    const row = (outerTx ?? db).select().from(expenses).where(eq(expenses.id, id)).get()
    if (!row) throw new AppError('NOT_FOUND', `Expense ${id} not found`)
    if (row.status === 'void') throw new AppError('CONFLICT', 'Expense already void')
    if (row.source === 'manual') {
      throw new AppError('CONFLICT', 'Use voidExpense for manual expenses')
    }
    if (!opts.forceClosedPeriod) {
      period.guardPeriodOpen(row.expenseDate)
    }

    const now = nowIsoUtc()
    const run = (tx: AppDatabase): void => {
      tx.update(expenses)
        .set({
          status: 'void',
          description: row.description
            ? `${row.description} [voided: ${reason.trim()}]`
            : `[voided: ${reason.trim()}]`,
          updatedAt: now,
          updatedBy: userId,
        })
        .where(eq(expenses.id, id))
        .run()
      audit.record(
        {
          userId,
          action: 'void',
          entityTable: 'expenses',
          entityId: id,
          summary: `Voided system expense #${id}: ${reason.trim()}`,
          before: { amount: row.amount, status: row.status, source: row.source },
          after: { status: 'void', reason: reason.trim() },
        },
        tx,
      )
    }
    if (outerTx) run(outerTx)
    else db.transaction(run)

    const updated = (outerTx ?? db).select().from(expenses).where(eq(expenses.id, id)).get()!
    return toExpenseDto(updated)
  }

  function updateExpense(input: UpdateExpenseInput, userId: number): ExpenseDto {
    const row = db.select().from(expenses).where(eq(expenses.id, input.id)).get()
    if (!row) throw new AppError('NOT_FOUND', `Expense ${input.id} not found`)
    if (row.status === 'void') throw new AppError('CONFLICT', 'Cannot edit a voided expense')
    guardWritable(row)

    const expenseDate = input.expenseDate ?? row.expenseDate
    assertBusinessDate(expenseDate)
    if (!input.forceClosedPeriod) {
      period.guardPeriodOpen(row.expenseDate)
      if (expenseDate !== row.expenseDate) period.guardPeriodOpen(expenseDate)
    }
    if (input.amount != null && input.amount <= 0) {
      throw new AppError('VALIDATION_FAILED', 'Expense amount must be positive')
    }
    if (input.categoryId != null) {
      const cat = getCategoryRow(input.categoryId)
      if (cat.isActive !== 1) throw new AppError('VALIDATION_FAILED', 'Category is inactive')
    }

    const now = nowIsoUtc()
    db.transaction((tx) => {
      tx.update(expenses)
        .set({
          expenseDate,
          categoryId: input.categoryId ?? row.categoryId,
          amount: input.amount ?? row.amount,
          paymentMethod: input.paymentMethod ?? row.paymentMethod,
          vendorName:
            input.vendorName !== undefined ? input.vendorName?.trim() || null : row.vendorName,
          description:
            input.description !== undefined ? input.description?.trim() || null : row.description,
          referenceNo:
            input.referenceNo !== undefined ? input.referenceNo?.trim() || null : row.referenceNo,
          attachmentPath: input.clearAttachment
            ? null
            : input.attachmentPath !== undefined
              ? input.attachmentPath
              : row.attachmentPath,
          employeeId: input.employeeId !== undefined ? input.employeeId : row.employeeId,
          vehicleId: input.vehicleId !== undefined ? input.vehicleId : row.vehicleId,
          updatedAt: now,
          updatedBy: userId,
        })
        .where(eq(expenses.id, input.id))
        .run()
      audit.record(
        {
          userId,
          action: 'update',
          entityTable: 'expenses',
          entityId: input.id,
          summary: `Updated expense #${input.id}`,
          before: {
            amount: row.amount,
            categoryId: row.categoryId,
            expenseDate: row.expenseDate,
          },
          after: {
            amount: input.amount ?? row.amount,
            categoryId: input.categoryId ?? row.categoryId,
            expenseDate,
          },
        },
        tx,
      )
    })
    return getById(input.id)
  }

  function voidExpense(
    id: number,
    reason: string,
    userId: number,
    opts: { forceClosedPeriod?: boolean } = {},
  ): ExpenseDto {
    if (!reason.trim()) throw new AppError('VALIDATION_FAILED', 'Void reason is required')
    const row = db.select().from(expenses).where(eq(expenses.id, id)).get()
    if (!row) throw new AppError('NOT_FOUND', `Expense ${id} not found`)
    if (row.status === 'void') throw new AppError('CONFLICT', 'Expense already void')
    guardWritable(row)
    if (!opts.forceClosedPeriod) {
      period.guardPeriodOpen(row.expenseDate)
    }

    const now = nowIsoUtc()
    db.transaction((tx) => {
      tx.update(expenses)
        .set({
          status: 'void',
          description: row.description
            ? `${row.description} [voided: ${reason.trim()}]`
            : `[voided: ${reason.trim()}]`,
          updatedAt: now,
          updatedBy: userId,
        })
        .where(eq(expenses.id, id))
        .run()

      // Mistyped recurring confirmation: restore the template so it reappears as due.
      if (row.sourceRefTable === 'recurring_expenses' && row.sourceRefId != null) {
        const rec = tx
          .select()
          .from(recurringExpenses)
          .where(eq(recurringExpenses.id, row.sourceRefId))
          .get()
        if (rec && rec.lastRecordedDate === row.expenseDate) {
          const prior = tx
            .select()
            .from(expenses)
            .where(
              and(
                eq(expenses.sourceRefTable, 'recurring_expenses'),
                eq(expenses.sourceRefId, row.sourceRefId),
                eq(expenses.status, 'active'),
              ),
            )
            .all()
            .filter((e) => e.id !== id)
            .sort((a, b) => b.expenseDate.localeCompare(a.expenseDate) || b.id - a.id)[0]
          tx.update(recurringExpenses)
            .set({
              lastRecordedDate: prior?.expenseDate ?? null,
              nextDueDate: row.expenseDate,
              updatedAt: now,
            })
            .where(eq(recurringExpenses.id, row.sourceRefId))
            .run()
        }
      }

      audit.record(
        {
          userId,
          action: 'void',
          entityTable: 'expenses',
          entityId: id,
          summary: `Voided expense #${id}: ${reason.trim()}`,
          before: { amount: row.amount, status: row.status },
          after: { status: 'void', reason: reason.trim() },
        },
        tx,
      )
    })
    return getById(id)
  }

  function filterRows(input: ListExpensesInput): (typeof expenses.$inferSelect)[] {
    let rows = db
      .select()
      .from(expenses)
      .orderBy(desc(expenses.expenseDate), desc(expenses.id))
      .all()

    if (!input.includeVoid) rows = rows.filter((r) => r.status === 'active')
    if (input.from) rows = rows.filter((r) => r.expenseDate >= input.from!)
    if (input.to) rows = rows.filter((r) => r.expenseDate <= input.to!)
    if (input.categoryIds?.length) {
      const set = new Set(input.categoryIds)
      rows = rows.filter((r) => set.has(r.categoryId))
    }
    if (input.paymentMethod) {
      rows = rows.filter((r) => r.paymentMethod === input.paymentMethod)
    }
    if (input.vendor?.trim()) {
      const q = input.vendor.trim().toLowerCase()
      rows = rows.filter((r) => (r.vendorName ?? '').toLowerCase().includes(q))
    }
    if (input.source) rows = rows.filter((r) => r.source === input.source)
    if (input.amountMin != null) rows = rows.filter((r) => r.amount >= input.amountMin!)
    if (input.amountMax != null) rows = rows.filter((r) => r.amount <= input.amountMax!)
    if (input.employeeId != null) rows = rows.filter((r) => r.employeeId === input.employeeId)
    if (input.vehicleId != null) rows = rows.filter((r) => r.vehicleId === input.vehicleId)
    if (input.search?.trim()) {
      const q = input.search.trim().toLowerCase()
      const catNames = new Map(
        db
          .select({ id: expenseCategories.id, name: expenseCategories.name })
          .from(expenseCategories)
          .all()
          .map((c) => [c.id, c.name.toLowerCase()] as const),
      )
      rows = rows.filter((r) => {
        const hay = [
          r.description ?? '',
          r.vendorName ?? '',
          r.referenceNo ?? '',
          catNames.get(r.categoryId) ?? '',
        ]
          .join(' ')
          .toLowerCase()
        return hay.includes(q)
      })
    }

    const sortBy = input.sortBy ?? 'date'
    const dir = input.sortDir === 'asc' ? 1 : -1
    rows = [...rows].sort((a, b) => {
      let cmp = 0
      if (sortBy === 'amount') cmp = a.amount - b.amount
      else if (sortBy === 'vendor') cmp = (a.vendorName ?? '').localeCompare(b.vendorName ?? '')
      else if (sortBy === 'category') cmp = a.categoryId - b.categoryId
      else cmp = a.expenseDate.localeCompare(b.expenseDate)
      return cmp * dir || (b.id - a.id) * dir
    })
    return rows
  }

  function sumActiveInRange(from: string, to: string, extra?: ListExpensesInput): number {
    const rows = filterRows({
      ...extra,
      from,
      to,
      includeVoid: false,
      limit: 5000,
      offset: 0,
    })
    return rows.reduce((s, r) => s + r.amount, 0)
  }

  function listExpenses(input: ListExpensesInput): {
    items: ExpenseDto[]
    total: number
    totalAmount: number
    previousTotalAmount: number
  } {
    const rows = filterRows(input)
    const totalAmount = rows.filter((r) => r.status === 'active').reduce((s, r) => s + r.amount, 0)
    let previousTotalAmount = 0
    if (input.from && input.to) {
      const prev = previousEquivalentRange(input.from, input.to)
      previousTotalAmount = sumActiveInRange(prev.from, prev.to, {
        categoryIds: input.categoryIds,
        paymentMethod: input.paymentMethod,
        vendor: input.vendor,
        source: input.source,
        amountMin: input.amountMin,
        amountMax: input.amountMax,
        search: input.search,
        employeeId: input.employeeId,
        vehicleId: input.vehicleId,
      })
    }
    const offset = input.offset ?? 0
    const limit = input.limit ?? 500
    const page = rows.slice(offset, offset + limit).map(toExpenseDto)
    return { items: page, total: rows.length, totalAmount, previousTotalAmount }
  }

  function summaryByCategory(
    from: string,
    to: string,
  ): {
    items: CategoryTotalDto[]
    total: number
  } {
    assertBusinessDate(from)
    assertBusinessDate(to)
    const rows = filterRows({ from, to, includeVoid: false, limit: 5000 })
    const total = rows.reduce((s, r) => s + r.amount, 0)
    const byCat = new Map<number, { total: number; count: number; name: string }>()
    for (const r of rows) {
      const cur = byCat.get(r.categoryId) ?? {
        total: 0,
        count: 0,
        name: toExpenseDto(r).categoryName,
      }
      cur.total += r.amount
      cur.count += 1
      byCat.set(r.categoryId, cur)
    }
    const items: CategoryTotalDto[] = [...byCat.entries()]
      .map(([categoryId, v]) => ({
        categoryId,
        categoryName: v.name,
        total: v.total,
        count: v.count,
        percent: total > 0 ? Math.round((v.total / total) * 10000) / 100 : 0,
      }))
      .sort((a, b) => b.total - a.total)
    return { items, total }
  }

  function summaryByMonth(from: string, to: string): { items: MonthTotalDto[] } {
    assertBusinessDate(from)
    assertBusinessDate(to)
    const rows = filterRows({ from, to, includeVoid: false, limit: 5000 })
    const byMonth = new Map<string, { total: number; count: number }>()
    for (const r of rows) {
      const p = periodFromDate(r.expenseDate)
      const cur = byMonth.get(p) ?? { total: 0, count: 0 }
      cur.total += r.amount
      cur.count += 1
      byMonth.set(p, cur)
    }
    const items = [...byMonth.entries()]
      .map(([periodKey, v]) => ({ period: periodKey, total: v.total, count: v.count }))
      .sort((a, b) => a.period.localeCompare(b.period))
    return { items }
  }

  function insights(
    from: string,
    to: string,
  ): {
    byCategory: CategoryTotalDto[]
    byMonth: MonthTotalDto[]
    topVendors: VendorTotalDto[]
    total: number
  } {
    const cat = summaryByCategory(from, to)
    // Last 12 months ending at `to`
    const endPeriod = periodFromDate(to)
    const startPeriod = (() => {
      let p = endPeriod
      for (let i = 0; i < 11; i++) {
        const [y, m] = p.split('-').map(Number)
        const d = new Date(y!, m! - 1, 1)
        d.setMonth(d.getMonth() - 1)
        p = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      }
      return p
    })()
    const byMonth = summaryByMonth(periodStart(startPeriod), to).items

    const rows = filterRows({ from, to, includeVoid: false, limit: 5000 })
    const byVendor = new Map<string, { total: number; count: number }>()
    for (const r of rows) {
      const name = (r.vendorName ?? '').trim() || '(no vendor)'
      const cur = byVendor.get(name) ?? { total: 0, count: 0 }
      cur.total += r.amount
      cur.count += 1
      byVendor.set(name, cur)
    }
    const topVendors = [...byVendor.entries()]
      .map(([vendorName, v]) => ({ vendorName, total: v.total, count: v.count }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5)

    return { byCategory: cat.items, byMonth, topVendors, total: cat.total }
  }

  // ── Recurring ───────────────────────────────────────────────────────

  function toRecurringDto(row: typeof recurringExpenses.$inferSelect): RecurringExpenseDto {
    const cat = db
      .select({ name: expenseCategories.name })
      .from(expenseCategories)
      .where(eq(expenseCategories.id, row.categoryId))
      .get()
    const asOf = todayBusinessDate()
    const monthEnd = periodEnd(currentPeriod())
    const isDue =
      row.isActive === 1 &&
      row.nextDueDate <= monthEnd &&
      row.nextDueDate.slice(0, 7) <= asOf.slice(0, 7)
    // Due this month if next_due_date falls in current month (or overdue earlier)
    const dueThisMonth =
      row.isActive === 1 &&
      row.nextDueDate <= monthEnd &&
      (row.lastRecordedDate == null ||
        periodFromDate(row.lastRecordedDate) !== currentPeriod() ||
        row.nextDueDate <= asOf)
    return {
      id: row.id,
      uuid: row.uuid,
      name: row.name,
      categoryId: row.categoryId,
      categoryName: cat?.name ?? '—',
      amount: row.amount,
      frequency: row.frequency as 'monthly' | 'quarterly' | 'yearly',
      dayOfMonth: row.dayOfMonth,
      vendorName: row.vendorName,
      nextDueDate: row.nextDueDate,
      lastRecordedDate: row.lastRecordedDate,
      isActive: row.isActive === 1,
      isDue: dueThisMonth || isDue,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }
  }

  function listRecurring(includeInactive = false): RecurringExpenseDto[] {
    return db
      .select()
      .from(recurringExpenses)
      .orderBy(asc(recurringExpenses.nextDueDate), asc(recurringExpenses.name))
      .all()
      .filter((r) => includeInactive || r.isActive === 1)
      .map(toRecurringDto)
  }

  function createRecurring(
    input: {
      name: string
      categoryId: number
      amount: number
      frequency: 'monthly' | 'quarterly' | 'yearly'
      dayOfMonth?: number | null
      vendorName?: string | null
      nextDueDate: string
    },
    userId: number,
  ): RecurringExpenseDto {
    assertBusinessDate(input.nextDueDate)
    getCategoryRow(input.categoryId)
    if (input.amount <= 0) throw new AppError('VALIDATION_FAILED', 'Amount must be positive')
    const now = nowIsoUtc()
    const row = db.transaction((tx) => {
      const inserted = tx
        .insert(recurringExpenses)
        .values({
          uuid: newUuid(),
          name: input.name.trim(),
          categoryId: input.categoryId,
          amount: input.amount,
          frequency: input.frequency,
          dayOfMonth: input.dayOfMonth ?? null,
          vendorName: input.vendorName?.trim() || null,
          nextDueDate: input.nextDueDate,
          lastRecordedDate: null,
          isActive: 1,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get()!
      audit.record(
        {
          userId,
          action: 'create',
          entityTable: 'recurring_expenses',
          entityId: inserted.id,
          summary: `Created recurring expense "${input.name.trim()}"`,
          after: { id: inserted.id, amount: input.amount, frequency: input.frequency },
        },
        tx,
      )
      return inserted
    })
    return toRecurringDto(row)
  }

  function updateRecurring(
    input: {
      id: number
      name?: string
      categoryId?: number
      amount?: number
      frequency?: 'monthly' | 'quarterly' | 'yearly'
      dayOfMonth?: number | null
      vendorName?: string | null
      nextDueDate?: string
      isActive?: boolean
    },
    userId: number,
  ): RecurringExpenseDto {
    const before = db
      .select()
      .from(recurringExpenses)
      .where(eq(recurringExpenses.id, input.id))
      .get()
    if (!before) throw new AppError('NOT_FOUND', `Recurring expense ${input.id} not found`)
    if (input.nextDueDate) assertBusinessDate(input.nextDueDate)
    if (input.categoryId != null) getCategoryRow(input.categoryId)
    const now = nowIsoUtc()
    db.transaction((tx) => {
      tx.update(recurringExpenses)
        .set({
          name: input.name?.trim() ?? before.name,
          categoryId: input.categoryId ?? before.categoryId,
          amount: input.amount ?? before.amount,
          frequency: input.frequency ?? before.frequency,
          dayOfMonth: input.dayOfMonth !== undefined ? input.dayOfMonth : before.dayOfMonth,
          vendorName:
            input.vendorName !== undefined ? input.vendorName?.trim() || null : before.vendorName,
          nextDueDate: input.nextDueDate ?? before.nextDueDate,
          isActive: input.isActive !== undefined ? (input.isActive ? 1 : 0) : before.isActive,
          updatedAt: now,
        })
        .where(eq(recurringExpenses.id, input.id))
        .run()
      audit.record(
        {
          userId,
          action: 'update',
          entityTable: 'recurring_expenses',
          entityId: input.id,
          summary: `Updated recurring expense "${before.name}"`,
          before: { amount: before.amount, isActive: before.isActive },
          after: {
            amount: input.amount ?? before.amount,
            isActive: input.isActive ?? before.isActive === 1,
          },
        },
        tx,
      )
    })
    return toRecurringDto(
      db.select().from(recurringExpenses).where(eq(recurringExpenses.id, input.id)).get()!,
    )
  }

  function dueRecurring(asOf?: string): RecurringExpenseDto[] {
    const date = asOf ?? todayBusinessDate()
    assertBusinessDate(date)
    const month = periodFromDate(date)
    const monthEnd = periodEnd(month)
    return listRecurring(false).filter((r) => {
      if (!r.isActive) return false
      // Due if next_due_date is on/before month end and not already recorded this month
      if (r.nextDueDate > monthEnd) return false
      if (r.lastRecordedDate && periodFromDate(r.lastRecordedDate) === month) {
        // Already recorded this month — only still due if next_due is still in this month
        // (shouldn't happen after advance). Treat as not due.
        return false
      }
      return true
    })
  }

  // ── Attribution ─────────────────────────────────────────────────────

  function attributionOptions(): {
    employees: Array<{ id: number; name: string; code: string }>
    vehicles: Array<{ id: number; name: string }>
  } {
    const employees: Array<{ id: number; name: string; code: string }> = []
    const vehicles: Array<{ id: number; name: string }> = []
    if (tableExists(raw, 'employees')) {
      const rows = raw
        .prepare(
          `SELECT id, name, code FROM employees WHERE deleted_at IS NULL AND status = 'active' ORDER BY name`,
        )
        .all() as Array<{ id: number; name: string; code: string }>
      employees.push(...rows)
    }
    if (tableExists(raw, 'vehicles')) {
      const rows = raw
        .prepare(`SELECT id, name FROM vehicles WHERE is_active = 1 ORDER BY name`)
        .all() as Array<{ id: number; name: string }>
      vehicles.push(...rows)
    }
    return { employees, vehicles }
  }

  // ── Cash book ───────────────────────────────────────────────────────

  function cashBook(input: { date: string; openingCash?: number; countedCash?: number | null }): {
    date: string
    openingCash: number
    cashIn: number
    cashOut: number
    closingCash: number
    countedCash: number | null
    variance: number | null
    cashInCount: number
    cashOutCount: number
  } {
    assertBusinessDate(input.date)
    const openingCash = input.openingCash ?? 0
    // Match billing.revenueCash: security deposits are liabilities, not trading cash-in.
    const cashPayments = db
      .select()
      .from(payments)
      .where(
        and(
          eq(payments.paymentDate, input.date),
          eq(payments.method, 'cash'),
          eq(payments.status, 'active'),
          eq(payments.purpose, 'payment'),
          sql`(${payments.notes} IS NULL OR ${payments.notes} NOT LIKE '[deposit]%')`,
        ),
      )
      .all()
    const cashExpenses = db
      .select()
      .from(expenses)
      .where(
        and(
          eq(expenses.expenseDate, input.date),
          eq(expenses.paymentMethod, 'cash'),
          eq(expenses.status, 'active'),
        ),
      )
      .all()
    const cashIn = cashPayments.reduce((s, p) => s + p.amount, 0)
    const cashOut = cashExpenses.reduce((s, e) => s + e.amount, 0)
    const closingCash = openingCash + cashIn - cashOut
    const countedCash = input.countedCash ?? null
    return {
      date: input.date,
      openingCash,
      cashIn,
      cashOut,
      closingCash,
      countedCash,
      variance: countedCash != null ? countedCash - closingCash : null,
      cashInCount: cashPayments.length,
      cashOutCount: cashExpenses.length,
    }
  }

  function findCategoryByName(name: string): ExpenseCategoryDto | null {
    const row = db.select().from(expenseCategories).where(eq(expenseCategories.name, name)).get()
    return row ? toCategoryDto(row) : null
  }

  return {
    // categories
    listCategories,
    createCategory,
    updateCategory,
    reorderCategories,
    mergeCategories,
    getCategory: (id: number) => toCategoryDto(getCategoryRow(id)),
    findCategoryByName,
    // expenses
    createExpense,
    updateExpense,
    voidExpense,
    voidSystemExpense,
    listExpenses,
    getById,
    summaryByCategory,
    summaryByMonth,
    insights,
    // recurring
    listRecurring,
    createRecurring,
    updateRecurring,
    dueRecurring,
    // misc
    attributionOptions,
    cashBook,
  }
}

export type ExpenseService = ReturnType<typeof createExpenseService>
