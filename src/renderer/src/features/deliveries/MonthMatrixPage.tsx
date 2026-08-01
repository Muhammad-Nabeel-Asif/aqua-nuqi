import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useCallback, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Money } from '@renderer/components/Money'
import { PageHeader } from '@renderer/components/PageHeader'
import { toast } from '@renderer/components/Toast'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { api } from '@renderer/lib/api'
import { currentPeriod, periodEnd, periodStart } from '@shared/date'
import { matrixCardQtyUpsert } from '@shared/delivery-entry'
import { AppError } from '@shared/errors'
import { isPakistanHoliday } from '@shared/holidays'
import { DeliveryDetailDialog } from './DeliveryDetailDialog'
import { DeliveryQtyCell } from './DeliveryQtyCell'

function isTintedDay(period: string, day: number): boolean {
  const date = `${period}-${String(day).padStart(2, '0')}`
  const wd = new Date(`${date}T12:00:00`).getDay()
  return wd === 0 || wd === 6 || isPakistanHoliday(date)
}

export function MonthMatrixPage() {
  const qc = useQueryClient()
  const [period, setPeriod] = useState(currentPeriod())
  const [routeId, setRouteId] = useState('')
  const [areaId, setAreaId] = useState('')
  const [search, setSearch] = useState('')
  const [focus, setFocus] = useState({ row: 0, day: 1 })
  const [detail, setDetail] = useState<{
    deliveryId?: number | null
    customerId: number
    customerName: string
    date: string
    quantity?: number
    rate?: number
  } | null>(null)
  const parentRef = useRef<HTMLDivElement>(null)

  const areas = useQuery({ queryKey: ['areas'], queryFn: () => api.areas.list() })
  const routes = useQuery({ queryKey: ['routes'], queryFn: () => api.routes.list() })

  const grid = useQuery({
    queryKey: ['deliveries', 'matrix', period, routeId, areaId, search],
    queryFn: () =>
      api.deliveries.getMonthGrid({
        period,
        routeId: routeId ? Number(routeId) : undefined,
        areaId: areaId ? Number(areaId) : undefined,
        search: search || undefined,
      }),
  })

  const rows = grid.data?.rows ?? []
  const daysInMonth = grid.data?.daysInMonth ?? 31

  const rowVirtual = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 36,
    overscan: 10,
  })

  const colVirtual = useVirtualizer({
    horizontal: true,
    count: daysInMonth,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 44,
    overscan: 6,
  })

  const saveCell = useCallback(
    async (customerId: number, day: number, quantity: number | null) => {
      const date = `${period}-${String(day).padStart(2, '0')}`
      try {
        await api.deliveries.upsert({
          customerId,
          date,
          ...matrixCardQtyUpsert(quantity),
        })
        await qc.invalidateQueries({ queryKey: ['deliveries', 'matrix', period] })
      } catch (err) {
        toast({
          title: err instanceof AppError ? err.message : 'Save failed',
          description: err instanceof AppError ? err.code : undefined,
          variant: 'error',
        })
        throw err
      }
    },
    [period, qc],
  )

  async function exportGrid(format: 'csv' | 'xlsx') {
    const file = await api.deliveries.exportMonthGrid({
      period,
      routeId: routeId ? Number(routeId) : undefined,
      areaId: areaId ? Number(areaId) : undefined,
      search: search || undefined,
      format,
    })
    const bin = atob(file.base64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    const blob = new Blob([bytes], { type: file.mimeType })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = file.fileName
    a.click()
    URL.revokeObjectURL(url)
  }

  function printGrid() {
    window.print()
  }

  const dayCols = useMemo(() => Array.from({ length: daysInMonth }, (_, i) => i + 1), [daysInMonth])
  const stickyWidth = 200
  const totalsWidth = 140

  return (
    <div className="flex h-[calc(100vh-7rem)] flex-col">
      <PageHeader
        title="Month matrix"
        subtitle={`${periodStart(period)} → ${periodEnd(period)}`}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to="/deliveries/daily">Daily entry</Link>
            </Button>
            <Button variant="outline" onClick={() => void exportGrid('csv')}>
              Export CSV
            </Button>
            <Button variant="outline" onClick={() => void exportGrid('xlsx')}>
              Export Excel
            </Button>
            <Button variant="outline" onClick={printGrid}>
              Print
            </Button>
          </>
        }
      />

      <div className="mb-3 flex flex-wrap gap-2">
        <Input
          type="month"
          className="w-40"
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
        />
        <select
          className="h-10 rounded-md border px-2 text-sm"
          value={routeId}
          onChange={(e) => setRouteId(e.target.value)}
        >
          <option value="">All routes</option>
          {(routes.data?.items ?? []).map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        <select
          className="h-10 rounded-md border px-2 text-sm"
          value={areaId}
          onChange={(e) => setAreaId(e.target.value)}
        >
          <option value="">All areas</option>
          {(areas.data?.items ?? []).map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <Input
          className="w-48"
          placeholder="Search…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {grid.data?.periodClosed && (
          <span className="self-center rounded bg-amber-100 px-2 py-1 text-xs">Period locked</span>
        )}
        <span className="self-center text-sm text-muted-foreground">
          {rows.length} customers · {grid.data?.grandTotalUnits ?? 0} units ·{' '}
          <Money value={grid.data?.grandTotalAmount ?? 0} />
        </span>
      </div>

      <div
        ref={parentRef}
        className="relative min-h-0 flex-1 overflow-auto rounded border bg-white print:overflow-visible"
      >
        <div
          style={{
            width: stickyWidth + daysInMonth * 44 + totalsWidth,
            height: 32 + rows.length * 36 + 32,
            position: 'relative',
          }}
        >
          {/* header */}
          <div
            className="sticky top-0 z-20 flex border-b bg-slate-50 text-xs font-medium"
            style={{ height: 32 }}
          >
            <div
              className="sticky left-0 z-30 flex items-center border-r bg-slate-50 px-2"
              style={{ width: stickyWidth }}
            >
              Customer
            </div>
            <div className="relative flex" style={{ width: daysInMonth * 44 }}>
              {colVirtual.getVirtualItems().map((vCol) => {
                const day = dayCols[vCol.index]!
                return (
                  <div
                    key={day}
                    className={`absolute top-0 flex h-8 items-center justify-center border-r ${
                      isTintedDay(period, day) ? 'bg-slate-100/80' : ''
                    }`}
                    style={{ left: vCol.start, width: vCol.size }}
                  >
                    {day}
                  </div>
                )
              })}
            </div>
            <div className="flex w-[140px] items-center justify-end px-2">Total</div>
          </div>

          {rowVirtual.getVirtualItems().map((vRow) => {
            const row = rows[vRow.index]!
            const byDay = new Map(row.cells.map((c) => [c.day, c]))
            return (
              <div
                key={row.customerId}
                className="absolute flex border-b border-slate-100 text-sm"
                style={{
                  top: 32 + vRow.start,
                  height: vRow.size,
                  width: stickyWidth + daysInMonth * 44 + totalsWidth,
                }}
              >
                <div
                  className="sticky left-0 z-10 truncate border-r bg-white px-2 py-1"
                  style={{ width: stickyWidth }}
                >
                  <Link to={`/customers/${row.customerId}/card/${period}`} className="text-sky-800">
                    {row.code}
                  </Link>{' '}
                  {row.name}
                  {grid.data?.periodClosed && <span className="ml-1 text-amber-600">🔒</span>}
                </div>
                <div className="relative" style={{ width: daysInMonth * 44 }}>
                  {colVirtual.getVirtualItems().map((vCol) => {
                    const day = dayCols[vCol.index]!
                    const cell = byDay.get(day)
                    const locked = cell?.locked || Boolean(grid.data?.periodClosed)
                    return (
                      <div
                        key={day}
                        title={
                          cell
                            ? `Qty ${cell.quantity} · Empties ${cell.emptiesCollected} · Amount ${cell.amount / 100}`
                            : undefined
                        }
                        className={`absolute top-0 flex h-9 items-center justify-center border-r ${
                          isTintedDay(period, day) ? 'bg-slate-50' : ''
                        }`}
                        style={{ left: vCol.start, width: vCol.size }}
                      >
                        <DeliveryQtyCell
                          value={cell?.quantity ?? null}
                          disabled={locked}
                          autoFocus={focus.row === vRow.index && focus.day === day}
                          className="h-7 w-10 text-xs"
                          onSave={(v) => saveCell(row.customerId, day, v)}
                          onMove={(dir) => {
                            let nextRow = vRow.index
                            let nextDay = day
                            if (dir === 'enter' || dir === 'down')
                              nextRow = Math.min(rows.length - 1, vRow.index + 1)
                            if (dir === 'up') nextRow = Math.max(0, vRow.index - 1)
                            if (dir === 'right' || dir === 'enter') {
                              /* enter already moved down */
                            }
                            if (dir === 'right') nextDay = Math.min(daysInMonth, day + 1)
                            if (dir === 'left') nextDay = Math.max(1, day - 1)
                            if (dir === 'enter') nextDay = day
                            setFocus({ row: nextRow, day: nextDay })
                            rowVirtual.scrollToIndex(nextRow)
                            colVirtual.scrollToIndex(nextDay - 1)
                          }}
                          onOpenDetail={() =>
                            setDetail({
                              deliveryId: cell?.deliveryId,
                              customerId: row.customerId,
                              customerName: row.name,
                              date: `${period}-${String(day).padStart(2, '0')}`,
                              quantity: cell?.quantity,
                              rate: row.rate,
                            })
                          }
                        />
                        {cell && (cell.emptiesDiffer || cell.hasNote) && (
                          <span className="absolute right-0 top-0 h-1.5 w-1.5 rounded-full bg-amber-500" />
                        )}
                      </div>
                    )
                  })}
                </div>
                <div className="flex w-[140px] flex-col items-end justify-center px-2 text-xs tabular-nums">
                  <span>{row.totalUnits} u</span>
                  <Money value={row.totalAmount} />
                </div>
              </div>
            )
          })}

          {/* footer day totals */}
          <div
            className="sticky bottom-0 z-20 flex border-t bg-sky-50 text-xs font-medium"
            style={{
              top: 32 + rows.length * 36,
              height: 32,
            }}
          >
            <div
              className="sticky left-0 z-30 flex items-center border-r bg-sky-50 px-2"
              style={{ width: stickyWidth }}
            >
              Day totals
            </div>
            <div className="relative" style={{ width: daysInMonth * 44 }}>
              {colVirtual.getVirtualItems().map((vCol) => {
                const day = dayCols[vCol.index]!
                const t = grid.data?.dayTotals.find((d) => d.day === day)
                return (
                  <div
                    key={day}
                    className="absolute top-0 flex h-8 items-center justify-center border-r tabular-nums"
                    style={{ left: vCol.start, width: vCol.size }}
                  >
                    {t?.totalUnits ?? 0}
                  </div>
                )
              })}
            </div>
            <div className="flex w-[140px] items-center justify-end px-2 tabular-nums">
              {grid.data?.grandTotalUnits ?? 0}
            </div>
          </div>
        </div>
      </div>

      {detail && (
        <DeliveryDetailDialog
          open
          onClose={() => setDetail(null)}
          deliveryId={detail.deliveryId}
          defaults={{
            customerId: detail.customerId,
            customerName: detail.customerName,
            date: detail.date,
            quantity: detail.quantity,
            rate: detail.rate,
          }}
        />
      )}
    </div>
  )
}
