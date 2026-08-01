import { and, eq, isNull, lte, sql } from 'drizzle-orm'
import type { AppDatabase } from '@main/db/client'
import {
  deliveries,
  employees,
  payrollItems,
  payrollRuns,
  salaryAdvanceSettlements,
  salaryAdvances,
} from '@main/db/schema'
import { newUuid } from '@main/lib/ids'
import type {
  EmployeePerformanceMonthDto,
  ExpensePaymentMethod,
  PayrollItemDto,
  PayrollRunDto,
  SalaryAdvanceDto,
  SalaryType,
  WorkingDaysBasis,
} from '@shared/contracts'
import {
  assertBusinessDate,
  assertPeriod,
  nowIsoUtc,
  periodEnd,
  periodFromDate,
  periodStart,
  previousPeriod,
  todayBusinessDate,
} from '@shared/date'
import { AppError } from '@shared/errors'
import type { AttendanceService } from './attendance.service'
import type { AuditService } from './audit.service'
import type { EmployeeService } from './employee.service'
import type { ExpenseService } from './expense.service'
import type { PeriodService } from './period.service'

type DbLike = AppDatabase

/**
 * Gross components before advance/other deductions.
 * Salaries expense on finalise = net_payable (cash paid at payroll time), NOT gross.
 */
export function computePayrollMath(input: {
  salaryType: SalaryType
  baseAmount: number
  workingDays: number
  daysPresent: number
  daysAbsent: number
  commissionPerBottle: number
  bottlesDelivered: number
  overtimeHours: number
  overtimeHourlyRate: number
  bonusAmount: number
  outstandingAdvances: number
  otherDeductions: number
}): {
  absenceDeduction: number
  commissionAmount: number
  overtimeAmount: number
  advancesDeducted: number
  advancesCarryForward: number
  netPayable: number
  grossPay: number
  warning: string | null
} {
  const isDaily = input.salaryType === 'daily'
  const isCommissionOnly = input.salaryType === 'commission_only'

  let base = input.baseAmount
  if (isDaily) {
    base = Math.round(input.baseAmount * input.daysPresent)
  } else if (isCommissionOnly) {
    base = 0
  }

  // Round once at the end — intermediate per-day rounding drifts by 1 paisa on non-divisible bases.
  const absenceDeduction =
    !isDaily && !isCommissionOnly && input.workingDays > 0
      ? Math.round((input.baseAmount * input.daysAbsent) / input.workingDays)
      : 0

  const commissionAmount = Math.round(input.bottlesDelivered * input.commissionPerBottle)
  const overtimeAmount = Math.round(input.overtimeHours * input.overtimeHourlyRate)

  const grossPay = base - absenceDeduction + commissionAmount + overtimeAmount + input.bonusAmount

  const beforeAdvances = Math.max(0, grossPay - input.otherDeductions)
  const advancesDeducted = Math.min(input.outstandingAdvances, beforeAdvances)
  const advancesCarryForward = input.outstandingAdvances - advancesDeducted
  let warning: string | null = null
  if (advancesCarryForward > 0 && input.outstandingAdvances > beforeAdvances) {
    warning = `Advances exceed net pay — deducted ${advancesDeducted} paisa; ${advancesCarryForward} paisa remains outstanding for next month.`
  }

  const netPayable = Math.max(0, beforeAdvances - advancesDeducted)
  return {
    absenceDeduction,
    commissionAmount,
    overtimeAmount,
    advancesDeducted,
    advancesCarryForward,
    netPayable,
    grossPay,
    warning,
  }
}

