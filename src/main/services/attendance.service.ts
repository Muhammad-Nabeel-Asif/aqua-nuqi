import { and, eq, isNull } from 'drizzle-orm'
import type { AppDatabase } from '@main/db/client'
import { attendance, employees } from '@main/db/schema'
import type {
  AttendanceCellDto,
  AttendanceRowDto,
  AttendanceStatus,
  WorkingDaysBasis,
} from '@shared/contracts'
import {
  assertBusinessDate,
  assertPeriod,
  datesInPeriod,
  daysInPeriod,
  nowIsoUtc,
  periodFromDate,
  todayBusinessDate,
} from '@shared/date'
import { AppError } from '@shared/errors'
import type { AuditService } from './audit.service'
import type { PeriodService } from './period.service'
import type { SettingsService } from './settings.service'

const STATUS_CYCLE: AttendanceStatus[] = [
  'present',
  'absent',
  'half_day',
  'paid_leave',
  'unpaid_leave',
  'holiday',
]

export function presentDaysFromStatus(status: AttendanceStatus): number {
  if (status === 'present' || status === 'paid_leave') return 1
  if (status === 'half_day') return 0.5
  return 0
}

export function absentDaysFromStatus(status: AttendanceStatus): number {
  if (status === 'absent' || status === 'unpaid_leave') return 1
  if (status === 'half_day') return 0.5
  return 0
}

