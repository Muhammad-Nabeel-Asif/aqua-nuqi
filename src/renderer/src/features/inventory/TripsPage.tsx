import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { DateText } from '@renderer/components/DateText'
import { Money } from '@renderer/components/Money'
import { PageHeader } from '@renderer/components/PageHeader'
import { toast } from '@renderer/components/Toast'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { api } from '@renderer/lib/api'
import type { TripDto } from '@shared/contracts'
import { currentPeriod, periodEnd, periodStart, todayBusinessDate } from '@shared/date'
import { AppError } from '@shared/errors'
import { toPaisa } from '@shared/money'

type TripStatus = 'open' | 'closed' | 'void'

export function TripsPage() {
  const qc = useQueryClient()
  const today = todayBusinessDate()
  const month = currentPeriod()
  const monthFrom = periodStart(month)
  const monthTo = periodEnd(month)

  const [from, setFrom] = useState(monthFrom)
  const [to, setTo] = useState(monthTo)
  const [status, setStatus] = useState<TripStatus | ''>('')
  const [showStart, setShowStart] = useState(false)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)

  // Start trip form
  const [stDate, setStDate] = useState(today)
  const [stEmployeeId, setStEmployeeId] = useState<number | ''>('')
  const [stVehicleId, setStVehicleId] = useState<number | ''>('')
  const [stRouteId, setStRouteId] = useState<number | ''>('')
  const [stFilled, setStFilled] = useState('')

  // Close form
  const [clFilled, setClFilled] = useState('')
  const [clEmpties, setClEmpties] = useState('')
  const [clCash, setClCash] = useState('')
  const [clNotes, setClNotes] = useState('')

  const listInput = useMemo(
    () => ({
      from,
      to,
      status: status || undefined,
    }),
    [from, to, status],
  )

  const listQ = useQuery({
    queryKey: ['trips', listInput],
    queryFn: () => api.trips.list(listInput),
  })

  const detailQ = useQuery({
    queryKey: ['trips', selectedId],
    queryFn: () => api.trips.get(selectedId!),
    enabled: selectedId != null,
  })

  const employeesQ = useQuery({
    queryKey: ['employees', 'active'],
    queryFn: () => api.employees.listActive(),
  })

  const vehiclesQ = useQuery({
    queryKey: ['vehicles', false],
    queryFn: () => api.vehicles.list(false),
  })

  const routesQ = useQuery({
    queryKey: ['routes'],
    queryFn: () => api.routes.list(),
  })

  const varianceQ = useQuery({
    queryKey: ['trips', 'employeeVariance', monthFrom, monthTo],
    queryFn: () => api.trips.employeeVarianceSummary(monthFrom, monthTo),
  })

  async function invalidate() {
    await qc.invalidateQueries({ queryKey: ['trips'] })
    await qc.invalidateQueries({ queryKey: ['inventory'] })
    await qc.invalidateQueries({ queryKey: ['vehicles'] })
  }

  const recon = detailQ.data?.reconciliation
  const trip = detailQ.data?.item

  const liveFilled = clFilled.trim() === '' ? null : Number(clFilled)
  const liveEmpties = clEmpties.trim() === '' ? null : Number(clEmpties)
  let liveCashPaisa: number | null = null
  try {
    liveCashPaisa = clCash.trim() === '' ? null : Number(toPaisa(clCash))
  } catch {
    liveCashPaisa = null
  }

  // Filled/empties: positive = short (expected − actual). Cash: submitted − expected.
  const liveFilledVar =
    recon && liveFilled != null && Number.isFinite(liveFilled)
      ? recon.filledExpected - liveFilled
      : null
  const liveEmptiesVar =
    recon && liveEmpties != null && Number.isFinite(liveEmpties)
      ? recon.emptiesExpected - liveEmpties
      : null
  const liveCashVar =
    recon && liveCashPaisa != null && Number.isFinite(liveCashPaisa)
      ? liveCashPaisa - recon.cashExpected
      : null

  const anyLiveVariance =
    (liveFilledVar != null && liveFilledVar !== 0) ||
    (liveEmptiesVar != null && liveEmptiesVar !== 0) ||
    (liveCashVar != null && liveCashVar !== 0)

  function selectTrip(t: TripDto) {
    setSelectedId(t.id)
    if (t.status === 'open') {
      setClFilled('')
      setClEmpties('')
      setClCash('')
      setClNotes('')
    } else {
      setClFilled(String(t.filledReturned))
      setClEmpties(String(t.emptiesReturned))
      setClCash('')
      setClNotes(t.notes ?? '')
    }
  }

  async function startTrip() {
    if (stVehicleId === '') {
      toast({ title: 'Vehicle is required', variant: 'error' })
      return
    }
    const filledLoaded = Number(stFilled)
    if (!Number.isFinite(filledLoaded) || filledLoaded <= 0) {
      toast({ title: 'Filled loaded must be a positive number', variant: 'error' })
      return
    }
    setBusy(true)
    try {
      const r = await api.trips.start({
        tripDate: stDate,
        employeeId: stEmployeeId === '' ? null : Number(stEmployeeId),
        vehicleId: Number(stVehicleId),
        routeId: stRouteId === '' ? null : Number(stRouteId),
        filledLoaded,
      })
      toast({ title: 'Trip started', variant: 'success' })
      setShowStart(false)
      setStFilled('')
      setSelectedId(r.item.id)
      await invalidate()
    } catch (e) {
      toast({
        title: e instanceof AppError ? e.message : 'Could not start trip',
        variant: 'error',
        code: e instanceof AppError ? e.code : undefined,
      })
    } finally {
      setBusy(false)
    }
  }

  async function closeTrip() {
    if (selectedId == null || !recon) return
    const filledReturned = Number(clFilled)
    const emptiesReturned = Number(clEmpties)
    if (!Number.isFinite(filledReturned) || filledReturned < 0) {
      toast({ title: 'Filled returned must be ≥ 0', variant: 'error' })
      return
    }
    if (!Number.isFinite(emptiesReturned) || emptiesReturned < 0) {
      toast({ title: 'Empties returned must be ≥ 0', variant: 'error' })
      return
    }
    let cashSubmitted: number
    try {
      cashSubmitted = Number(toPaisa(clCash || '0'))
    } catch {
      toast({ title: 'Invalid cash amount', variant: 'error' })
      return
    }
    if (cashSubmitted < 0) {
      toast({ title: 'Cash submitted cannot be negative', variant: 'error' })
      return
    }
    const filledVar = filledReturned - recon.filledExpected
    const emptiesVar = emptiesReturned - recon.emptiesExpected
    const cashVar = cashSubmitted - recon.cashExpected
    if ((filledVar !== 0 || emptiesVar !== 0 || cashVar !== 0) && !clNotes.trim()) {
      toast({ title: 'Notes are required when there is any variance', variant: 'error' })
      return
    }
    setBusy(true)
    try {
      await api.trips.close({
        id: selectedId,
        filledReturned,
        emptiesReturned,
        cashSubmitted,
        notes: clNotes.trim() || null,
      })
      toast({ title: 'Trip closed', variant: 'success' })
      await invalidate()
      await qc.invalidateQueries({ queryKey: ['trips', selectedId] })
    } catch (e) {
      toast({
        title: e instanceof AppError ? e.message : 'Could not close trip',
        variant: 'error',
        code: e instanceof AppError ? e.code : undefined,
      })
    } finally {
      setBusy(false)
    }
  }

  const trips = listQ.data?.items ?? []

  return (
    <div>
      <PageHeader
        title="Trips"
        subtitle="Daily van load-out and reconciliation — variance highlighted in red"
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to="/inventory">Inventory</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/inventory/vehicles">Vehicles</Link>
            </Button>
            <Button onClick={() => setShowStart((v) => !v)}>
              {showStart ? 'Hide start form' : 'Start trip'}
            </Button>
          </>
        }
      />

      {showStart && (
        <form
          className="mb-4 grid grid-cols-2 items-end gap-2 rounded-lg border border-sky-200 bg-sky-50 p-3 md:grid-cols-6"
          onSubmit={(e) => {
            e.preventDefault()
            void startTrip()
          }}
        >
          <div>
            <label className="mb-1 block text-xs text-slate-600">Date</label>
            <Input type="date" value={stDate} onChange={(e) => setStDate(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-600">Employee</label>
            <select
              className="flex h-10 w-full rounded-md border bg-white px-2 text-sm"
              value={stEmployeeId}
              onChange={(e) => setStEmployeeId(e.target.value ? Number(e.target.value) : '')}
            >
              <option value="">Select…</option>
              {(employeesQ.data?.items ?? []).map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.code} — {emp.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-600">Vehicle</label>
            <select
              className="flex h-10 w-full rounded-md border bg-white px-2 text-sm"
              value={stVehicleId}
              onChange={(e) => setStVehicleId(e.target.value ? Number(e.target.value) : '')}
            >
              <option value="">Select…</option>
              {(vehiclesQ.data?.items ?? []).map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                  {v.registrationNo ? ` (${v.registrationNo})` : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-600">Route (optional)</label>
            <select
              className="flex h-10 w-full rounded-md border bg-white px-2 text-sm"
              value={stRouteId}
              onChange={(e) => setStRouteId(e.target.value ? Number(e.target.value) : '')}
            >
              <option value="">None</option>
              {(routesQ.data?.items ?? []).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-600">Filled loaded</label>
            <Input
              inputMode="numeric"
              value={stFilled}
              onChange={(e) => setStFilled(e.target.value)}
              placeholder="60"
            />
          </div>
          <Button type="submit" disabled={busy} className="h-10">
            {busy ? '…' : 'Start'}
          </Button>
        </form>
      )}

      <div className="mb-3 flex flex-wrap items-end gap-2">
        <Input
          type="date"
          className="w-40"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
        />
        <Input type="date" className="w-40" value={to} onChange={(e) => setTo(e.target.value)} />
        <select
          className="h-10 rounded-md border px-2 text-sm"
          value={status}
          onChange={(e) => setStatus(e.target.value as TripStatus | '')}
        >
          <option value="">All statuses</option>
          <option value="open">Open</option>
          <option value="closed">Closed</option>
          <option value="void">Void</option>
        </select>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
        <div className="overflow-auto rounded-lg border bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-600">
              <tr>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Employee</th>
                <th className="px-3 py-2">Vehicle</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2 text-right">Loaded</th>
                <th className="px-3 py-2 text-right">Bottle var</th>
                <th className="px-3 py-2 text-right">Cash var</th>
              </tr>
            </thead>
            <tbody>
              {trips.map((t) => (
                <tr
                  key={t.id}
                  className={`cursor-pointer border-t hover:bg-sky-50 ${
                    selectedId === t.id ? 'bg-sky-50' : ''
                  }`}
                  onClick={() => selectTrip(t)}
                >
                  <td className="px-3 py-2">
                    <DateText value={t.tripDate} />
                  </td>
                  <td className="px-3 py-2">{t.employeeName ?? '—'}</td>
                  <td className="px-3 py-2">{t.vehicleName ?? '—'}</td>
                  <td className="px-3 py-2 capitalize">{t.status}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{t.filledLoaded}</td>
                  <td
                    className={`px-3 py-2 text-right tabular-nums ${
                      t.bottleVariance !== 0 ? 'font-semibold text-red-600' : ''
                    }`}
                  >
                    {t.bottleVariance}
                  </td>
                  <td
                    className={`px-3 py-2 text-right tabular-nums ${
                      t.cashVariance !== 0 ? 'font-semibold text-red-600' : ''
                    }`}
                  >
                    <Money value={t.cashVariance} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {listQ.isLoading && (
            <p className="p-6 text-center text-sm text-muted-foreground">Loading trips…</p>
          )}
          {!listQ.isLoading && trips.length === 0 && (
            <p className="p-6 text-center text-sm text-muted-foreground">No trips in this range.</p>
          )}
        </div>

        <div className="rounded-lg border bg-white p-4">
          {!selectedId && (
            <p className="text-sm text-muted-foreground">
              Select a trip to reconcile. Expected vs actual variance is the control signal.
            </p>
          )}
          {selectedId && detailQ.isLoading && (
            <p className="text-sm text-muted-foreground">Loading trip…</p>
          )}
          {trip && recon && (
            <>
              <div className="mb-3">
                <h2 className="text-lg font-semibold text-slate-900">
                  Trip <DateText value={trip.tripDate} />
                </h2>
                <p className="text-sm text-muted-foreground">
                  {trip.employeeName ?? 'No employee'} · {trip.vehicleName ?? 'No vehicle'}
                  {trip.routeName ? ` · ${trip.routeName}` : ''} ·{' '}
                  <span className="capitalize">{trip.status}</span>
                </p>
              </div>

              <div className="mb-4 overflow-hidden rounded border">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs text-slate-600">
                    <tr>
                      <th className="px-3 py-2 text-left">Line</th>
                      <th className="px-3 py-2 text-right">Expected</th>
                      <th className="px-3 py-2 text-right">Actual</th>
                      <th className="px-3 py-2 text-right">Variance</th>
                    </tr>
                  </thead>
                  <tbody>
                    <ReconRow
                      label="Filled bottles"
                      expected={recon.filledExpected}
                      actual={
                        trip.status === 'open'
                          ? liveFilled
                          : (recon.filledActual ?? trip.filledReturned)
                      }
                      variance={
                        trip.status === 'open'
                          ? liveFilledVar
                          : (recon.filledVariance ?? trip.bottleVariance)
                      }
                      hint="loaded − delivered"
                    />
                    <ReconRow
                      label="Empties"
                      expected={recon.emptiesExpected}
                      actual={
                        trip.status === 'open'
                          ? liveEmpties
                          : (recon.emptiesActual ?? trip.emptiesReturned)
                      }
                      variance={trip.status === 'open' ? liveEmptiesVar : recon.emptiesVariance}
                    />
                    <ReconRow
                      label="Cash"
                      expected={recon.cashExpected}
                      actual={
                        trip.status === 'open'
                          ? liveCashPaisa
                          : (recon.cashActual ?? trip.cashSubmitted)
                      }
                      variance={
                        trip.status === 'open'
                          ? liveCashVar
                          : (recon.cashVariance ?? trip.cashVariance)
                      }
                      money
                    />
                  </tbody>
                </table>
              </div>

              {trip.status === 'open' && (
                <form
                  className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-3"
                  onSubmit={(e) => {
                    e.preventDefault()
                    void closeTrip()
                  }}
                >
                  <p className="text-sm font-medium text-amber-950">Close trip</p>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="mb-1 block text-xs text-slate-600">Filled returned</label>
                      <Input
                        inputMode="numeric"
                        value={clFilled}
                        onChange={(e) => setClFilled(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-slate-600">Empties returned</label>
                      <Input
                        inputMode="numeric"
                        value={clEmpties}
                        onChange={(e) => setClEmpties(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-slate-600">
                        Cash submitted (Rs)
                      </label>
                      <Input
                        inputMode="decimal"
                        value={clCash}
                        onChange={(e) => setClCash(e.target.value)}
                        placeholder="0"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-slate-600">
                      Notes{anyLiveVariance ? ' (required — variance ≠ 0)' : ''}
                    </label>
                    <Input
                      value={clNotes}
                      onChange={(e) => setClNotes(e.target.value)}
                      placeholder={anyLiveVariance ? 'Explain the variance…' : 'Optional notes'}
                    />
                    {anyLiveVariance && (
                      <p className="mt-1 text-xs font-medium text-red-700">
                        Variance detected — a note is required before closing.
                      </p>
                    )}
                  </div>
                  <Button type="submit" disabled={busy}>
                    {busy ? '…' : 'Close trip'}
                  </Button>
                </form>
              )}

              {trip.status !== 'open' && trip.notes && (
                <p className="text-sm text-slate-600">
                  <span className="font-medium">Notes:</span> {trip.notes}
                </p>
              )}
            </>
          )}
        </div>
      </div>

      <div className="mt-6 rounded-lg border bg-white p-4">
        <h2 className="mb-1 text-sm font-semibold text-slate-900">
          Employee variance summary — {month}
        </h2>
        <p className="mb-3 text-xs text-muted-foreground">
          Closed trips this month. Negative cash variance is a shortfall.
        </p>
        <div className="overflow-auto rounded border">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-600">
              <tr>
                <th className="px-3 py-2">Employee</th>
                <th className="px-3 py-2 text-right">Trips closed</th>
                <th className="px-3 py-2 text-right">Bottle variance</th>
                <th className="px-3 py-2 text-right">Cash variance</th>
              </tr>
            </thead>
            <tbody>
              {(varianceQ.data?.items ?? []).map((row) => (
                <tr key={row.employeeId} className="border-t">
                  <td className="px-3 py-2">{row.employeeName}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{row.tripsClosed}</td>
                  <td
                    className={`px-3 py-2 text-right tabular-nums ${
                      row.totalBottleVariance !== 0 ? 'font-semibold text-red-600' : ''
                    }`}
                  >
                    {row.totalBottleVariance}
                  </td>
                  <td
                    className={`px-3 py-2 text-right tabular-nums ${
                      row.totalCashVariance !== 0 ? 'font-semibold text-red-600' : ''
                    }`}
                  >
                    <Money value={row.totalCashVariance} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!varianceQ.data?.items.length && (
            <p className="p-4 text-center text-sm text-muted-foreground">
              No closed-trip variance this month.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function ReconRow({
  label,
  expected,
  actual,
  variance,
  money,
  hint,
}: {
  label: string
  expected: number
  actual: number | null
  variance: number | null
  money?: boolean
  hint?: string
}) {
  const bad = variance != null && variance !== 0
  return (
    <tr className="border-t">
      <td className="px-3 py-2">
        <span className="font-medium">{label}</span>
        {hint ? <span className="ml-1 text-xs text-muted-foreground">({hint})</span> : null}
      </td>
      <td className="px-3 py-2 text-right tabular-nums">
        {money ? <Money value={expected} /> : expected}
      </td>
      <td className="px-3 py-2 text-right tabular-nums">
        {actual == null ? '—' : money ? <Money value={actual} /> : actual}
      </td>
      <td
        className={`px-3 py-2 text-right tabular-nums ${
          bad ? 'font-semibold text-red-600' : 'text-emerald-700'
        }`}
      >
        {variance == null ? '—' : money ? <Money value={variance} /> : variance}
      </td>
    </tr>
  )
}
