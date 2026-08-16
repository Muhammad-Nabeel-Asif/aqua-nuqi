import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { promptDialog } from '@renderer/components/ConfirmDialog'
import { PageHeader } from '@renderer/components/PageHeader'
import { toast } from '@renderer/components/Toast'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { api } from '@renderer/lib/api'
import { ATTENDANCE_LABEL } from '@renderer/lib/plain-labels'
import type { AttendanceStatus } from '@shared/contracts'
import { todayBusinessDate } from '@shared/date'
import { AppError } from '@shared/errors'

const ORDER: AttendanceStatus[] = [
  'present',
  'absent',
  'half_day',
  'paid_leave',
  'unpaid_leave',
  'holiday',
]
const BADGES: Record<AttendanceStatus, { letter: string; className: string }> = {
  present: { letter: 'P', className: 'bg-emerald-100 text-emerald-800' },
  absent: { letter: 'A', className: 'bg-red-100 text-red-800' },
  half_day: { letter: 'H', className: 'bg-amber-100 text-amber-800' },
  paid_leave: { letter: 'L', className: 'bg-blue-100 text-blue-800' },
  unpaid_leave: { letter: 'U', className: 'bg-orange-100 text-orange-800' },
  holiday: { letter: 'O', className: 'bg-slate-200 text-slate-700' },
}
const currentPeriod = todayBusinessDate().slice(0, 7)

function nextStatus(current: AttendanceStatus | null): AttendanceStatus {
  if (current == null) return 'present'
  return ORDER[(ORDER.indexOf(current) + 1) % ORDER.length]!
}

