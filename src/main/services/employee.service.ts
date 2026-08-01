import { and, desc, eq, isNull, or, sql } from 'drizzle-orm'
import type { AppDatabase } from '@main/db/client'
import {
  employeeSalaries,
  employees,
  payrollItems,
  payrollRuns,
  salaryAdvances,
  sequences,
} from '@main/db/schema'
import { newUuid } from '@main/lib/ids'
import type {
  CreateEmployeeInput,
  EmployeeDto,
  EmployeeSalaryDto,
  SalaryType,
  UpdateEmployeeInput,
} from '@shared/contracts'
import {
  addBusinessDays,
  assertBusinessDate,
  nowIsoUtc,
  periodFromDate,
  todayBusinessDate,
} from '@shared/date'
import { AppError } from '@shared/errors'
import type { AuditService } from './audit.service'
import type { PeriodService } from './period.service'

const EMPLOYEE_CODE_SEQ = 'employee_code'

type DbLike = AppDatabase

function toSalaryDto(row: typeof employeeSalaries.$inferSelect): EmployeeSalaryDto {
  return {
    id: row.id,
    uuid: row.uuid,
    employeeId: row.employeeId,
    salaryType: row.salaryType as SalaryType,
    baseAmount: row.baseAmount,
    commissionPerBottle: row.commissionPerBottle,
    overtimeHourlyRate: row.overtimeHourlyRate,
    effectiveFrom: row.effectiveFrom,
    effectiveTo: row.effectiveTo,
    reason: row.reason,
    createdAt: row.createdAt,
  }
}

