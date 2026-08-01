import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Money } from '@renderer/components/Money'
import { toast } from '@renderer/components/Toast'
import { Button } from '@renderer/components/ui/button'
import { api } from '@renderer/lib/api'
import { addBusinessMonths, currentPeriod, periodFromDate } from '@shared/date'
import { AppError } from '@shared/errors'
import { DeliveryDetailDialog } from './DeliveryDetailDialog'
import { DeliveryQtyCell } from './DeliveryQtyCell'

type Props = {
  customerId: number
  period?: string
  showHeader?: boolean
}

/** Digital twin of the paper monthly delivery card. */
export function CustomerCardView({ customerId, period: periodProp, showHeader = true }: Props) {
  const qc = useQueryClient()
  const [period, setPeriod] = useState(periodProp ?? currentPeriod())
  const [focusDay, setFocusDay] = useState(1)
  const [detail, setDetail] = useState<{
    deliveryId?: number | null
    date: string
    quantity?: number
  } | null>(null)

  const card = useQuery({
    queryKey: ['deliveries', 'card', customerId, period],
    queryFn: () => api.deliveries.getCustomerCard({ customerId, period }),
  })

  const weeks = useMemo(() => {
    const days = card.data?.days ?? []
    if (!days.length) return []
    // Build calendar weeks (Mon-start)
    const first = new Date(`${period}-01T12:00:00`)
    const mondayIndex = (first.getDay() + 6) % 7 // 0 = Monday
    const cells: Array<(typeof days)[0] | null> = []
    for (let i = 0; i < mondayIndex; i++) cells.push(null)
    cells.push(...days)
    while (cells.length % 7 !== 0) cells.push(null)
    const result: Array<Array<(typeof days)[0] | null>> = []
    for (let i = 0; i < cells.length; i += 7) result.push(cells.slice(i, i + 7))
    return result
  }, [card.data?.days, period])

  async function saveDay(date: string, quantity: number | null) {
    try {
      await api.deliveries.upsert({
        customerId,
        date,
        quantity: quantity ?? 0,
        emptiesCollected: quantity ?? 0,
      })
      await qc.invalidateQueries({ queryKey: ['deliveries', 'card', customerId, period] })
      await qc.invalidateQueries({ queryKey: ['customer', customerId] })
    } catch (err) {
      toast({
        title: err instanceof AppError ? err.message : 'Save failed',
        description: err instanceof AppError ? err.code : undefined,
        variant: 'error',
      })
      throw err
    }
  }

  if (!card.data) return <div className="p-4 text-sm text-muted-foreground">Loading card…</div>
  const c = card.data

  return (
    <div className="space-y-4">
      {showHeader && (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-sky-950">
              {c.code} — {c.name}
            </h2>
            <p className="text-sm text-muted-foreground">
              Rate <Money value={c.rate} /> / bottle · {period}
              {c.periodClosed && (
                <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-900">
                  Locked
                </span>
              )}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPeriod(periodFromDate(addBusinessMonths(`${period}-01`, -1)))}
            >
              ◀ Prev
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPeriod(periodFromDate(addBusinessMonths(`${period}-01`, 1)))}
            >
              Next ▶
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              Print card
            </Button>
            <Button variant="outline" size="sm" disabled title="Available in Phase 3">
              Generate bill
            </Button>
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-[1fr_220px]">
        <div className="rounded border bg-white p-3 print:border-0">
          <div className="mb-2 grid grid-cols-7 gap-1 text-center text-xs font-medium text-slate-500">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
              <div key={d}>{d}</div>
            ))}
          </div>
          <div className="grid gap-1">
            {weeks.map((week, wi) => (
              <div key={wi} className="grid grid-cols-7 gap-1">
                {week.map((day, di) => {
                  if (!day) return <div key={`e-${di}`} className="h-16 rounded bg-slate-50" />
                  const weekend = di >= 5
                  return (
                    <div
                      key={day.date}
                      className={`flex h-16 flex-col items-center justify-between rounded border p-1 ${
                        weekend ? 'bg-slate-50' : 'bg-white'
                      } ${day.locked ? 'opacity-70' : ''}`}
                    >
                      <div className="flex w-full justify-between text-[10px] text-slate-500">
                        <span>{day.day}</span>
                        {day.locked && <span>🔒</span>}
                      </div>
                      <DeliveryQtyCell
                        value={day.quantity}
                        disabled={day.locked}
                        autoFocus={focusDay === day.day}
                        className="h-7 w-12"
                        onSave={(v) => saveDay(day.date, v)}
                        onMove={(dir) => {
                          if (dir === 'enter' || dir === 'down' || dir === 'right') {
                            setFocusDay(Math.min(c.days.length, day.day + 1))
                          } else {
                            setFocusDay(Math.max(1, day.day - 1))
                          }
                        }}
                        onOpenDetail={() =>
                          setDetail({
                            deliveryId: day.deliveryId,
                            date: day.date,
                            quantity: day.quantity ?? undefined,
                          })
                        }
                      />
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>

        <aside className="space-y-3 rounded border bg-sky-50/60 p-4 text-sm">
          <h3 className="font-semibold text-sky-950">Month summary</h3>
          <Row label="Total units" value={String(c.totalUnits)} />
          <Row label="Total amount" value={<Money value={c.totalAmount} />} />
          <Row label="Empties returned" value={String(c.totalEmpties)} />
          <Row label="Bottles with customer" value={String(c.bottlesWithCustomer)} />
          <Row label="Last delivery" value={c.lastDeliveryDate ?? '—'} />
          <Row label="Balance" value={<Money value={c.balance} />} />
          <Link className="block text-sky-700 underline" to={`/customers/${customerId}`}>
            Customer profile
          </Link>
          <Link className="block text-sky-700 underline" to="/deliveries/daily">
            Daily entry
          </Link>
        </aside>
      </div>

      {detail && (
        <DeliveryDetailDialog
          open
          onClose={() => setDetail(null)}
          deliveryId={detail.deliveryId}
          defaults={{
            customerId,
            customerName: c.name,
            date: detail.date,
            quantity: detail.quantity,
            rate: c.rate,
          }}
        />
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-2 border-b border-sky-100 py-1.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  )
}
