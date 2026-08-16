import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { DateText } from '@renderer/components/DateText'
import { Money } from '@renderer/components/Money'
import { PageHeader } from '@renderer/components/PageHeader'
import { toast } from '@renderer/components/Toast'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { api } from '@renderer/lib/api'
import { VEHICLE_TYPE_LABEL, plainLabel } from '@renderer/lib/plain-labels'
import type { VehicleDto } from '@shared/contracts'
import { currentPeriod, periodEnd, periodStart, todayBusinessDate } from '@shared/date'
import { AppError } from '@shared/errors'

const VEHICLE_TYPES = ['loader', 'rickshaw', 'bike', 'van', 'truck', 'other'] as const
type VehicleType = (typeof VEHICLE_TYPES)[number]

export function VehiclesPage() {
  const qc = useQueryClient()
  const month = currentPeriod()
  const [showInactive, setShowInactive] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [detailFrom, setDetailFrom] = useState(periodStart(month))
  const [detailTo, setDetailTo] = useState(periodEnd(month))
  const [busy, setBusy] = useState(false)

  const [name, setName] = useState('')
  const [registration, setRegistration] = useState('')
  const [vehicleType, setVehicleType] = useState<VehicleType | ''>('van')
  const [capacity, setCapacity] = useState('')

  const listQ = useQuery({
    queryKey: ['vehicles', { showInactive }],
    queryFn: () => api.vehicles.list(showInactive),
  })

  const detailQ = useQuery({
    queryKey: ['vehicles', selectedId, detailFrom, detailTo],
    queryFn: () => api.vehicles.get(selectedId!, detailFrom, detailTo),
    enabled: selectedId != null,
  })

  async function invalidate() {
    await qc.invalidateQueries({ queryKey: ['vehicles'] })
  }

  async function createVehicle() {
    if (!name.trim()) {
      toast({ title: 'Name is required', variant: 'error' })
      return
    }
    const cap = capacity.trim() ? Number(capacity) : null
    if (capacity.trim() && (!Number.isFinite(cap) || (cap ?? 0) <= 0)) {
      toast({ title: 'Capacity must be a positive number', variant: 'error' })
      return
    }
    setBusy(true)
    try {
      const r = await api.vehicles.create({
        name: name.trim(),
        registrationNo: registration.trim() || null,
        vehicleType: vehicleType || null,
        capacityBottles: cap,
      })
      setName('')
      setRegistration('')
      setCapacity('')
      setShowCreate(false)
      setSelectedId(r.item.id)
      toast({ title: 'Vehicle created', variant: 'success' })
      await invalidate()
    } catch (e) {
      toast({
        title: e instanceof AppError ? e.message : 'Could not create vehicle',
        variant: 'error',
        code: e instanceof AppError ? e.code : undefined,
      })
    } finally {
      setBusy(false)
    }
  }

  async function toggleActive(v: VehicleDto) {
    setBusy(true)
    try {
      await api.vehicles.update({ id: v.id, isActive: !v.isActive })
      toast({ title: v.isActive ? 'Vehicle deactivated' : 'Vehicle activated', variant: 'success' })
      await invalidate()
      if (selectedId === v.id) {
        await qc.invalidateQueries({ queryKey: ['vehicles', selectedId] })
      }
    } catch (e) {
      toast({
        title: e instanceof AppError ? e.message : 'Update failed',
        variant: 'error',
        code: e instanceof AppError ? e.code : undefined,
      })
    } finally {
      setBusy(false)
    }
  }

  const items = listQ.data?.items ?? []
  const detail = detailQ.data

  return (
    <div>
      <PageHeader
        title="Vehicles"
        subtitle="Fleet used for trips and expense attribution"
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to="/inventory">Inventory</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/inventory/trips">Trips</Link>
            </Button>
            <Button onClick={() => setShowCreate((v) => !v)}>
              {showCreate ? 'Hide form' : 'New vehicle'}
            </Button>
          </>
        }
      />

      {showCreate && (
        <form
          className="mb-4 grid grid-cols-2 items-end gap-2 rounded-lg border bg-slate-50 p-3 md:grid-cols-5"
          onSubmit={(e) => {
            e.preventDefault()
            void createVehicle()
          }}
        >
          <div>
            <label className="mb-1 block text-xs text-slate-600">Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Van 1" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-600">Registration</label>
            <Input
              value={registration}
              onChange={(e) => setRegistration(e.target.value)}
              placeholder="LEA-1234"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-600">Type</label>
            <select
              className="flex h-10 w-full rounded-md border bg-white px-2 text-sm"
              value={vehicleType}
              onChange={(e) => setVehicleType(e.target.value as VehicleType | '')}
            >
              {VEHICLE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {plainLabel(VEHICLE_TYPE_LABEL, t)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-600">Capacity (bottles)</label>
            <Input
              inputMode="numeric"
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              placeholder="60"
            />
          </div>
          <Button type="submit" disabled={busy} className="h-10">
            {busy ? '…' : 'Create'}
          </Button>
        </form>
      )}

      <label className="mb-3 flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={showInactive}
          onChange={(e) => setShowInactive(e.target.checked)}
        />
        Show inactive
      </label>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr]">
        <div className="overflow-auto rounded-lg border bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-600">
              <tr>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Reg.</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2 text-right">Capacity</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {items.map((v) => (
                <tr
                  key={v.id}
                  className={`cursor-pointer border-t hover:bg-sky-50 ${
                    selectedId === v.id ? 'bg-sky-50' : ''
                  }`}
                  onClick={() => setSelectedId(v.id)}
                >
                  <td className="px-3 py-2 font-medium">{v.name}</td>
                  <td className="px-3 py-2 text-slate-600">{v.registrationNo ?? '—'}</td>
                  <td className="px-3 py-2 text-slate-600">
                    {plainLabel(VEHICLE_TYPE_LABEL, v.vehicleType)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{v.capacityBottles ?? '—'}</td>
                  <td className="px-3 py-2">
                    <span
                      className={
                        v.isActive
                          ? 'rounded bg-emerald-100 px-1.5 py-0.5 text-xs text-emerald-800'
                          : 'rounded bg-slate-200 px-1.5 py-0.5 text-xs text-slate-700'
                      }
                    >
                      {v.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {listQ.isLoading && (
            <p className="p-6 text-center text-sm text-muted-foreground">Loading…</p>
          )}
          {!listQ.isLoading && items.length === 0 && (
            <p className="p-6 text-center text-sm text-muted-foreground">No vehicles yet.</p>
          )}
        </div>

        <div className="rounded-lg border bg-white p-4">
          {!selectedId && (
            <p className="text-sm text-muted-foreground">Select a vehicle to view details.</p>
          )}
          {selectedId && detailQ.isLoading && (
            <p className="text-sm text-muted-foreground">Loading detail…</p>
          )}
          {detail && (
            <>
              <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">{detail.item.name}</h2>
                  <p className="text-sm text-muted-foreground">
                    {detail.item.registrationNo ?? 'No registration'} ·{' '}
                    {plainLabel(VEHICLE_TYPE_LABEL, detail.item.vehicleType)} · capacity{' '}
                    {detail.item.capacityBottles ?? '—'}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void toggleActive(detail.item)}
                >
                  {detail.item.isActive ? 'Deactivate' : 'Activate'}
                </Button>
              </div>

              <div className="mb-3 flex flex-wrap gap-2">
                <Input
                  type="date"
                  className="w-40"
                  value={detailFrom}
                  onChange={(e) => setDetailFrom(e.target.value)}
                />
                <Input
                  type="date"
                  className="w-40"
                  value={detailTo}
                  onChange={(e) => setDetailTo(e.target.value)}
                />
              </div>

              <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                <MiniStat label="Trips" value={String(detail.tripsCount)} />
                <MiniStat label="Bottles carried" value={String(detail.bottlesCarried)} />
                <MiniStat
                  label="Fuel & maint."
                  valueNode={<Money value={detail.fuelAndMaintenanceTotal} />}
                />
                <MiniStat
                  label="Cost / bottle"
                  valueNode={
                    detail.costPerBottleCarried != null ? (
                      <Money value={detail.costPerBottleCarried} />
                    ) : (
                      '—'
                    )
                  }
                />
              </div>

              <h3 className="mb-2 text-sm font-semibold">Trips</h3>
              <div className="mb-4 max-h-48 overflow-auto rounded border">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs text-slate-600">
                    <tr>
                      <th className="px-2 py-1.5">Date</th>
                      <th className="px-2 py-1.5">Status</th>
                      <th className="px-2 py-1.5 text-right">Loaded</th>
                      <th className="px-2 py-1.5 text-right">Delivered</th>
                      <th className="px-2 py-1.5 text-right">Bottle var</th>
                      <th className="px-2 py-1.5 text-right">Cash var</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.trips.map((t) => (
                      <tr key={t.id} className="border-t">
                        <td className="px-2 py-1.5">
                          <DateText value={t.tripDate} />
                        </td>
                        <td className="px-2 py-1.5 capitalize">{t.status}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{t.filledLoaded}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">
                          {t.bottlesDeliveredCalc}
                        </td>
                        <td
                          className={`px-2 py-1.5 text-right tabular-nums ${
                            t.bottleVariance !== 0 ? 'font-medium text-red-600' : ''
                          }`}
                        >
                          {t.bottleVariance}
                        </td>
                        <td
                          className={`px-2 py-1.5 text-right tabular-nums ${
                            t.cashVariance !== 0 ? 'font-medium text-red-600' : ''
                          }`}
                        >
                          <Money value={t.cashVariance} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!detail.trips.length && (
                  <p className="p-3 text-center text-xs text-muted-foreground">
                    No trips in range (as of {todayBusinessDate()}).
                  </p>
                )}
              </div>

              <h3 className="mb-2 text-sm font-semibold">Fuel / maintenance expenses</h3>
              <div className="max-h-48 overflow-auto rounded border">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs text-slate-600">
                    <tr>
                      <th className="px-2 py-1.5">Date</th>
                      <th className="px-2 py-1.5">Category</th>
                      <th className="px-2 py-1.5">Description</th>
                      <th className="px-2 py-1.5 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.expenses.map((e) => (
                      <tr key={e.id} className="border-t">
                        <td className="px-2 py-1.5">
                          <DateText value={e.expenseDate} />
                        </td>
                        <td className="px-2 py-1.5">{e.categoryName}</td>
                        <td className="max-w-[140px] truncate px-2 py-1.5 text-slate-600">
                          {e.description ?? '—'}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums">
                          <Money value={e.amount} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!detail.expenses.length && (
                  <p className="p-3 text-center text-xs text-muted-foreground">
                    No fuel/maintenance expenses in range.
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function MiniStat({
  label,
  value,
  valueNode,
}: {
  label: string
  value?: string
  valueNode?: React.ReactNode
}) {
  return (
    <div className="rounded border bg-slate-50 px-2 py-2">
      <p className="text-[11px] text-slate-600">{label}</p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums text-slate-900">
        {valueNode ?? value}
      </p>
    </div>
  )
}