export function AttendancePage() {
  const qc = useQueryClient()
  const [searchParams] = useSearchParams()
  const focusEmployeeId = Number(searchParams.get('employeeId') || '') || null
  const [period, setPeriod] = useState(currentPeriod)
  const dragRef = useRef<{
    employeeId: number
    from: string
    to: string
    status: AttendanceStatus
  } | null>(null)
  const monthQ = useQuery({
    queryKey: ['attendance', period],
    queryFn: () => api.attendance.getMonth(period),
  })
  const todayQ = useQuery({
    queryKey: ['attendance', 'today'],
    queryFn: () => api.attendance.today(),
  })
  const month = monthQ.data
  const days = useMemo(
    () => Array.from({ length: month?.daysInMonth ?? 0 }, (_, i) => i + 1),
    [month?.daysInMonth],
  )
  const closed = month?.periodClosed ?? false
  const today = todayBusinessDate()
  const rows = useMemo(() => {
    const all = month?.rows ?? []
    if (focusEmployeeId == null) return all
    return all.filter((r) => r.employeeId === focusEmployeeId)
  }, [month?.rows, focusEmployeeId])

  async function invalidate() {
    await qc.invalidateQueries({ queryKey: ['attendance'] })
  }
  async function setCell(employeeId: number, date: string, status: AttendanceStatus) {
    if (closed) return
    try {
      await api.attendance.set({ employeeId, date, status })
      await invalidate()
    } catch (err) {
      toast({
        title: err instanceof AppError ? err.message : 'Attendance update failed',
        variant: 'error',
      })
    }
  }
  async function applyRange(
    employeeId: number,
    from: string,
    to: string,
    status: AttendanceStatus,
  ) {
    if (closed) return
    const start = from <= to ? from : to
    const end = from <= to ? to : from
    try {
      await api.attendance.setRange({ employeeId, from: start, to: end, status })
      await invalidate()
    } catch (err) {
      toast({
        title: err instanceof AppError ? err.message : 'Range update failed',
        variant: 'error',
      })
    }
  }
  async function markPresent(input: { date?: string; period?: string }) {
    try {
      const result = await api.attendance.markAllPresent(input)
      toast({ title: `Marked ${result.updated} attendance records present`, variant: 'success' })
      await invalidate()
    } catch (err) {
      toast({
        title: err instanceof AppError ? err.message : 'Bulk update failed',
        variant: 'error',
      })
    }
  }
  async function markHoliday() {
    const date = await promptDialog({
      title: 'Mark a holiday',
      description: 'Every employee will be marked Off on this date.',
      label: 'Date (YYYY-MM-DD)',
      defaultValue: today,
      confirmLabel: 'Mark holiday',
    })
    if (!date) return
    try {
      const result = await api.attendance.markHoliday({ date })
      toast({ title: `Marked ${result.updated} records as holiday`, variant: 'success' })
      await invalidate()
    } catch (err) {
      toast({
        title: err instanceof AppError ? err.message : 'Could not mark holiday',
        variant: 'error',
      })
    }
  }
  async function cycleToday(employeeId: number, current: AttendanceStatus | null) {
    if (todayQ.data?.periodClosed) return
    await setCell(employeeId, todayQ.data?.date ?? today, nextStatus(current))
  }

  return (
    <div>
      <PageHeader
        title="Attendance"
        subtitle="Click a cell to cycle: Present (P), Absent (A), Half day (H), Leave (L), Unpaid (U), Off (O). Drag to fill a range."
        actions={
          <Button variant="outline" asChild>
            <Link to="/employees">Employees</Link>
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border bg-white p-3">
        <label className="text-sm">
          <span className="mb-1 block text-muted-foreground">Month</span>
          <Input
            className="w-40"
            type="month"
            data-testid="attendance-period"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
          />
        </label>
        <div className="text-sm">
          <span className="block text-muted-foreground">Working-days basis</span>
          <strong>{month?.workingDaysBasis?.replaceAll('_', ' ') ?? 'Loading…'}</strong>
        </div>
        {closed ? (
          <span className="rounded bg-amber-100 px-2 py-1 text-xs text-amber-900">
            Period locked — read only
          </span>
        ) : null}
        {focusEmployeeId != null ? (
          <span className="rounded bg-sky-100 px-2 py-1 text-xs text-sky-900">
            Filtered to employee #{focusEmployeeId}{' '}
            <Link className="underline" to="/employees/attendance">
              Clear
            </Link>
          </span>
        ) : null}
        <div className="ml-auto flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={closed}
            onClick={() => void markPresent({ date: today })}
          >
            Present today
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={closed}
            data-testid="attendance-present-month"
            onClick={() => void markPresent({ period })}
          >
            Present month
          </Button>
          <Button size="sm" variant="outline" disabled={closed} onClick={() => void markHoliday()}>
            Mark holiday
          </Button>
        </div>
      </div>
      <div className="grid gap-4 xl:grid-cols-[1fr_280px]">
        <div className="overflow-auto rounded-lg border bg-white">
          <table className="min-w-max text-center text-xs">
            <thead className="sticky top-0 bg-sky-50 text-slate-600">
              <tr>
                <th className="sticky left-0 z-10 min-w-48 bg-sky-50 px-3 py-3 text-left">
                  Employee
                </th>
                {days.map((day) => (
                  <th key={day} className="min-w-8 px-1">
                    {day}
                  </th>
                ))}
                <th className="px-2">P</th>
                <th className="px-2">A</th>
                <th className="px-2">H</th>
              </tr>
            </thead>
            <tbody>
              {monthQ.isLoading ? (
                <tr>
                  <td className="p-8 text-left" colSpan={days.length + 4}>
                    Loading attendance…
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.employeeId} className="border-t hover:bg-sky-50/50">
                    <td className="sticky left-0 bg-white px-3 py-2 text-left text-sm">
                      <Link
                        className="font-medium text-sky-800"
                        to={`/employees/${row.employeeId}`}
                      >
                        {row.code}
                      </Link>{' '}
                      <span>{row.name}</span>
                    </td>
                    {row.cells.map((cell) => {
                      const status = cell.status
                      const badge = status ? BADGES[status] : null
                      return (
                        <td key={cell.date} className="p-0.5">
                          <button
                            type="button"
                            disabled={closed}
                            data-testid={`att-${cell.date}`}
                            title={`${cell.date}: ${status ? (ATTENDANCE_LABEL[status] ?? status) : 'not set'}`}
                            onMouseDown={(e) => {
                              if (closed || e.button !== 0) return
                              e.preventDefault()
                              const next = nextStatus(status)
                              dragRef.current = {
                                employeeId: row.employeeId,
                                from: cell.date,
                                to: cell.date,
                                status: next,
                              }
                            }}
                            onMouseEnter={() => {
                              const drag = dragRef.current
                              if (!drag || drag.employeeId !== row.employeeId || closed) return
                              drag.to = cell.date
                            }}
                            onMouseUp={() => {
                              const drag = dragRef.current
                              dragRef.current = null
                              if (!drag || drag.employeeId !== row.employeeId || closed) return
                              void applyRange(drag.employeeId, drag.from, drag.to, drag.status)
                            }}
                            className={`h-7 w-7 rounded text-xs font-bold disabled:cursor-not-allowed disabled:opacity-70 ${badge?.className ?? 'bg-slate-50 text-slate-400'}`}
                          >
                            {badge?.letter ?? '—'}
                          </button>
                        </td>
                      )
                    })}
                    <td>{row.present}</td>
                    <td>{row.absent}</td>
                    <td>{row.halfDays}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <aside className="rounded-lg border bg-white p-4">
          <h2 className="font-semibold">Today’s attendance</h2>
          <p className="mt-1 text-xs text-muted-foreground">{todayQ.data?.date ?? today}</p>
          <p className="mt-1 text-xs text-muted-foreground">Tap a row to cycle status</p>
          <div className="mt-3 space-y-2">
            {(todayQ.data?.items ?? []).map((item) => {
              const badge = item.status ? BADGES[item.status] : null
              const locked = todayQ.data?.periodClosed ?? false
              return (
                <button
                  key={item.employeeId}
                  type="button"
                  disabled={locked}
                  onClick={() => void cycleToday(item.employeeId, item.status)}
                  className="flex w-full items-center justify-between gap-2 border-b pb-2 text-left text-sm hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  <span className="min-w-0 truncate text-sky-800">
                    {item.code} · {item.name}
                  </span>
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-bold ${badge?.className ?? 'bg-slate-100 text-slate-600'}`}
                  >
                    {badge?.letter ?? '—'}
                  </span>
                </button>
              )
            })}
            {!todayQ.data?.items.length ? (
              <p className="text-sm text-muted-foreground">No active employees.</p>
            ) : null}
          </div>
        </aside>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        P present · A absent · H half day · L paid leave · U unpaid leave · O holiday · — not set
        (counts as absent for payroll)
      </p>
    </div>
  )
}
