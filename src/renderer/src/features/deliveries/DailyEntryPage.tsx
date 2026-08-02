import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Money } from '@renderer/components/Money'
import { PageHeader } from '@renderer/components/PageHeader'
import { toast } from '@renderer/components/Toast'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { api } from '@renderer/lib/api'
import type { DayListRowDto, GetDayListOutput } from '@shared/contracts'
import { addBusinessDays, todayBusinessDate } from '@shared/date'
import { AppError } from '@shared/errors'
import { DeliveryDetailDialog } from './DeliveryDetailDialog'
import { DeliveryQtyCell } from './DeliveryQtyCell'
import { WalkInDialog } from './WalkInDialog'

type FocusCol = 'qty' | 'empties'

export function DailyEntryPage() {
  const qc = useQueryClient()
  const [date, setDate] = useState(todayBusinessDate())
  const [routeId, setRouteId] = useState('')
  const [areaId, setAreaId] = useState('')
  const [employeeId, setEmployeeId] = useState('')
  const [search, setSearch] = useState('')
  const [showCash, setShowCash] = useState(false)
  const [focus, setFocus] = useState<{ row: number; col: FocusCol }>({ row: 0, col: 'qty' })
  const [detail, setDetail] = useState<{
    deliveryId?: number | null
    customerId: number
    customerName: string
    quantity?: number
    emptiesCollected?: number
    rate?: number
  } | null>(null)
  const [walkIn, setWalkIn] = useState(false)
  const [pendingCopy, setPendingCopy] = useState<
    Map<number, { quantity: number; emptiesCollected: number }>
  >(new Map())
  const parentRef = useRef<HTMLDivElement>(null)

  const areas = useQuery({ queryKey: ['areas'], queryFn: () => api.areas.list() })
  const routes = useQuery({ queryKey: ['routes'], queryFn: () => api.routes.list() })
  const employees = useQuery({
    queryKey: ['employees', 'active'],
    queryFn: () => api.employees.listActive(),
  })
  const missed = useQuery({
    queryKey: ['deliveries', 'missed', date, routeId],
    queryFn: () =>
      api.deliveries.missed({
        asOf: date,
        routeId: routeId ? Number(routeId) : undefined,
      }),
  })

  const listQuery = useQuery({
    queryKey: ['deliveries', 'day', date, routeId, areaId, employeeId, search],
    queryFn: () =>
      api.deliveries.getDayList({
        date,
        routeId: routeId ? Number(routeId) : undefined,
        areaId: areaId ? Number(areaId) : undefined,
        employeeId: employeeId ? Number(employeeId) : undefined,
        search: search || undefined,
      }),
  })

  const rows = listQuery.data?.items ?? []
  const totals = listQuery.data?.totals

  const virtual = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 44,
    overscan: 12,
  })

  useEffect(() => {
    setPendingCopy(new Map())
  }, [date, routeId, areaId, employeeId])

  const dayQueryKey = useMemo(
    () => ['deliveries', 'day', date, routeId, areaId, employeeId, search] as const,
    [date, routeId, areaId, employeeId, search],
  )

  const upsert = useCallback(
    async (
      row: DayListRowDto,
      patch: { quantity?: number | null; emptiesCollected?: number | null },
    ) => {
      const qty =
        patch.quantity !== undefined
          ? patch.quantity
          : (row.quantity ?? pendingCopy.get(row.customerId)?.quantity ?? null)
      const empties =
        patch.emptiesCollected !== undefined
          ? patch.emptiesCollected
          : (row.emptiesCollected ?? pendingCopy.get(row.customerId)?.emptiesCollected ?? qty ?? 0)

      // Clear cell → void
      if ((qty == null || qty === 0) && (empties == null || empties === 0) && !row.deliveryId) {
        setPendingCopy((m) => {
          const n = new Map(m)
          n.delete(row.customerId)
          return n
        })
        return
      }

      const quantity = qty ?? 0
      const emptiesCollected =
        patch.emptiesCollected !== undefined
          ? (patch.emptiesCollected ?? 0)
          : quantity === 0 && patch.quantity !== undefined
            ? 0
            : (empties ?? quantity)

      const amount = row.billingMode === 'monthly_package' || row.isFree ? 0 : quantity * row.rate

      const previous = qc.getQueryData<GetDayListOutput>(dayQueryKey)

      // Optimistic row + footer patch; rollback on failure.
      qc.setQueryData<GetDayListOutput>(dayQueryKey, (old) => {
        if (!old) return old
        const items = old.items.map((item) =>
          item.customerId === row.customerId
            ? {
                ...item,
                quantity,
                emptiesCollected,
                amount,
                deliveryId: item.deliveryId ?? -1,
              }
            : item,
        )
        const served = items.filter(
          (i) => i.quantity != null && (i.quantity > 0 || (i.emptiesCollected ?? 0) > 0),
        )
        return {
          ...old,
          items,
          totals: {
            customersServed: served.length,
            totalBottles: served.reduce((s, i) => s + (i.quantity ?? 0), 0),
            totalEmpties: served.reduce((s, i) => s + (i.emptiesCollected ?? 0), 0),
            totalAmount: served.reduce((s, i) => s + (i.amount ?? 0), 0),
            totalCash: served.reduce((s, i) => s + (i.cashCollected ?? 0), 0),
          },
        }
      })

      try {
        await api.deliveries.upsert({
          customerId: row.customerId,
          date,
          quantity,
          emptiesCollected,
        })
        setPendingCopy((m) => {
          const n = new Map(m)
          n.delete(row.customerId)
          return n
        })
        await qc.invalidateQueries({ queryKey: ['deliveries', 'day', date] })
        await qc.invalidateQueries({ queryKey: ['deliveries', 'missed'] })
      } catch (err) {
        if (previous) qc.setQueryData(dayQueryKey, previous)
        else await qc.invalidateQueries({ queryKey: dayQueryKey })
        const e = err instanceof AppError ? err : null
        toast({
          title: e?.message ?? 'Save failed',
          description: e?.code,
          variant: 'error',
        })
        throw err
      }
    },
    [date, dayQueryKey, pendingCopy, qc],
  )

  const copyPrev = useMutation({
    mutationFn: () =>
      api.deliveries.copyPreviousDay({
        date,
        routeId: routeId ? Number(routeId) : undefined,
      }),
    onSuccess: (data) => {
      if (!data.sourceDate) {
        toast({ title: 'No previous delivery day found', variant: 'error' })
        return
      }
      const map = new Map<number, { quantity: number; emptiesCollected: number }>()
      for (const item of data.items) {
        map.set(item.customerId, {
          quantity: item.quantity,
          emptiesCollected: item.emptiesCollected,
        })
      }
      setPendingCopy(map)
      toast({
        title: `Copied from ${data.sourceDate} — review and confirm each row`,
        variant: 'success',
      })
    },
  })

  function move(row: number, col: FocusCol, dir: 'up' | 'down' | 'left' | 'right' | 'enter') {
    let nextRow = row
    let nextCol = col
    if (dir === 'enter' || dir === 'down') {
      nextRow = Math.min(rows.length - 1, row + 1)
      nextCol = 'qty'
    } else if (dir === 'up') {
      nextRow = Math.max(0, row - 1)
      nextCol = 'qty'
    } else if (dir === 'right') {
      if (col === 'qty') nextCol = 'empties'
      else {
        nextRow = Math.min(rows.length - 1, row + 1)
        nextCol = 'qty'
      }
    } else if (dir === 'left') {
      if (col === 'empties') nextCol = 'qty'
      else {
        nextRow = Math.max(0, row - 1)
        nextCol = 'empties'
      }
    }
    setFocus({ row: nextRow, col: nextCol })
    virtual.scrollToIndex(nextRow, { align: 'auto' })
  }

  const periodClosed = listQuery.data?.periodClosed

  const focusKey = useMemo(() => `${focus.row}:${focus.col}`, [focus])

  return (
    <div className="flex h-[calc(100vh-7rem)] flex-col">
      <PageHeader
        title="Daily entry"
        subtitle="Keyboard: type qty → Enter next row · Tab empties · Esc cancel"
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to="/deliveries/matrix">Month matrix</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/deliveries/bottles-out">Bottles out</Link>
            </Button>
            <Button variant="outline" onClick={() => setWalkIn(true)}>
              Walk-in sale
            </Button>
            <Button variant="outline" disabled={periodClosed} onClick={() => copyPrev.mutate()}>
              Copy previous day
            </Button>
            <Button
              variant="outline"
              disabled={periodClosed}
              onClick={() =>
                void (async () => {
                  try {
                    const preview = await api.payments.collectedCashPreview(date)
                    if (!preview.rows.length || preview.total <= 0) {
                      toast({ title: 'No cash collected to post', variant: 'error' })
                      return
                    }
                    const pending = preview.rows.filter((r) => !r.alreadyPosted)
                    if (!pending.length) {
                      toast({ title: 'Already posted for this date', variant: 'error' })
                      return
                    }
                    const ok = window.confirm(
                      `Post cash collected for ${date} as payments?\n` +
                        `${pending.length} customers · Rs ${(preview.total / 100).toLocaleString('en-PK')}`,
                    )
                    if (!ok) return
                    const res = await api.payments.postCollectedCash(date)
                    toast({
                      title: `Posted ${res.created} payments`,
                      description: `Total Rs ${(res.totalAmount / 100).toLocaleString('en-PK')}`,
                      variant: 'success',
                    })
                    await qc.invalidateQueries({ queryKey: ['day-list'] })
                  } catch (e) {
                    toast({
                      title: 'Post cash failed',
                      description: e instanceof Error ? e.message : 'Error',
                      variant: 'error',
                    })
                  }
                })()
              }
            >
              Post today&apos;s collected cash
            </Button>
          </>
        }
      />

      <div className="mb-3 flex flex-wrap items-end gap-2">
        <div>
          <label className="text-xs text-muted-foreground">Date</label>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" onClick={() => setDate(addBusinessDays(date, -1))}>
              ◀
            </Button>
            <Input
              type="date"
              className="w-40"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
            <Button variant="outline" size="sm" onClick={() => setDate(addBusinessDays(date, 1))}>
              ▶
            </Button>
            <Button variant="outline" size="sm" onClick={() => setDate(todayBusinessDate())}>
              Today
            </Button>
          </div>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Route</label>
          <select
            className="flex h-10 w-44 rounded-md border px-2 text-sm"
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
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Area</label>
          <select
            className="flex h-10 w-40 rounded-md border px-2 text-sm"
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
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Employee</label>
          <select
            className="flex h-10 w-44 rounded-md border px-2 text-sm"
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
          >
            <option value="">All employees</option>
            {(employees.data?.items ?? []).map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1">
          <label className="text-xs text-muted-foreground">Search</label>
          <Input
            placeholder="Name or code…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={showCash}
            onChange={(e) => setShowCash(e.target.checked)}
          />
          Cash column
        </label>
        {periodClosed && (
          <span className="rounded bg-amber-100 px-2 py-1 text-xs text-amber-900">
            Period locked
          </span>
        )}
      </div>

      {(missed.data?.items.length ?? 0) > 0 && (
        <div className="mb-2 max-h-20 overflow-auto rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
          <strong>Missed / overdue ({missed.data!.items.length}):</strong>{' '}
          {missed.data!.items.slice(0, 8).map((m, i) => (
            <span key={m.customerId}>
              {i > 0 ? ', ' : ''}
              <Link className="underline" to={`/customers/${m.customerId}`}>
                {m.code}
              </Link>
              {m.whatsappNumber && (
                <a
                  className="ml-1 text-sky-700"
                  href={`https://wa.me/${m.whatsappNumber.replace(/\D/g, '')}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  WA
                </a>
              )}
            </span>
          ))}
          {missed.data!.items.length > 8 ? '…' : ''}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto rounded border bg-white" ref={parentRef}>
        <div
          className="sticky top-0 z-10 grid border-b bg-slate-50 text-xs font-medium text-slate-600"
          style={{
            gridTemplateColumns: showCash
              ? '220px 120px 70px 70px 70px 80px 90px 36px'
              : '220px 120px 70px 70px 70px 90px 36px',
          }}
        >
          <div className="sticky left-0 bg-slate-50 px-2 py-2">Customer</div>
          <div className="px-2 py-2">Route</div>
          <div className="px-2 py-2 text-right">Rate</div>
          <div className="px-2 py-2 text-center">Qty</div>
          <div className="px-2 py-2 text-center">Empties</div>
          <div className="px-2 py-2 text-right">Amount</div>
          {showCash && <div className="px-2 py-2 text-right">Cash</div>}
          <div className="px-2 py-2" />
        </div>
        <div style={{ height: virtual.getTotalSize(), position: 'relative' }}>
          {virtual.getVirtualItems().map((vRow) => {
            const row = rows[vRow.index]!
            const copy = pendingCopy.get(row.customerId)
            const displayQty = row.quantity ?? copy?.quantity ?? null
            const displayEmpties = row.emptiesCollected ?? copy?.emptiesCollected ?? null
            const amount =
              row.amount ??
              (displayQty != null && row.billingMode === 'per_bottle' && !row.isFree
                ? displayQty * row.rate
                : displayQty != null
                  ? 0
                  : null)
            return (
              <div
                key={row.customerId}
                className="absolute left-0 grid w-full items-center border-b border-slate-100 text-sm hover:bg-sky-50/40"
                style={{
                  transform: `translateY(${vRow.start}px)`,
                  height: vRow.size,
                  gridTemplateColumns: showCash
                    ? '220px 120px 70px 70px 70px 80px 90px 36px'
                    : '220px 120px 70px 70px 70px 90px 36px',
                }}
              >
                <div className="sticky left-0 truncate bg-white px-2 py-1">
                  <Link className="font-medium text-sky-900" to={`/customers/${row.customerId}`}>
                    {row.code}
                  </Link>{' '}
                  <span className="text-slate-700">{row.name}</span>
                </div>
                <div className="truncate px-2 text-xs text-muted-foreground">
                  {row.routeName ?? '—'}
                </div>
                <div className="px-2 text-right tabular-nums">
                  <Money value={row.rate} />
                </div>
                <div className="flex justify-center px-1">
                  <DeliveryQtyCell
                    key={`${row.customerId}-qty-${focusKey}`}
                    value={displayQty}
                    placeholder={copy ? null : row.suggestedQty}
                    disabled={row.locked}
                    autoFocus={focus.row === vRow.index && focus.col === 'qty'}
                    rowIndex={vRow.index}
                    col="qty"
                    onSave={async (v) => {
                      await upsert(row, { quantity: v })
                    }}
                    onMove={(dir) => move(vRow.index, 'qty', dir)}
                    onOpenDetail={() =>
                      setDetail({
                        deliveryId: row.deliveryId,
                        customerId: row.customerId,
                        customerName: row.name,
                        quantity: displayQty ?? undefined,
                        emptiesCollected: displayEmpties ?? undefined,
                        rate: row.rate,
                      })
                    }
                  />
                </div>
                <div className="flex justify-center px-1">
                  <DeliveryQtyCell
                    key={`${row.customerId}-emp-${focusKey}`}
                    value={displayEmpties}
                    disabled={row.locked}
                    autoFocus={focus.row === vRow.index && focus.col === 'empties'}
                    rowIndex={vRow.index}
                    col="empties"
                    onSave={async (v) => {
                      await upsert(row, {
                        emptiesCollected: v,
                        quantity: displayQty ?? 0,
                      })
                    }}
                    onMove={(dir) => move(vRow.index, 'empties', dir)}
                  />
                </div>
                <div className="px-2 text-right tabular-nums">
                  {amount != null ? <Money value={amount} /> : '—'}
                </div>
                {showCash && (
                  <div className="px-2 text-right tabular-nums">
                    {row.cashCollected != null ? <Money value={row.cashCollected} /> : '—'}
                  </div>
                )}
                <div className="px-1">
                  <button
                    className="text-slate-400 hover:text-sky-700"
                    title="Details"
                    onClick={() =>
                      setDetail({
                        deliveryId: row.deliveryId,
                        customerId: row.customerId,
                        customerName: row.name,
                        quantity: displayQty ?? undefined,
                        emptiesCollected: displayEmpties ?? undefined,
                        rate: row.rate,
                      })
                    }
                  >
                    ⋯
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="sticky bottom-0 mt-2 flex flex-wrap gap-4 rounded border bg-sky-50 px-4 py-2 text-sm font-medium tabular-nums">
        <span>Served: {totals?.customersServed ?? 0}</span>
        <span>Bottles out: {totals?.totalBottles ?? 0}</span>
        <span>Empties in: {totals?.totalEmpties ?? 0}</span>
        <span>
          Amount: <Money value={totals?.totalAmount ?? 0} />
        </span>
        <span>
          Cash: <Money value={totals?.totalCash ?? 0} />
        </span>
        <span className="text-muted-foreground">{rows.length} customers</span>
      </div>

      {detail && (
        <DeliveryDetailDialog
          open
          onClose={() => setDetail(null)}
          deliveryId={detail.deliveryId}
          defaults={{
            customerId: detail.customerId,
            customerName: detail.customerName,
            date,
            quantity: detail.quantity,
            emptiesCollected: detail.emptiesCollected,
            rate: detail.rate,
          }}
        />
      )}
      <WalkInDialog open={walkIn} onClose={() => setWalkIn(false)} date={date} />
    </div>
  )
}