export function createPayrollService(
  db: AppDatabase,
  audit: AuditService,
  period: PeriodService,
  employeesSvc: EmployeeService,
  attendance: AttendanceService,
  expenses: ExpenseService,
) {
  function advanceOutstanding(row: typeof salaryAdvances.$inferSelect): number {
    if (row.status !== 'outstanding') return 0
    return Math.max(0, row.amount - row.settledAmount)
  }

  function applyAdvanceSettlement(
    tx: DbLike,
    adv: typeof salaryAdvances.$inferSelect,
    payrollItemId: number,
    apply: number,
    now: string,
  ): void {
    if (apply <= 0) return
    tx.insert(salaryAdvanceSettlements)
      .values({
        uuid: newUuid(),
        salaryAdvanceId: adv.id,
        payrollItemId,
        amount: apply,
        createdAt: now,
        voidedAt: null,
      })
      .run()
    const newSettled = adv.settledAmount + apply
    const fullySettled = newSettled >= adv.amount
    tx.update(salaryAdvances)
      .set({
        settledAmount: newSettled,
        status: fullySettled ? 'settled' : 'outstanding',
        settledInPayrollItemId: payrollItemId,
      })
      .where(eq(salaryAdvances.id, adv.id))
      .run()
    // Keep in-memory row in sync for multi-slice FIFO in the same finalize pass.
    adv.settledAmount = newSettled
    adv.status = fullySettled ? 'settled' : 'outstanding'
    adv.settledInPayrollItemId = payrollItemId
  }

  function reverseAdvanceSettlementsForItem(tx: DbLike, payrollItemId: number, now: string): void {
    const slices = tx
      .select()
      .from(salaryAdvanceSettlements)
      .where(
        and(
          eq(salaryAdvanceSettlements.payrollItemId, payrollItemId),
          isNull(salaryAdvanceSettlements.voidedAt),
        ),
      )
      .all()
    const touchedAdvanceIds = new Set<number>()
    for (const slice of slices) {
      tx.update(salaryAdvanceSettlements)
        .set({ voidedAt: now })
        .where(eq(salaryAdvanceSettlements.id, slice.id))
        .run()
      touchedAdvanceIds.add(slice.salaryAdvanceId)
    }
    for (const advanceId of touchedAdvanceIds) {
      const adv = tx.select().from(salaryAdvances).where(eq(salaryAdvances.id, advanceId)).get()
      if (!adv) continue
      const remainingSlices = tx
        .select()
        .from(salaryAdvanceSettlements)
        .where(
          and(
            eq(salaryAdvanceSettlements.salaryAdvanceId, advanceId),
            isNull(salaryAdvanceSettlements.voidedAt),
          ),
        )
        .all()
      const settled = remainingSlices.reduce((s, r) => s + r.amount, 0)
      const latestItemId = remainingSlices.sort((a, b) => b.id - a.id)[0]?.payrollItemId ?? null
      tx.update(salaryAdvances)
        .set({
          settledAmount: settled,
          status: settled >= adv.amount && settled > 0 ? 'settled' : 'outstanding',
          settledInPayrollItemId: latestItemId,
        })
        .where(eq(salaryAdvances.id, advanceId))
        .run()
    }
  }

  function toAdvanceDto(
    row: typeof salaryAdvances.$inferSelect,
    emp?: { code: string; name: string },
  ): SalaryAdvanceDto {
    return {
      id: row.id,
      uuid: row.uuid,
      employeeId: row.employeeId,
      employeeCode: emp?.code,
      employeeName: emp?.name,
      advanceDate: row.advanceDate,
      amount: row.amount,
      settledAmount: row.settledAmount,
      outstandingAmount: advanceOutstanding(row),
      reason: row.reason,
      status: row.status as SalaryAdvanceDto['status'],
      settledInPayrollItemId: row.settledInPayrollItemId,
      expenseId: row.expenseId,
      createdAt: row.createdAt,
    }
  }

  function toRunDto(row: typeof payrollRuns.$inferSelect, itemCount: number): PayrollRunDto {
    return {
      id: row.id,
      uuid: row.uuid,
      period: row.period,
      generatedOn: row.generatedOn,
      status: row.status as PayrollRunDto['status'],
      totalNet: row.totalNet,
      notes: row.notes,
      workingDaysBasis: attendance.workingDaysBasis(),
      itemCount,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }
  }

  function bottlesForEmployee(employeeId: number, periodKey: string): number {
    const from = periodStart(periodKey)
    const to = periodEnd(periodKey)
    const rows = db
      .select()
      .from(deliveries)
      .where(
        and(
          eq(deliveries.employeeId, employeeId),
          eq(deliveries.status, 'recorded'),
          sql`${deliveries.deliveryDate} >= ${from}`,
          sql`${deliveries.deliveryDate} <= ${to}`,
        ),
      )
      .all()
    return rows.reduce((s, r) => s + r.quantity, 0)
  }

  /**
   * Commission attribution: only deliveries with employee_id set count.
   * Deliveries with null employee_id are excluded from every employee's bottle total
   * (they do not inflate commission).
   */
  function outstandingAdvancesAsOf(
    employeeId: number,
    periodKey: string,
    tx: DbLike = db,
  ): {
    total: number
    rows: (typeof salaryAdvances.$inferSelect)[]
  } {
    const end = periodEnd(periodKey)
    const rows = tx
      .select()
      .from(salaryAdvances)
      .where(
        and(
          eq(salaryAdvances.employeeId, employeeId),
          eq(salaryAdvances.status, 'outstanding'),
          lte(salaryAdvances.advanceDate, end),
        ),
      )
      .all()
      .filter((r) => advanceOutstanding(r) > 0)
    return { total: rows.reduce((s, r) => s + advanceOutstanding(r), 0), rows }
  }

  function toItemDto(
    row: typeof payrollItems.$inferSelect,
    emp: { code: string; name: string; role: string },
    extras?: {
      advancesOutstanding?: number
      advancesCarryForward?: number
      warning?: string | null
    },
  ): PayrollItemDto {
    const grossPay =
      row.baseAmount -
      row.absenceDeduction +
      row.commissionAmount +
      row.overtimeAmount +
      row.bonusAmount
    const advancesOutstanding = extras?.advancesOutstanding ?? row.advancesDeducted
    const advancesCarryForward = extras?.advancesCarryForward ?? 0
    return {
      id: row.id,
      uuid: row.uuid,
      payrollRunId: row.payrollRunId,
      employeeId: row.employeeId,
      employeeCode: emp.code,
      employeeName: emp.name,
      employeeRole: emp.role as PayrollItemDto['employeeRole'],
      salaryType: row.salaryType as SalaryType,
      baseAmount: row.baseAmount,
      workingDays: row.workingDays,
      daysPresent: row.daysPresent,
      daysAbsent: row.daysAbsent,
      absenceDeduction: row.absenceDeduction,
      bottlesDelivered: row.bottlesDelivered,
      commissionAmount: row.commissionAmount,
      overtimeHours: row.overtimeHours,
      overtimeAmount: row.overtimeAmount,
      bonusAmount: row.bonusAmount,
      advancesDeducted: row.advancesDeducted,
      advancesOutstanding,
      advancesCarryForward,
      otherDeductions: row.otherDeductions,
      deductionNotes: row.deductionNotes,
      netPayable: row.netPayable,
      paidAmount: row.paidAmount,
      paymentDate: row.paymentDate,
      paymentMethod: row.paymentMethod,
      expenseId: row.expenseId,
      notes: row.notes,
      warning: extras?.warning ?? null,
      grossPay,
    }
  }

  function loadItemDto(itemId: number, tx: DbLike = db): PayrollItemDto {
    const row = tx.select().from(payrollItems).where(eq(payrollItems.id, itemId)).get()
    if (!row) throw new AppError('NOT_FOUND', `Payroll item ${itemId} not found`)
    const emp = employeesSvc.requireEmployee(row.employeeId)
    const run = tx.select().from(payrollRuns).where(eq(payrollRuns.id, row.payrollRunId)).get()!
    const salary = employeesSvc.getSalaryFor(row.employeeId, periodEnd(run.period))
    const { total } = outstandingAdvancesAsOf(row.employeeId, run.period, tx)
    const baseForMath =
      row.salaryType === 'daily'
        ? (salary?.baseAmount ?? 0)
        : row.salaryType === 'commission_only'
          ? 0
          : (salary?.baseAmount ?? row.baseAmount)
    const math =
      run.status === 'draft'
        ? computePayrollMath({
            salaryType: row.salaryType as SalaryType,
            baseAmount: baseForMath,
            workingDays: row.workingDays,
            daysPresent: row.daysPresent,
            daysAbsent: row.daysAbsent,
            commissionPerBottle: salary?.commissionPerBottle ?? 0,
            bottlesDelivered: row.bottlesDelivered,
            overtimeHours: row.overtimeHours,
            overtimeHourlyRate: salary?.overtimeHourlyRate ?? 0,
            bonusAmount: row.bonusAmount,
            outstandingAdvances: total,
            otherDeductions: row.otherDeductions,
          })
        : null
    return toItemDto(row, emp, {
      advancesOutstanding: run.status === 'draft' ? total : row.advancesDeducted,
      advancesCarryForward: math?.advancesCarryForward ?? 0,
      warning: math?.warning ?? null,
    })
  }

  // ── Advances ────────────────────────────────────────────────────────

  function listAdvances(input: {
    employeeId?: number
    status?: 'outstanding' | 'settled' | 'waived' | 'void' | 'all'
  }): { items: SalaryAdvanceDto[]; outstandingTotal: number } {
    let rows = db.select().from(salaryAdvances).all()
    if (input.employeeId != null) rows = rows.filter((r) => r.employeeId === input.employeeId)
    const status = input.status ?? 'all'
    if (status !== 'all') rows = rows.filter((r) => r.status === status)
    rows.sort((a, b) => b.advanceDate.localeCompare(a.advanceDate) || b.id - a.id)
    const empCache = new Map<number, { code: string; name: string }>()
    const items = rows.map((r) => {
      let emp = empCache.get(r.employeeId)
      if (!emp) {
        const e = db.select().from(employees).where(eq(employees.id, r.employeeId)).get()
        emp = { code: e?.code ?? '', name: e?.name ?? '' }
        empCache.set(r.employeeId, emp)
      }
      return toAdvanceDto(r, emp)
    })
    const outstandingTotal = rows.reduce((s, r) => s + advanceOutstanding(r), 0)
    return { items, outstandingTotal }
  }

  function createAdvance(
    input: {
      employeeId: number
      advanceDate: string
      amount: number
      reason?: string | null
      paymentMethod?: ExpensePaymentMethod
      forceClosedPeriod?: boolean
    },
    userId: number,
  ): SalaryAdvanceDto {
    assertBusinessDate(input.advanceDate)
    if (!input.forceClosedPeriod) period.guardPeriodOpen(input.advanceDate)
    if (input.amount <= 0)
      throw new AppError('VALIDATION_FAILED', 'Advance amount must be positive')
    const emp = employeesSvc.requireEmployee(input.employeeId)
    const cat = expenses.findCategoryByName('Employee Advance')
    if (!cat) throw new AppError('INTERNAL', 'Employee Advance category missing')

    const now = nowIsoUtc()
    const advanceId = db.transaction((tx) => {
      const inserted = tx
        .insert(salaryAdvances)
        .values({
          uuid: newUuid(),
          employeeId: input.employeeId,
          advanceDate: input.advanceDate,
          amount: input.amount,
          settledAmount: 0,
          reason: input.reason?.trim() || null,
          settledInPayrollItemId: null,
          status: 'outstanding',
          expenseId: null,
          createdAt: now,
          createdBy: userId,
        })
        .returning()
        .get()!

      // Cash left the business now — record Employee Advance expense immediately.
      const exp = expenses.createExpense(
        {
          expenseDate: input.advanceDate,
          categoryId: cat.id,
          amount: input.amount,
          paymentMethod: input.paymentMethod ?? 'cash',
          vendorName: emp.name,
          description: `Salary advance — ${emp.code} ${emp.name}`,
          employeeId: emp.id,
          source: 'payroll',
          sourceRefTable: 'salary_advances',
          sourceRefId: inserted.id,
          forceClosedPeriod: input.forceClosedPeriod,
        },
        userId,
        tx,
      )

      tx.update(salaryAdvances)
        .set({ expenseId: exp.id })
        .where(eq(salaryAdvances.id, inserted.id))
        .run()

      audit.record(
        {
          userId,
          action: 'create',
          entityTable: 'salary_advances',
          entityId: inserted.id,
          summary: `Advance ${input.amount} paisa to ${emp.code}`,
          after: { amount: input.amount, expenseId: exp.id },
        },
        tx,
      )
      return inserted.id
    })

    const row = db.select().from(salaryAdvances).where(eq(salaryAdvances.id, advanceId)).get()!
    return toAdvanceDto(row, emp)
  }

  function voidAdvance(
    id: number,
    reason: string,
    userId: number,
    opts: { forceClosedPeriod?: boolean } = {},
  ): SalaryAdvanceDto {
    if (!reason.trim()) throw new AppError('VALIDATION_FAILED', 'Reason is required')
    const row = db.select().from(salaryAdvances).where(eq(salaryAdvances.id, id)).get()
    if (!row) throw new AppError('NOT_FOUND', 'Advance not found')
    if (row.status === 'void') throw new AppError('CONFLICT', 'Advance already void')
    if (row.status === 'settled') {
      throw new AppError('CONFLICT', 'Cannot void a settled advance — void the payroll run first')
    }
    if (!opts.forceClosedPeriod) period.guardPeriodOpen(row.advanceDate)

    db.transaction((tx) => {
      if (row.expenseId != null) {
        expenses.voidSystemExpense(row.expenseId, reason, userId, tx, opts)
      }
      tx.update(salaryAdvances).set({ status: 'void' }).where(eq(salaryAdvances.id, id)).run()
      audit.record(
        {
          userId,
          action: 'void',
          entityTable: 'salary_advances',
          entityId: id,
          summary: `Voided advance #${id}: ${reason.trim()}`,
          before: { status: row.status, amount: row.amount },
          after: { status: 'void' },
        },
        tx,
      )
    })
    const updated = db.select().from(salaryAdvances).where(eq(salaryAdvances.id, id)).get()!
    const emp = employeesSvc.requireEmployee(updated.employeeId)
    return toAdvanceDto(updated, emp)
  }

  function waiveAdvance(
    id: number,
    reason: string,
    userId: number,
    opts: { forceClosedPeriod?: boolean } = {},
  ): SalaryAdvanceDto {
    if (!reason.trim()) throw new AppError('VALIDATION_FAILED', 'Reason is required')
    const row = db.select().from(salaryAdvances).where(eq(salaryAdvances.id, id)).get()
    if (!row) throw new AppError('NOT_FOUND', 'Advance not found')
    if (row.status !== 'outstanding') {
      throw new AppError('CONFLICT', 'Only outstanding advances can be waived')
    }
    if (!opts.forceClosedPeriod) period.guardPeriodOpen(row.advanceDate)
    db.transaction((tx) => {
      tx.update(salaryAdvances).set({ status: 'waived' }).where(eq(salaryAdvances.id, id)).run()
      audit.record(
        {
          userId,
          action: 'update',
          entityTable: 'salary_advances',
          entityId: id,
          summary: `Waived advance #${id}: ${reason.trim()}`,
          before: { status: row.status },
          after: { status: 'waived', reason: reason.trim() },
        },
        tx,
      )
    })
    // Note: Employee Advance expense stays — cash already left; waive only skips payroll deduction.
    const updated = db.select().from(salaryAdvances).where(eq(salaryAdvances.id, id)).get()!
    const emp = employeesSvc.requireEmployee(updated.employeeId)
    return toAdvanceDto(updated, emp)
  }

  // ── Payroll runs ────────────────────────────────────────────────────

  function activeItemsForRun(runId: number, tx: DbLike = db) {
    return tx
      .select()
      .from(payrollItems)
      .where(and(eq(payrollItems.payrollRunId, runId), isNull(payrollItems.supersededAt)))
      .all()
  }

  function listRuns(): { items: PayrollRunDto[] } {
    const runs = db.select().from(payrollRuns).all()
    runs.sort((a, b) => b.period.localeCompare(a.period))
    return {
      items: runs.map((r) => toRunDto(r, activeItemsForRun(r.id).length)),
    }
  }

  function getItem(itemId: number): { run: PayrollRunDto; item: PayrollItemDto } {
    const row = db.select().from(payrollItems).where(eq(payrollItems.id, itemId)).get()
    if (!row) throw new AppError('NOT_FOUND', `Payroll item ${itemId} not found`)
    const { run } = getRun(row.payrollRunId)
    const item = loadItemDto(itemId)
    return { run, item }
  }

  function getRun(id: number): { run: PayrollRunDto; items: PayrollItemDto[] } {
    const run = db.select().from(payrollRuns).where(eq(payrollRuns.id, id)).get()
    if (!run) throw new AppError('NOT_FOUND', `Payroll run ${id} not found`)
    const items = activeItemsForRun(id)
    const mapped = items.map((row) => loadItemDto(row.id))
    return { run: toRunDto(run, mapped.length), items: mapped }
  }

  function generate(
    input: { period: string; forceClosedPeriod?: boolean },
    userId: number,
  ): { run: PayrollRunDto; items: PayrollItemDto[] } {
    assertPeriod(input.period)
    if (!input.forceClosedPeriod) period.guardPeriodOpen(periodStart(input.period))

    const existing = db.select().from(payrollRuns).where(eq(payrollRuns.period, input.period)).get()
    if (existing && existing.status !== 'void') {
      throw new AppError(
        'CONFLICT',
        `Payroll for ${input.period} already exists (${existing.status})`,
      )
    }

    const workingDays = attendance.resolveWorkingDays(input.period)
    const basis: WorkingDaysBasis = attendance.workingDaysBasis()
    const onDate = periodEnd(input.period)
    const active = db
      .select()
      .from(employees)
      .where(and(isNull(employees.deletedAt), eq(employees.status, 'active')))
      .all()

    const now = nowIsoUtc()
    const runId = db.transaction((tx) => {
      if (existing?.status === 'void') {
        // Soft reuse: supersede old items (keep rows for audit) then reopen run as draft
        const oldItems = tx
          .select()
          .from(payrollItems)
          .where(and(eq(payrollItems.payrollRunId, existing.id), isNull(payrollItems.supersededAt)))
          .all()
        for (const it of oldItems) {
          tx.update(payrollItems).set({ supersededAt: now }).where(eq(payrollItems.id, it.id)).run()
        }
        tx.update(payrollRuns)
          .set({
            status: 'draft',
            generatedOn: todayBusinessDate(),
            totalNet: 0,
            notes: null,
            updatedAt: now,
            createdBy: userId,
          })
          .where(eq(payrollRuns.id, existing.id))
          .run()
      }

      const run =
        existing?.status === 'void'
          ? tx.select().from(payrollRuns).where(eq(payrollRuns.id, existing.id)).get()!
          : tx
              .insert(payrollRuns)
              .values({
                uuid: newUuid(),
                period: input.period,
                generatedOn: todayBusinessDate(),
                status: 'draft',
                totalNet: 0,
                notes: null,
                createdAt: now,
                updatedAt: now,
                createdBy: userId,
              })
              .returning()
              .get()!

      let totalNet = 0
      for (const emp of active) {
        const salary = employeesSvc.getSalaryFor(emp.id, onDate)
        if (!salary) continue

        const summary = attendance.summarizeForPayroll(emp.id, input.period)
        const bottles = bottlesForEmployee(emp.id, input.period)
        const { total: advTotal } = outstandingAdvancesAsOf(emp.id, input.period, tx)

        const storedBase =
          salary.salaryType === 'daily'
            ? Math.round(salary.baseAmount * summary.daysPresent)
            : salary.salaryType === 'commission_only'
              ? 0
              : salary.baseAmount

        const math = computePayrollMath({
          salaryType: salary.salaryType,
          baseAmount: salary.baseAmount,
          workingDays,
          daysPresent: summary.daysPresent,
          daysAbsent: summary.daysAbsent,
          commissionPerBottle: salary.commissionPerBottle,
          bottlesDelivered: bottles,
          overtimeHours: summary.overtimeHours,
          overtimeHourlyRate: salary.overtimeHourlyRate,
          bonusAmount: 0,
          outstandingAdvances: advTotal,
          otherDeductions: 0,
        })

        tx.insert(payrollItems)
          .values({
            uuid: newUuid(),
            payrollRunId: run.id,
            employeeId: emp.id,
            salaryType: salary.salaryType,
            baseAmount: storedBase,
            workingDays,
            daysPresent: summary.daysPresent,
            daysAbsent: summary.daysAbsent,
            absenceDeduction: math.absenceDeduction,
            bottlesDelivered: bottles,
            commissionAmount: math.commissionAmount,
            overtimeHours: summary.overtimeHours,
            overtimeAmount: math.overtimeAmount,
            bonusAmount: 0,
            advancesDeducted: math.advancesDeducted,
            otherDeductions: 0,
            deductionNotes: null,
            netPayable: math.netPayable,
            paidAmount: 0,
            paymentDate: null,
            paymentMethod: null,
            expenseId: null,
            notes: `basis:${basis}`,
            supersededAt: null,
          })
          .run()
        totalNet += math.netPayable
      }

      tx.update(payrollRuns)
        .set({ totalNet, updatedAt: now })
        .where(eq(payrollRuns.id, run.id))
        .run()

      audit.record(
        {
          userId,
          action: 'create',
          entityTable: 'payroll_runs',
          entityId: run.id,
          summary: `Generated payroll ${input.period} (${basis}, ${workingDays} working days)`,
          after: { period: input.period, totalNet, workingDaysBasis: basis },
        },
        tx,
      )
      return run.id
    })

    return getRun(runId)
  }

  function updateItem(
    input: {
      id: number
      bonusAmount?: number
      otherDeductions?: number
      deductionNotes?: string | null
      notes?: string | null
    },
    userId: number,
  ): PayrollItemDto {
    const row = db.select().from(payrollItems).where(eq(payrollItems.id, input.id)).get()
    if (!row) throw new AppError('NOT_FOUND', 'Payroll item not found')
    const run = db.select().from(payrollRuns).where(eq(payrollRuns.id, row.payrollRunId)).get()!
    if (run.status !== 'draft') {
      throw new AppError('CONFLICT', 'Only draft payroll items can be edited')
    }

    const salary = employeesSvc.getSalaryFor(row.employeeId, periodEnd(run.period))
    const { total: advTotal } = outstandingAdvancesAsOf(row.employeeId, run.period)
    const bonusAmount = input.bonusAmount ?? row.bonusAmount
    const otherDeductions = input.otherDeductions ?? row.otherDeductions

    // For daily, stored baseAmount is already rate×days; feed daily rate into math.
    const baseForMath =
      row.salaryType === 'daily'
        ? (salary?.baseAmount ?? 0)
        : row.salaryType === 'commission_only'
          ? 0
          : (salary?.baseAmount ?? row.baseAmount)

    const math = computePayrollMath({
      salaryType: row.salaryType as SalaryType,
      baseAmount: baseForMath,
      workingDays: row.workingDays,
      daysPresent: row.daysPresent,
      daysAbsent: row.daysAbsent,
      commissionPerBottle: salary?.commissionPerBottle ?? 0,
      bottlesDelivered: row.bottlesDelivered,
      overtimeHours: row.overtimeHours,
      overtimeHourlyRate: salary?.overtimeHourlyRate ?? 0,
      bonusAmount,
      outstandingAdvances: advTotal,
      otherDeductions,
    })

    const storedBase =
      row.salaryType === 'daily'
        ? Math.round(baseForMath * row.daysPresent)
        : row.salaryType === 'commission_only'
          ? 0
          : baseForMath

    const now = nowIsoUtc()
    db.transaction((tx) => {
      tx.update(payrollItems)
        .set({
          baseAmount: storedBase,
          absenceDeduction: math.absenceDeduction,
          commissionAmount: math.commissionAmount,
          overtimeAmount: math.overtimeAmount,
          bonusAmount,
          advancesDeducted: math.advancesDeducted,
          otherDeductions,
          deductionNotes:
            input.deductionNotes !== undefined ? input.deductionNotes : row.deductionNotes,
          notes: input.notes !== undefined ? input.notes : row.notes,
          netPayable: math.netPayable,
        })
        .where(eq(payrollItems.id, input.id))
        .run()

      const all = activeItemsForRun(run.id, tx)
      const totalNet = all.reduce(
        (s, r) => s + (r.id === input.id ? math.netPayable : r.netPayable),
        0,
      )
      tx.update(payrollRuns)
        .set({ totalNet, updatedAt: now })
        .where(eq(payrollRuns.id, run.id))
        .run()

      audit.record(
        {
          userId,
          action: 'update',
          entityTable: 'payroll_items',
          entityId: input.id,
          summary: `Updated payroll item #${input.id}`,
          after: { bonusAmount, otherDeductions, netPayable: math.netPayable },
        },
        tx,
      )
    })
    return loadItemDto(input.id)
  }

  /**
   * Finalise: settle advances (partial FIFO), create Salaries expense = net_payable per employee.
   * Employee Advance expenses already recorded when advances were paid — do not re-expense gross.
   */
  function finalize(
    input: {
      id: number
      paymentDate?: string
      paymentMethod?: ExpensePaymentMethod
      forceClosedPeriod?: boolean
    },
    userId: number,
  ): { run: PayrollRunDto; items: PayrollItemDto[]; salariesExpenseTotal: number } {
    const run = db.select().from(payrollRuns).where(eq(payrollRuns.id, input.id)).get()
    if (!run) throw new AppError('NOT_FOUND', 'Payroll run not found')
    if (run.status !== 'draft') throw new AppError('CONFLICT', 'Only draft runs can be finalised')
    if (!input.forceClosedPeriod) period.guardPeriodOpen(periodStart(run.period))

    const paymentDate = input.paymentDate ?? periodEnd(run.period)
    assertBusinessDate(paymentDate)
    const method = input.paymentMethod ?? 'cash'
    const cat = expenses.findCategoryByName('Salaries')
    if (!cat) throw new AppError('INTERNAL', 'Salaries category missing')

    const now = nowIsoUtc()
    let salariesExpenseTotal = 0

    db.transaction((tx) => {
      const items = activeItemsForRun(run.id, tx)

      for (const item of items) {
        const emp = employeesSvc.requireEmployee(item.employeeId)
        const { rows: advRows } = outstandingAdvancesAsOf(item.employeeId, run.period, tx)
        // FIFO settle up to advancesDeducted; ledger rows enable per-item void across months.
        let remaining = item.advancesDeducted
        for (const adv of advRows.sort(
          (a, b) => a.advanceDate.localeCompare(b.advanceDate) || a.id - b.id,
        )) {
          if (remaining <= 0) break
          const open = advanceOutstanding(adv)
          if (open <= 0) continue
          const apply = Math.min(remaining, open)
          applyAdvanceSettlement(tx, adv, item.id, apply, now)
          remaining -= apply
        }

        // Salaries expense = net payable (cash due at payroll time). paidAmount stays 0 until
        // recordPayment / payAll — finalize does not pretend cash already left.
        let expenseId: number | null = null
        if (item.netPayable > 0) {
          const exp = expenses.createExpense(
            {
              expenseDate: paymentDate,
              categoryId: cat.id,
              amount: item.netPayable,
              paymentMethod: method,
              vendorName: emp.name,
              description: `Salary ${run.period} — ${emp.code} ${emp.name}`,
              employeeId: emp.id,
              source: 'payroll',
              sourceRefTable: 'payroll_items',
              sourceRefId: item.id,
              forceClosedPeriod: input.forceClosedPeriod,
            },
            userId,
            tx,
          )
          expenseId = exp.id
          salariesExpenseTotal += item.netPayable
        }

        tx.update(payrollItems)
          .set({
            expenseId,
            paidAmount: 0,
            paymentDate: null,
            paymentMethod: null,
          })
          .where(eq(payrollItems.id, item.id))
          .run()
      }

      tx.update(payrollRuns)
        .set({ status: 'finalized', updatedAt: now })
        .where(eq(payrollRuns.id, run.id))
        .run()

      audit.record(
        {
          userId,
          action: 'update',
          entityTable: 'payroll_runs',
          entityId: run.id,
          summary: `Finalised payroll ${run.period}; Salaries expenses ${salariesExpenseTotal} paisa`,
          after: { status: 'finalized', salariesExpenseTotal },
        },
        tx,
      )
    })

    const result = getRun(run.id)
    return { ...result, salariesExpenseTotal }
  }

  function voidRun(
    id: number,
    reason: string,
    userId: number,
    opts: { forceClosedPeriod?: boolean } = {},
  ): PayrollRunDto {
    if (!reason.trim()) throw new AppError('VALIDATION_FAILED', 'Reason is required')
    const run = db.select().from(payrollRuns).where(eq(payrollRuns.id, id)).get()
    if (!run) throw new AppError('NOT_FOUND', 'Payroll run not found')
    if (run.status !== 'finalized') {
      throw new AppError('CONFLICT', 'Only finalised runs can be voided')
    }
    if (!opts.forceClosedPeriod) period.guardPeriodOpen(periodStart(run.period))

    const now = nowIsoUtc()
    db.transaction((tx) => {
      const items = activeItemsForRun(id, tx)

      for (const item of items) {
        if (item.expenseId != null) {
          expenses.voidSystemExpense(item.expenseId, reason, userId, tx, opts)
        }
        // Undo only this item's ledger slices (idempotent; later months keep their slices).
        reverseAdvanceSettlementsForItem(tx, item.id, now)
        tx.update(payrollItems)
          .set({
            expenseId: null,
            paidAmount: 0,
            paymentDate: null,
            paymentMethod: null,
          })
          .where(eq(payrollItems.id, item.id))
          .run()
      }

      tx.update(payrollRuns)
        .set({
          status: 'void',
          notes: reason.trim(),
          updatedAt: now,
        })
        .where(eq(payrollRuns.id, id))
        .run()

      audit.record(
        {
          userId,
          action: 'void',
          entityTable: 'payroll_runs',
          entityId: id,
          summary: `Voided payroll ${run.period}: ${reason.trim()}`,
          before: { status: 'finalized' },
          after: { status: 'void' },
        },
        tx,
      )
    })
    return getRun(id).run
  }

  function recordPayment(
    input: {
      itemId: number
      amount: number
      paymentDate: string
      paymentMethod: ExpensePaymentMethod
    },
    userId: number,
  ): PayrollItemDto {
    assertBusinessDate(input.paymentDate)
    const row = db.select().from(payrollItems).where(eq(payrollItems.id, input.itemId)).get()
    if (!row) throw new AppError('NOT_FOUND', 'Payroll item not found')
    const run = db.select().from(payrollRuns).where(eq(payrollRuns.id, row.payrollRunId)).get()!
    if (run.status !== 'finalized') {
      throw new AppError('CONFLICT', 'Record payment only on finalised runs')
    }
    const newPaid = Math.min(row.netPayable, row.paidAmount + input.amount)
    db.transaction((tx) => {
      tx.update(payrollItems)
        .set({
          paidAmount: newPaid,
          paymentDate: input.paymentDate,
          paymentMethod: input.paymentMethod,
        })
        .where(eq(payrollItems.id, input.itemId))
        .run()
      audit.record(
        {
          userId,
          action: 'update',
          entityTable: 'payroll_items',
          entityId: input.itemId,
          summary: `Payment ${input.amount} on payroll item #${input.itemId}`,
          after: { paidAmount: newPaid, paymentDate: input.paymentDate },
        },
        tx,
      )
    })
    return loadItemDto(input.itemId)
  }

  function payAll(
    input: {
      runId: number
      paymentDate: string
      paymentMethod?: ExpensePaymentMethod
    },
    userId: number,
  ): PayrollItemDto[] {
    const { items } = getRun(input.runId)
    const out: PayrollItemDto[] = []
    for (const item of items) {
      const remaining = item.netPayable - item.paidAmount
      if (remaining <= 0) {
        out.push(item)
        continue
      }
      out.push(
        recordPayment(
          {
            itemId: item.id,
            amount: remaining,
            paymentDate: input.paymentDate,
            paymentMethod: input.paymentMethod ?? 'cash',
          },
          userId,
        ),
      )
    }
    return out
  }

  function performanceMonth(employeeId: number, periodKey: string): EmployeePerformanceMonthDto {
    assertPeriod(periodKey)
    const from = periodStart(periodKey)
    const to = periodEnd(periodKey)
    const dels = db
      .select()
      .from(deliveries)
      .where(
        and(
          eq(deliveries.employeeId, employeeId),
          eq(deliveries.status, 'recorded'),
          sql`${deliveries.deliveryDate} >= ${from}`,
          sql`${deliveries.deliveryDate} <= ${to}`,
        ),
      )
      .all()
    const bottlesDelivered = dels.reduce((s, d) => s + d.quantity, 0)
    const uniqueCustomers = new Set(dels.map((d) => d.customerId)).size
    const cashCollected = dels.reduce((s, d) => s + d.cashCollected, 0)
    const summary = attendance.summarizeForPayroll(employeeId, periodKey)
    const workingDays = attendance.resolveWorkingDays(periodKey)
    const attendancePercent =
      workingDays > 0 ? Math.round((summary.daysPresent / workingDays) * 1000) / 10 : 0
    return {
      period: periodKey,
      bottlesDelivered,
      uniqueCustomers,
      deliveriesCount: dels.length,
      cashCollected,
      cashVariance: null, // Phase 7 trips
      attendancePercent,
      daysPresent: summary.daysPresent,
      workingDays,
    }
  }

  function employeePerformance(
    employeeId: number,
    periodKey?: string,
  ): {
    employeeId: number
    current: EmployeePerformanceMonthDto
    trend: EmployeePerformanceMonthDto[]
  } {
    employeesSvc.requireEmployee(employeeId)
    let p = periodKey ?? periodFromDate(todayBusinessDate())
    const trend: EmployeePerformanceMonthDto[] = []
    for (let i = 0; i < 12; i++) {
      trend.push(performanceMonth(employeeId, p))
      p = previousPeriod(p)
    }
    trend.reverse()
    return {
      employeeId,
      current: trend[trend.length - 1]!,
      trend,
    }
  }

  function comparePerformance(periodKey: string): {
    period: string
    items: Array<{
      employeeId: number
      code: string
      name: string
      bottlesDelivered: number
      uniqueCustomers: number
      deliveriesCount: number
      cashCollected: number
      attendancePercent: number
    }>
  } {
    assertPeriod(periodKey)
    const active = employeesSvc.listActiveOptions()
    return {
      period: periodKey,
      items: active.map((e) => {
        const m = performanceMonth(e.id, periodKey)
        return {
          employeeId: e.id,
          code: e.code,
          name: e.name,
          bottlesDelivered: m.bottlesDelivered,
          uniqueCustomers: m.uniqueCustomers,
          deliveriesCount: m.deliveriesCount,
          cashCollected: m.cashCollected,
          attendancePercent: m.attendancePercent,
        }
      }),
    }
  }

  return {
    listAdvances,
    createAdvance,
    voidAdvance,
    waiveAdvance,
    listRuns,
    getRun,
    getItem,
    generate,
    updateItem,
    finalize,
    voidRun,
    recordPayment,
    payAll,
    employeePerformance,
    comparePerformance,
    bottlesForEmployee,
    computePayrollMath,
  }
}

export type PayrollService = ReturnType<typeof createPayrollService>