export function createEmployeeService(db: AppDatabase, audit: AuditService, period: PeriodService) {
  function outstandingAdvances(employeeId: number, tx: DbLike = db): number {
    const rows = tx
      .select()
      .from(salaryAdvances)
      .where(
        and(eq(salaryAdvances.employeeId, employeeId), eq(salaryAdvances.status, 'outstanding')),
      )
      .all()
    return rows.reduce((s, r) => s + Math.max(0, r.amount - r.settledAmount), 0)
  }

  function currentSalary(
    employeeId: number,
    onDate: string,
    tx: DbLike = db,
  ): EmployeeSalaryDto | null {
    assertBusinessDate(onDate)
    const row = tx
      .select()
      .from(employeeSalaries)
      .where(
        and(
          eq(employeeSalaries.employeeId, employeeId),
          sql`${employeeSalaries.effectiveFrom} <= ${onDate}`,
          or(
            isNull(employeeSalaries.effectiveTo),
            sql`${employeeSalaries.effectiveTo} >= ${onDate}`,
          ),
        ),
      )
      .orderBy(desc(employeeSalaries.effectiveFrom))
      .get()
    return row ? toSalaryDto(row) : null
  }

  function getSalaryFor(employeeId: number, onDate: string): EmployeeSalaryDto | null {
    return currentSalary(employeeId, onDate)
  }

  function toDto(row: typeof employees.$inferSelect, tx: DbLike = db): EmployeeDto {
    return {
      id: row.id,
      uuid: row.uuid,
      code: row.code,
      name: row.name,
      phone: row.phone,
      cnic: row.cnic,
      address: row.address,
      photoPath: row.photoPath,
      emergencyContactName: row.emergencyContactName,
      emergencyContactPhone: row.emergencyContactPhone,
      role: row.role as EmployeeDto['role'],
      joiningDate: row.joiningDate,
      leavingDate: row.leavingDate,
      status: row.status as 'active' | 'inactive',
      notes: row.notes,
      currentSalary: currentSalary(row.id, todayBusinessDate(), tx),
      outstandingAdvances: outstandingAdvances(row.id, tx),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }
  }

  function peekNextCode(): string {
    const row = db.select().from(sequences).where(eq(sequences.name, EMPLOYEE_CODE_SEQ)).get()
    const next = row?.nextValue ?? 1
    return `E-${String(next).padStart(3, '0')}`
  }

  function allocateCode(tx: DbLike, preferred?: string): string {
    if (preferred) {
      const clash = tx
        .select()
        .from(employees)
        .where(and(eq(employees.code, preferred), isNull(employees.deletedAt)))
        .get()
      if (clash) throw new AppError('CONFLICT', `Employee code ${preferred} already exists`)
      const match = /^E-(\d+)$/i.exec(preferred)
      if (match) {
        const n = Number(match[1]) + 1
        const seq = tx.select().from(sequences).where(eq(sequences.name, EMPLOYEE_CODE_SEQ)).get()
        if (!seq) {
          tx.insert(sequences).values({ name: EMPLOYEE_CODE_SEQ, nextValue: n }).run()
        } else if (seq.nextValue <= n - 1) {
          tx.update(sequences)
            .set({ nextValue: n })
            .where(eq(sequences.name, EMPLOYEE_CODE_SEQ))
            .run()
        }
      }
      return preferred
    }
    const seq = tx.select().from(sequences).where(eq(sequences.name, EMPLOYEE_CODE_SEQ)).get()
    let next = 1
    if (!seq) {
      tx.insert(sequences).values({ name: EMPLOYEE_CODE_SEQ, nextValue: 2 }).run()
    } else {
      next = seq.nextValue
      tx.update(sequences)
        .set({ nextValue: next + 1 })
        .where(eq(sequences.name, EMPLOYEE_CODE_SEQ))
        .run()
    }
    return `E-${String(next).padStart(3, '0')}`
  }

  function list(input: {
    search?: string
    role?: string
    status?: 'active' | 'inactive' | 'all'
  }): { items: EmployeeDto[]; total: number } {
    let rows = db
      .select()
      .from(employees)
      .where(isNull(employees.deletedAt))
      .orderBy(employees.name)
      .all()
    const status = input.status ?? 'active'
    if (status !== 'all') rows = rows.filter((r) => r.status === status)
    if (input.role) rows = rows.filter((r) => r.role === input.role)
    if (input.search?.trim()) {
      const q = input.search.trim().toLowerCase()
      rows = rows.filter((r) =>
        [r.code, r.name, r.phone ?? '', r.cnic ?? ''].join(' ').toLowerCase().includes(q),
      )
    }
    return { items: rows.map((r) => toDto(r)), total: rows.length }
  }

  function getById(id: number): { item: EmployeeDto; salaryHistory: EmployeeSalaryDto[] } {
    const row = db
      .select()
      .from(employees)
      .where(and(eq(employees.id, id), isNull(employees.deletedAt)))
      .get()
    if (!row) throw new AppError('NOT_FOUND', `Employee ${id} not found`)
    const history = db
      .select()
      .from(employeeSalaries)
      .where(eq(employeeSalaries.employeeId, id))
      .orderBy(desc(employeeSalaries.effectiveFrom))
      .all()
      .map(toSalaryDto)
    return { item: toDto(row), salaryHistory: history }
  }

  function requireEmployee(id: number, tx: DbLike = db): typeof employees.$inferSelect {
    const row = tx
      .select()
      .from(employees)
      .where(and(eq(employees.id, id), isNull(employees.deletedAt)))
      .get()
    if (!row) throw new AppError('NOT_FOUND', `Employee ${id} not found`)
    return row
  }

  function create(input: CreateEmployeeInput, userId: number): EmployeeDto {
    const effectiveFrom = input.salaryEffectiveFrom ?? input.joiningDate ?? todayBusinessDate()
    assertBusinessDate(effectiveFrom)
    const now = nowIsoUtc()

    const id = db.transaction((tx) => {
      const code = allocateCode(tx, input.code?.trim())
      const inserted = tx
        .insert(employees)
        .values({
          uuid: newUuid(),
          code,
          name: input.name.trim(),
          phone: input.phone?.trim() || null,
          cnic: input.cnic?.trim() || null,
          address: input.address?.trim() || null,
          photoPath: input.photoPath ?? null,
          emergencyContactName: input.emergencyContactName?.trim() || null,
          emergencyContactPhone: input.emergencyContactPhone?.trim() || null,
          role: input.role ?? 'delivery',
          joiningDate: input.joiningDate ?? null,
          leavingDate: null,
          status: 'active',
          notes: input.notes?.trim() || null,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        })
        .returning()
        .get()!

      tx.insert(employeeSalaries)
        .values({
          uuid: newUuid(),
          employeeId: inserted.id,
          salaryType: input.salaryType ?? 'monthly',
          baseAmount: input.baseAmount ?? 0,
          commissionPerBottle: input.commissionPerBottle ?? 0,
          overtimeHourlyRate: input.overtimeHourlyRate ?? 0,
          effectiveFrom,
          effectiveTo: null,
          reason: 'Initial',
          createdAt: now,
          createdBy: userId,
        })
        .run()

      audit.record(
        {
          userId,
          action: 'create',
          entityTable: 'employees',
          entityId: inserted.id,
          summary: `Created employee ${code} — ${input.name.trim()}`,
          after: { id: inserted.id, code, name: input.name.trim() },
        },
        tx,
      )
      return inserted.id
    })
    return getById(id).item
  }

  function update(input: UpdateEmployeeInput, userId: number): EmployeeDto {
    const row = requireEmployee(input.id)
    const now = nowIsoUtc()
    db.transaction((tx) => {
      tx.update(employees)
        .set({
          name: input.name?.trim() ?? row.name,
          phone: input.phone !== undefined ? input.phone?.trim() || null : row.phone,
          cnic: input.cnic !== undefined ? input.cnic?.trim() || null : row.cnic,
          address: input.address !== undefined ? input.address?.trim() || null : row.address,
          photoPath: input.clearPhoto
            ? null
            : input.photoPath !== undefined
              ? input.photoPath
              : row.photoPath,
          emergencyContactName:
            input.emergencyContactName !== undefined
              ? input.emergencyContactName?.trim() || null
              : row.emergencyContactName,
          emergencyContactPhone:
            input.emergencyContactPhone !== undefined
              ? input.emergencyContactPhone?.trim() || null
              : row.emergencyContactPhone,
          role: input.role ?? row.role,
          joiningDate: input.joiningDate !== undefined ? input.joiningDate : row.joiningDate,
          notes: input.notes !== undefined ? input.notes?.trim() || null : row.notes,
          updatedAt: now,
        })
        .where(eq(employees.id, input.id))
        .run()
      audit.record(
        {
          userId,
          action: 'update',
          entityTable: 'employees',
          entityId: input.id,
          summary: `Updated employee ${row.code}`,
          before: { name: row.name, role: row.role, status: row.status },
          after: {
            name: input.name?.trim() ?? row.name,
            role: input.role ?? row.role,
          },
        },
        tx,
      )
    })
    return getById(input.id).item
  }

  function setStatus(
    input: {
      id: number
      status: 'active' | 'inactive'
      leavingDate?: string | null
    },
    userId: number,
  ): { item: EmployeeDto; outstandingAdvances: number; warning: string | null } {
    const row = requireEmployee(input.id)
    const outstanding = outstandingAdvances(input.id)
    let warning: string | null = null
    if (input.status === 'inactive' && outstanding > 0) {
      warning = `Employee has outstanding advances of ${outstanding} paisa. Settle or waive before leaving if needed.`
    }
    if (input.status === 'inactive') {
      if (!input.leavingDate) {
        throw new AppError('VALIDATION_FAILED', 'Leaving date is required when deactivating')
      }
      assertBusinessDate(input.leavingDate)
    }
    const now = nowIsoUtc()
    db.transaction((tx) => {
      tx.update(employees)
        .set({
          status: input.status,
          leavingDate: input.status === 'inactive' ? (input.leavingDate ?? null) : null,
          updatedAt: now,
        })
        .where(eq(employees.id, input.id))
        .run()
      audit.record(
        {
          userId,
          action: 'update',
          entityTable: 'employees',
          entityId: input.id,
          summary: `Employee ${row.code} → ${input.status}`,
          before: { status: row.status, leavingDate: row.leavingDate },
          after: {
            status: input.status,
            leavingDate: input.status === 'inactive' ? input.leavingDate : null,
          },
        },
        tx,
      )
    })
    return { item: getById(input.id).item, outstandingAdvances: outstanding, warning }
  }

  /**
   * Close the current open salary row and insert a new one. Never updates amounts in place.
   * Warns when effective date falls in an already-finalised payroll month.
   */
  function changeSalary(
    input: {
      employeeId: number
      salaryType: SalaryType
      baseAmount: number
      commissionPerBottle?: number
      overtimeHourlyRate?: number
      effectiveFrom: string
      reason?: string | null
      forceClosedPeriod?: boolean
      userId?: number | null
    },
    txOuter?: DbLike,
  ): { item: EmployeeSalaryDto; warning: string | null } {
    assertBusinessDate(input.effectiveFrom)
    requireEmployee(input.employeeId, txOuter ?? db)

    let warning: string | null = null
    try {
      period.guardPeriodOpen(input.effectiveFrom)
    } catch (err) {
      if (err instanceof AppError && err.code === 'PERIOD_LOCKED') {
        warning = `Effective date ${input.effectiveFrom} falls in a closed period.`
        if (!input.forceClosedPeriod) {
          throw new AppError(
            'PERIOD_LOCKED',
            `${warning} Confirm to proceed anyway, or choose another date.`,
            { warning },
          )
        }
      } else {
        throw err
      }
    }

    const periodKey = periodFromDate(input.effectiveFrom)
    const finalized = (txOuter ?? db)
      .select()
      .from(payrollRuns)
      .where(and(eq(payrollRuns.period, periodKey), eq(payrollRuns.status, 'finalized')))
      .get()
    if (finalized) {
      warning = [
        warning,
        `Payroll for ${periodKey} is already finalised — historical slips use the prior salary; new salary applies going forward.`,
      ]
        .filter(Boolean)
        .join(' ')
    }

    const now = nowIsoUtc()
    const effectiveToPrev = addBusinessDays(input.effectiveFrom, -1)

    const run = (tx: DbLike): EmployeeSalaryDto => {
      const openRow = tx
        .select()
        .from(employeeSalaries)
        .where(
          and(
            eq(employeeSalaries.employeeId, input.employeeId),
            isNull(employeeSalaries.effectiveTo),
          ),
        )
        .get()

      if (openRow) {
        if (openRow.effectiveFrom >= input.effectiveFrom) {
          throw new AppError(
            'CONFLICT',
            `A salary already starts on ${openRow.effectiveFrom}. Choose a later effective date.`,
          )
        }
        tx.update(employeeSalaries)
          .set({ effectiveTo: effectiveToPrev })
          .where(eq(employeeSalaries.id, openRow.id))
          .run()
      }

      const inserted = tx
        .insert(employeeSalaries)
        .values({
          uuid: newUuid(),
          employeeId: input.employeeId,
          salaryType: input.salaryType,
          baseAmount: input.baseAmount,
          commissionPerBottle: input.commissionPerBottle ?? 0,
          overtimeHourlyRate: input.overtimeHourlyRate ?? 0,
          effectiveFrom: input.effectiveFrom,
          effectiveTo: null,
          reason: input.reason ?? null,
          createdAt: now,
          createdBy: input.userId ?? null,
        })
        .returning()
        .get()!

      audit.record(
        {
          userId: input.userId,
          action: 'create',
          entityTable: 'employee_salaries',
          entityId: inserted.id,
          summary: `Salary for employee #${input.employeeId} → ${input.baseAmount} paisa from ${input.effectiveFrom}`,
          before: openRow ? toSalaryDto({ ...openRow, effectiveTo: effectiveToPrev }) : undefined,
          after: toSalaryDto(inserted),
        },
        tx,
      )
      return toSalaryDto(inserted)
    }

    const item = txOuter ? run(txOuter) : db.transaction(run)
    return { item, warning }
  }

  function listActiveOptions(): Array<{
    id: number
    code: string
    name: string
    role: EmployeeDto['role']
  }> {
    return db
      .select()
      .from(employees)
      .where(and(isNull(employees.deletedAt), eq(employees.status, 'active')))
      .orderBy(employees.name)
      .all()
      .map((r) => ({
        id: r.id,
        code: r.code,
        name: r.name,
        role: r.role as EmployeeDto['role'],
      }))
  }

  function listPayrollHistory(employeeId: number): Array<{
    period: string
    status: string
    netPayable: number
    paidAmount: number
  }> {
    requireEmployee(employeeId)
    const items = db
      .select({
        period: payrollRuns.period,
        status: payrollRuns.status,
        netPayable: payrollItems.netPayable,
        paidAmount: payrollItems.paidAmount,
        supersededAt: payrollItems.supersededAt,
      })
      .from(payrollItems)
      .innerJoin(payrollRuns, eq(payrollItems.payrollRunId, payrollRuns.id))
      .where(eq(payrollItems.employeeId, employeeId))
      .all()
    return items
      .filter((r) => r.status !== 'void' && r.supersededAt == null)
      .map(({ period, status, netPayable, paidAmount }) => ({
        period,
        status,
        netPayable,
        paidAmount,
      }))
      .sort((a, b) => b.period.localeCompare(a.period))
  }

  return {
    list,
    getById,
    create,
    update,
    setStatus,
    peekNextCode,
    getSalaryFor,
    changeSalary,
    listActiveOptions,
    listPayrollHistory,
    outstandingAdvances,
    requireEmployee,
  }
}

export type EmployeeService = ReturnType<typeof createEmployeeService>
