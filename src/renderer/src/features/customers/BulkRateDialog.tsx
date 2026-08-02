import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { confirmDialog } from '@renderer/components/ConfirmDialog'
import { Money } from '@renderer/components/Money'
import { toast } from '@renderer/components/Toast'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { api } from '@renderer/lib/api'
import type { ListCustomersInput } from '@shared/contracts'
import { firstOfNextMonth, todayBusinessDate } from '@shared/date'
import { AppError } from '@shared/errors'
import { toPaisa } from '@shared/money'

export function BulkRateDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [rate, setRate] = useState('')
  const [currentRate, setCurrentRate] = useState('')
  const [effectiveFrom, setEffectiveFrom] = useState(todayBusinessDate())
  const [reason, setReason] = useState('')
  const [areaId, setAreaId] = useState('')
  const [routeId, setRouteId] = useState('')
  const [type, setType] = useState<ListCustomersInput['customerType']>()
  const [preview, setPreview] = useState<
    { id: number; code: string; name: string; oldRate: number | null }[]
  >([])
  const areas = useQuery({ queryKey: ['areas'], queryFn: () => api.areas.list() })
  const routes = useQuery({ queryKey: ['routes'], queryFn: () => api.routes.list() })

  async function load() {
    const r = await api.rates.previewBulk({
      customerType: type || undefined,
      areaId: areaId ? Number(areaId) : undefined,
      routeId: routeId ? Number(routeId) : undefined,
      currentRate: currentRate ? toPaisa(currentRate) : undefined,
    })
    setPreview(r.items)
  }

  async function apply(forceClosedPeriod = false) {
    try {
      await api.rates.bulkChange({
        customerIds: preview.map((x) => x.id),
        rate: toPaisa(rate),
        effectiveFrom,
        reason: reason || null,
        forceClosedPeriod,
      })
      toast({ title: 'Rates updated', variant: 'success' })
      onSaved()
    } catch (e) {
      if (e instanceof AppError && e.code === 'PERIOD_LOCKED' && !forceClosedPeriod) {
        const ok = await confirmDialog({
          title: 'Closed period',
          description: e.message,
          confirmLabel: 'Apply anyway',
          danger: true,
        })
        if (ok) await apply(true)
        return
      }
      toast({
        title: 'Bulk rate change failed',
        description: e instanceof Error ? e.message : 'Error',
        variant: 'error',
      })
    }
  }

  const newRatePaisa = rate ? toPaisa(rate) : null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-lg space-y-4 rounded-lg bg-white p-6">
        <h2 className="text-lg font-semibold">Bulk rate change</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Area</Label>
            <select
              className="h-9 w-full rounded border px-2"
              value={areaId}
              onChange={(e) => setAreaId(e.target.value)}
            >
              <option value="">All</option>
              {(areas.data?.items ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Route</Label>
            <select
              className="h-9 w-full rounded border px-2"
              value={routeId}
              onChange={(e) => setRouteId(e.target.value)}
            >
              <option value="">All</option>
              {(routes.data?.items ?? [])
                .filter((r) => !areaId || r.areaId === Number(areaId))
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
            </select>
          </div>
          <div>
            <Label>Customer type</Label>
            <select
              className="h-9 w-full rounded border px-2"
              value={type ?? ''}
              onChange={(e) =>
                setType((e.target.value || undefined) as ListCustomersInput['customerType'])
              }
            >
              <option value="">All</option>
              <option value="residential">Residential</option>
              <option value="commercial">Commercial</option>
              <option value="walk_in">Walk-in</option>
            </select>
          </div>
          <div>
            <Label>Current rate (Rs)</Label>
            <Input
              value={currentRate}
              onChange={(e) => setCurrentRate(e.target.value)}
              type="number"
              placeholder="Any"
            />
          </div>
          <div>
            <Label>New rate (Rs)</Label>
            <Input value={rate} onChange={(e) => setRate(e.target.value)} type="number" />
          </div>
          <div>
            <Label>Effective from</Label>
            <Input
              type="date"
              value={effectiveFrom}
              onChange={(e) => setEffectiveFrom(e.target.value)}
            />
            <button
              type="button"
              className="mt-1 text-xs text-sky-700"
              onClick={() => setEffectiveFrom(firstOfNextMonth())}
            >
              1st of next month
            </button>
          </div>
          <div className="sm:col-span-2">
            <Label>Reason</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        </div>
        <Button variant="outline" onClick={() => void load()}>
          Preview
        </Button>
        <div className="max-h-48 overflow-auto text-sm">
          {preview.map((x) => (
            <div className="flex justify-between border-b py-1" key={x.id}>
              <span>
                {x.code} — {x.name}
              </span>
              <span className="flex items-center gap-1">
                {x.oldRate == null ? '—' : <Money value={x.oldRate} />}
                <span>→</span>
                {newRatePaisa == null ? '—' : <Money value={newRatePaisa} />}
              </span>
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!preview.length || !rate} onClick={() => void apply()}>
            Apply to {preview.length}
          </Button>
        </div>
      </div>
    </div>
  )
}