export function createAttendanceService(
  db: AppDatabase,
  audit: AuditService,
  period: PeriodService,
  settings: SettingsService,
) {
  function workingDaysBasis(): WorkingDaysBasis {
    return settings.get('payroll.workingDaysBasis')
  }

  function guardWritable(date: string, force?: boolean): void {
    assertBusinessDate(date)
    if (!force) period.guardPeriodOpen(date)
  }

  function getMonth(periodKey: string): {
    period: string
    daysInMonth: number
    periodClosed: boolean
    workingDaysBasis: WorkingDaysBasis
    rows: AttendanceRowDto[]
  } {
    assertPeriod(periodKey)
    const dates = datesInPeriod(periodKey)
    const periodClosed = period.isClosed(periodKey)
    const empRows = db
      .select()
      .from(employees)
      .where(and(isNull(employees.deletedAt), eq(employees.status, 'active')))
      .orderBy(employees.name)
      .all()

    const att = db
      .select()
      .from(attendance)
      .where(
        and(
          eq(attendance.attendanceDate, dates[0]!), // placeholder; filter in memory for range
        ),
      )
      .all()
    // Load all attendance for the month in one query via range filter in memory
    const allAtt = db
      .select()
      .from(attendance)
      .all()
      .filter((a) => {
        return a.attendanceDate >= dates[0]! && a.attendanceDate <= dates[dates.length - 1]!
      })
    void att

    const byEmp = new Map<number, Map<string, typeof attendance.$inferSelect>>()
    for (const a of allAtt) {
      let m = byEmp.get(a.employeeId)
      if (!m) {
        m = new Map()
        byEmp.set(a.employeeId, m)
      }
      m.set(a.attendanceDate, a)
    }

    const rows: AttendanceRowDto[] = empRows.map((emp) => {
      const cells: AttendanceCellDto[] = dates.map((date) => {
        const row = byEmp.get(emp.id)?.get(date)
        return {
          date,
          status: (row?.status as AttendanceStatus | undefined) ?? null,
          overtimeHours: row?.overtimeHours ?? 0,
          notes: row?.notes ?? null,
          id: row?.id ?? null,
        }
      })
      let present = 0
      let absent = 0
      let halfDays = 0
      let paidLeave = 0
      let unpaidLeave = 0
      let holidays = 0
      let overtimeHours = 0
      for (const c of cells) {
        if (!c.status) continue
        overtimeHours += c.overtimeHours
        if (c.status === 'present') present += 1
        else if (c.status === 'absent') absent += 1
        else if (c.status === 'half_day') halfDays += 1
        else if (c.status === 'paid_leave') paidLeave += 1
        else if (c.status === 'unpaid_leave') unpaidLeave += 1
        else if (c.status === 'holiday') holidays += 1
      }
      return {
        employeeId: emp.id,
        code: emp.code,
        name: emp.name,
        role: emp.role as AttendanceRowDto['role'],
        cells,
        present,
        absent,
        halfDays,
        paidLeave,
        unpaidLeave,
        holidays,
        overtimeHours,
      }
    })

    return {
      period: periodKey,
      daysInMonth: daysInPeriod(periodKey),
      periodClosed,
      workingDaysBasis: workingDaysBasis(),
      rows,
    }
  }

  function setOne(
    input: {
      employeeId: number
      date: string
      status: AttendanceStatus
      overtimeHours?: number
      notes?: string | null
      forceClosedPeriod?: boolean
    },
    userId: number,
  ): AttendanceCellDto {
    guardWritable(input.date, input.forceClosedPeriod)
    const emp = db
      .select()
      .from(employees)
      .where(and(eq(employees.id, input.employeeId), isNull(employees.deletedAt)))
      .get()
    if (!emp) throw new AppError('NOT_FOUND', 'Employee not found')

    const now = nowIsoUtc()
    const existing = db
      .select()
      .from(attendance)
      .where(
        and(eq(attendance.employeeId, input.employeeId), eq(attendance.attendanceDate, input.date)),
      )
      .get()

    db.transaction((tx) => {
      if (existing) {
        tx.update(attendance)
          .set({
            status: input.status,
            overtimeHours: input.overtimeHours ?? existing.overtimeHours,
            notes: input.notes !== undefined ? input.notes : existing.notes,
            updatedAt: now,
          })
          .where(eq(attendance.id, existing.id))
          .run()
      } else {
        tx.insert(attendance)
          .values({
            employeeId: input.employeeId,
            attendanceDate: input.date,
            status: input.status,
            overtimeHours: input.overtimeHours ?? 0,
            notes: input.notes ?? null,
            createdAt: now,
            updatedAt: now,
          })
          .run()
      }
      audit.record(
        {
          userId,
          action: existing ? 'update' : 'create',
          entityTable: 'attendance',
          entityId: existing?.id ?? input.employeeId,
          summary: `Attendance ${emp.code} ${input.date} → ${input.status}`,
          after: { date: input.date, status: input.status },
        },
        tx,
      )
    })

    const row = db
      .select()
      .from(attendance)
      .where(
        and(eq(attendance.employeeId, input.employeeId), eq(attendance.attendanceDate, input.date)),
      )
      .get()!
    return {
      date: row.attendanceDate,
      status: row.status as AttendanceStatus,
      overtimeHours: row.overtimeHours,
      notes: row.notes,
      id: row.id,
    }
  }

  function setRange(
    input: {
      employeeId: number
      from: string
      to: string
      status: AttendanceStatus
      forceClosedPeriod?: boolean
    },
    userId: number,
  ): number {
    assertBusinessDate(input.from)
    assertBusinessDate(input.to)
    if (input.to < input.from) {
      throw new AppError('VALIDATION_FAILED', 'Range end must be on or after start')
    }
    let updated = 0
    let cursor = input.from
    while (cursor <= input.to) {
      setOne(
        {
          employeeId: input.employeeId,
          date: cursor,
          status: input.status,
          forceClosedPeriod: input.forceClosedPeriod,
        },
        userId,
      )
      updated += 1
      const [y, m, d] = cursor.split('-').map(Number)
      const next = new Date(y!, m! - 1, d! + 1)
      cursor = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`
    }
    return updated
  }

  function markAllPresent(
    input: { date?: string; period?: string; forceClosedPeriod?: boolean },
    userId: number,
  ): number {
    const empRows = db
      .select()
      .from(employees)
      .where(and(isNull(employees.deletedAt), eq(employees.status, 'active')))
      .all()
    let updated = 0
    if (input.period) {
      assertPeriod(input.period)
      for (const date of datesInPeriod(input.period)) {
        for (const emp of empRows) {
          setOne(
            {
              employeeId: emp.id,
              date,
              status: 'present',
              forceClosedPeriod: input.forceClosedPeriod,
            },
            userId,
          )
          updated += 1
        }
      }
    } else {
      const date = input.date ?? todayBusinessDate()
      for (const emp of empRows) {
        setOne(
          {
            employeeId: emp.id,
            date,
            status: 'present',
            forceClosedPeriod: input.forceClosedPeriod,
          },
          userId,
        )
        updated += 1
      }
    }
    return updated
  }

  function markHoliday(
    input: { date: string; forceClosedPeriod?: boolean },
    userId: number,
  ): number {
    const empRows = db
      .select()
      .from(employees)
      .where(and(isNull(employees.deletedAt), eq(employees.status, 'active')))
      .all()
    let updated = 0
    for (const emp of empRows) {
      setOne(
        {
          employeeId: emp.id,
          date: input.date,
          status: 'holiday',
          forceClosedPeriod: input.forceClosedPeriod,
        },
        userId,
      )
      updated += 1
    }
    return updated
  }

  function todayPanel(date?: string): {
    date: string
    periodClosed: boolean
    items: Array<{
      employeeId: number
      code: string
      name: string
      status: AttendanceStatus | null
      overtimeHours: number
    }>
  } {
    const d = date ?? todayBusinessDate()
    assertBusinessDate(d)
    const empRows = db
      .select()
      .from(employees)
      .where(and(isNull(employees.deletedAt), eq(employees.status, 'active')))
      .orderBy(employees.name)
      .all()
    const att = db.select().from(attendance).where(eq(attendance.attendanceDate, d)).all()
    const byEmp = new Map(att.map((a) => [a.employeeId, a]))
    return {
      date: d,
      periodClosed: period.isClosed(periodFromDate(d)),
      items: empRows.map((e) => ({
        employeeId: e.id,
        code: e.code,
        name: e.name,
        status: (byEmp.get(e.id)?.status as AttendanceStatus | undefined) ?? null,
        overtimeHours: byEmp.get(e.id)?.overtimeHours ?? 0,
      })),
    }
  }

  function summarizeForPayroll(
    employeeId: number,
    periodKey: string,
  ): {
    daysPresent: number
    daysAbsent: number
    overtimeHours: number
    holidayDates: Set<string>
  } {
    assertPeriod(periodKey)
    const dates = datesInPeriod(periodKey)
    const rows = db
      .select()
      .from(attendance)
      .where(eq(attendance.employeeId, employeeId))
      .all()
      .filter((a) => a.attendanceDate >= dates[0]! && a.attendanceDate <= dates[dates.length - 1]!)

    let daysPresent = 0
    let daysAbsent = 0
    let overtimeHours = 0
    const holidayDates = new Set<string>()
    for (const r of rows) {
      const st = r.status as AttendanceStatus
      daysPresent += presentDaysFromStatus(st)
      daysAbsent += absentDaysFromStatus(st)
      overtimeHours += r.overtimeHours
      if (st === 'holiday') holidayDates.add(r.attendanceDate)
    }

    // Unmarked working-day equivalents count as absent so blank grids cannot pay full salary.
    // covered = present + absent (half-days contribute 1 total); holidays are outside working days
    // for the `working_days` basis and do not inflate coverage for fixed_26 / calendar either.
    const workingDays = resolveWorkingDays(periodKey)
    const covered = daysPresent + daysAbsent
    if (covered < workingDays) {
      daysAbsent += workingDays - covered
    }

    return { daysPresent, daysAbsent, overtimeHours, holidayDates }
  }

  /** Company holidays = dates where every active employee is marked holiday (or at least one is). */
  function holidayDatesInPeriod(periodKey: string): Set<string> {
    assertPeriod(periodKey)
    const dates = datesInPeriod(periodKey)
    const rows = db
      .select()
      .from(attendance)
      .all()
      .filter(
        (a) =>
          a.status === 'holiday' &&
          a.attendanceDate >= dates[0]! &&
          a.attendanceDate <= dates[dates.length - 1]!,
      )
    return new Set(rows.map((r) => r.attendanceDate))
  }

  function resolveWorkingDays(periodKey: string, basis?: WorkingDaysBasis): number {
    const b = basis ?? workingDaysBasis()
    if (b === 'fixed_26') return 26
    if (b === 'calendar') return daysInPeriod(periodKey)
    // actual working days excluding declared holidays
    return Math.max(0, daysInPeriod(periodKey) - holidayDatesInPeriod(periodKey).size)
  }

  function cycleStatus(current: AttendanceStatus | null): AttendanceStatus {
    if (!current) return 'present'
    const idx = STATUS_CYCLE.indexOf(current)
    return STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length]!
  }

  return {
    getMonth,
    setOne,
    setRange,
    markAllPresent,
    markHoliday,
    todayPanel,
    summarizeForPayroll,
    resolveWorkingDays,
    workingDaysBasis,
    holidayDatesInPeriod,
    cycleStatus,
  }
}

export type AttendanceService = ReturnType<typeof createAttendanceService>
