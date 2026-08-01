import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { DateText } from '@renderer/components/DateText'
import { PageHeader } from '@renderer/components/PageHeader'
import { toast } from '@renderer/components/Toast'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { api } from '@renderer/lib/api'
import type { StockMovementDto } from '@shared/contracts'
import { currentPeriod, periodEnd, periodStart, todayBusinessDate } from '@shared/date'
import { AppError } from '@shared/errors'
import { toPaisa } from '@shared/money'

type Panel = 'opening' | 'purchase' | 'production' | 'damage' | 'adjustment' | null
type BottleState = 'filled' | 'empty'
type DamageLocation = 'plant' | 'van' | 'customer'
type DamageReason = 'damaged' | 'lost' | 'scrapped'
type AdjustLocation = 'plant' | 'van'

const REASON_OPTIONS: Array<StockMovementDto['reason']> = [
  'purchase',
  'production',
  'load_to_van',
  'unload_from_van',
  'delivery',
  'empty_pickup',
  'damaged',
  'lost',
  'scrapped',
  'adjustment',
  'opening_stock',
]

const REASON_LABELS: Record<StockMovementDto['reason'], string> = {
  purchase: 'Purchase',
  production: 'Production',
  load_to_van: 'Load to van',
  unload_from_van: 'Unload from van',
  delivery: 'Delivery',
  empty_pickup: 'Empty pickup',
  damaged: 'Damaged',
  lost: 'Lost',
  scrapped: 'Scrapped',
  adjustment: 'Adjustment',
  opening_stock: 'Opening stock',
}

export function InventoryPage() {
  const qc = useQueryClient()
  const today = todayBusinessDate()
  const month = currentPeriod()

  const [panel, setPanel] = useState<Panel>(null)
  const [busy, setBusy] = useState(false)
  const [thresholdDraft, setThresholdDraft] = useState('')

  const [movFrom, setMovFrom] = useState(periodStart(month))
  const [movTo, setMovTo] = useState(periodEnd(month))
  const [reasonFilter, setReasonFilter] = useState<StockMovementDto['reason'] | ''>('')

  // Opening stock
  const [osDate, setOsDate] = useState(today)
  const [osState, setOsState] = useState<BottleState>('filled')
  const [osQty, setOsQty] = useState('')

  // Purchase
  const [puDate, setPuDate] = useState(today)
  const [puQty, setPuQty] = useState('')
  const [puUnitCost, setPuUnitCost] = useState('')
  const [puVendor, setPuVendor] = useState('')

  // Production
  const [prDate, setPrDate] = useState(today)
  const [prQty, setPrQty] = useState('')

  // Damage
  const [dmDate, setDmDate] = useState(today)
  const [dmQty, setDmQty] = useState('')
  const [dmState, setDmState] = useState<BottleState>('filled')
  const [dmFrom, setDmFrom] = useState<DamageLocation>('plant')
  const [dmReason, setDmReason] = useState<DamageReason>('damaged')
  const [dmNotes, setDmNotes] = useState('')
  const [dmCustomerId, setDmCustomerId] = useState('')
  const [dmCharge, setDmCharge] = useState(false)

  // Adjustment
  const [ajDate, setAjDate] = useState(today)
  const [ajState, setAjState] = useState<BottleState>('filled')
  const [ajLocation, setAjLocation] = useState<AdjustLocation>('plant')
  const [ajDelta, setAjDelta] = useState('')
  const [ajNotes, setAjNotes] = useState('')

  const balancesQ = useQuery({
    queryKey: ['inventory', 'balances'],
    queryFn: () => api.inventory.getBalances(),
  })

  const movementsInput = useMemo(
    () => ({
      from: movFrom,
      to: movTo,
      reason: reasonFilter || undefined,
      limit: 500,
    }),
    [movFrom, movTo, reasonFilter],
  )

  const movementsQ = useQuery({
    queryKey: ['inventory', 'movements', movementsInput],
    queryFn: () => api.inventory.listMovements(movementsInput),
  })

  async function invalidate() {
    await qc.invalidateQueries({ queryKey: ['inventory'] })
  }

  function togglePanel(p: Panel) {
    setPanel((cur) => (cur === p ? null : p))
  }

  async function runMutation(label: string, fn: () => Promise<unknown>) {
    setBusy(true)
    try {
      await fn()
      toast({ title: label, variant: 'success' })
      setPanel(null)
      await invalidate()
    } catch (e) {
      toast({
        title: e instanceof AppError ? e.message : `${label} failed`,
        variant: 'error',
        code: e instanceof AppError ? e.code : undefined,
      })
    } finally {
      setBusy(false)
    }
  }

  async function submitOpening() {
    const quantity = Number(osQty)
    if (!Number.isFinite(quantity) || quantity <= 0) {
      toast({ title: 'Quantity must be a positive number', variant: 'error' })
      return
    }
    await runMutation('Opening stock recorded', () =>
      api.inventory.recordOpeningStock({
        date: osDate,
        bottleState: osState,
        quantity,
      }),
    )
  }

  async function submitPurchase() {
    const quantity = Number(puQty)
    if (!Number.isFinite(quantity) || quantity <= 0) {
      toast({ title: 'Quantity must be a positive number', variant: 'error' })
      return
    }
    let unitCost: number
    try {
      unitCost = Number(toPaisa(puUnitCost || '0'))
    } catch {
      toast({ title: 'Invalid unit cost', variant: 'error' })
      return
    }
    if (unitCost < 0) {
      toast({ title: 'Unit cost cannot be negative', variant: 'error' })
      return
    }
    await runMutation('Bottle purchase recorded', () =>
      api.inventory.purchaseBottles({
        date: puDate,
        quantity,
        unitCost,
        vendorName: puVendor.trim() || null,
      }),
    )
  }

  async function submitProduction() {
    const quantity = Number(prQty)
    if (!Number.isFinite(quantity) || quantity <= 0) {
      toast({ title: 'Quantity must be a positive number', variant: 'error' })
      return
    }
    await runMutation('Production recorded', () =>
      api.inventory.recordProduction({ date: prDate, quantity }),
    )
  }

  async function submitDamage() {
    const quantity = Number(dmQty)
    if (!Number.isFinite(quantity) || quantity <= 0) {
      toast({ title: 'Quantity must be a positive number', variant: 'error' })
      return
    }
    if (!dmNotes.trim()) {
      toast({ title: 'Notes are required', variant: 'error' })
      return
    }
    const customerId = dmCustomerId.trim() ? Number(dmCustomerId) : null
    if (dmCustomerId.trim() && (!Number.isFinite(customerId) || (customerId ?? 0) <= 0)) {
      toast({ title: 'Invalid customer id', variant: 'error' })
      return
    }
    if (dmFrom === 'customer' && !customerId) {
      toast({ title: 'Customer id is required when location is customer', variant: 'error' })
      return
    }
    await runMutation('Damage / loss recorded', () =>
      api.inventory.recordDamage({
        date: dmDate,
        quantity,
        bottleState: dmState,
        fromLocation: dmFrom,
        reason: dmReason,
        notes: dmNotes.trim(),
        customerId,
        chargeCustomer: dmCharge || undefined,
      }),
    )
  }

  async function submitAdjustment() {
    const delta = Number(ajDelta)
    if (!Number.isFinite(delta) || delta === 0) {
      toast({ title: 'Delta must be a non-zero number', variant: 'error' })
      return
    }
    if (!ajNotes.trim()) {
      toast({ title: 'Notes are required', variant: 'error' })
      return
    }
    await runMutation('Adjustment recorded', () =>
      api.inventory.recordAdjustment({
        date: ajDate,
        bottleState: ajState,
        location: ajLocation,
        delta,
        notes: ajNotes.trim(),
      }),
    )
  }

  const totals = balancesQ.data?.totals
  const low = balancesQ.data?.lowStock
  const inVans = (totals?.filledInVans ?? 0) + (totals?.emptyInVans ?? 0)

  async function saveThreshold() {
    const n = Number(thresholdDraft)
    if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
      toast({ title: 'Threshold must be a non-negative integer', variant: 'error' })
      return
    }
    try {
      await api.settings.setMany({ values: { 'inventory.lowStockThreshold': n } })
      toast({ title: 'Low-stock threshold saved', variant: 'success' })
      await invalidate()
    } catch (e) {
      toast({
        title: e instanceof AppError ? e.message : 'Failed to save threshold',
        variant: 'error',
      })
    }
  }

  return (
    <div>
      <PageHeader
        title="Inventory"
        subtitle="Bottle stock — plant, vans, customers, and total owned"
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to="/inventory/trips">Trips</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/inventory/vehicles">Vehicles</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/inventory/bottles-out">Bottles out</Link>
            </Button>
          </>
        }
      />

      {low?.isLow && (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p className="font-medium">Low stock warning</p>
          <p className="mt-1 text-amber-900">
            Filled at plant ({low.filledAtPlant}) is below threshold ({low.threshold}). Avg daily
            consumption (14d): {low.avgDailyConsumption14d.toFixed(1)}
            {low.daysOfStockLeft != null
              ? ` · ~${low.daysOfStockLeft.toFixed(1)} days of stock left`
              : ' · days of stock left unavailable'}
          </p>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-end gap-2 text-sm">
        <label className="space-y-1">
          <span className="text-xs text-slate-600">Low-stock threshold (filled at plant)</span>
          <Input
            className="w-28"
            type="number"
            min={0}
            placeholder={String(low?.threshold ?? 0)}
            value={thresholdDraft}
            onChange={(e) => setThresholdDraft(e.target.value)}
          />
        </label>
        <Button variant="outline" size="sm" onClick={() => void saveThreshold()} disabled={busy}>
          Save threshold
        </Button>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <StatCard
          label="Filled at plant"
          value={totals?.filledAtPlant}
          loading={balancesQ.isLoading}
        />
        <StatCard
          label="Empty at plant"
          value={totals?.emptyAtPlant}
          loading={balancesQ.isLoading}
        />
        <StatCard
          label="In vans"
          value={inVans}
          loading={balancesQ.isLoading}
          hint="filled + empty"
        />
        <StatCard
          label="With customers"
          value={totals?.withCustomers}
          loading={balancesQ.isLoading}
        />
        <StatCard label="Scrapped" value={totals?.scrapped} loading={balancesQ.isLoading} />
        <StatCard
          label="Total owned"
          value={totals?.totalOwned}
          loading={balancesQ.isLoading}
          emphasize
        />
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={panel === 'opening' ? 'default' : 'outline'}
          onClick={() => togglePanel('opening')}
        >
          Opening stock
        </Button>
        <Button
          size="sm"
          variant={panel === 'purchase' ? 'default' : 'outline'}
          onClick={() => togglePanel('purchase')}
        >
          Purchase
        </Button>
        <Button
          size="sm"
          variant={panel === 'production' ? 'default' : 'outline'}
          onClick={() => togglePanel('production')}
        >
          Production
        </Button>
        <Button
          size="sm"
          variant={panel === 'damage' ? 'default' : 'outline'}
          onClick={() => togglePanel('damage')}
        >
          Damage / loss
        </Button>
        <Button
          size="sm"
          variant={panel === 'adjustment' ? 'default' : 'outline'}
          onClick={() => togglePanel('adjustment')}
        >
          Adjustment
        </Button>
      </div>

      {panel === 'opening' && (
        <form
          className="mb-4 grid grid-cols-2 items-end gap-2 rounded-lg border bg-slate-50 p-3 md:grid-cols-4"
          onSubmit={(e) => {
            e.preventDefault()
            void submitOpening()
          }}
        >
          <Field label="Date">
            <Input type="date" value={osDate} onChange={(e) => setOsDate(e.target.value)} />
          </Field>
          <Field label="State">
            <select
              className="flex h-10 w-full rounded-md border bg-white px-2 text-sm"
              value={osState}
              onChange={(e) => setOsState(e.target.value as BottleState)}
            >
              <option value="filled">Filled</option>
              <option value="empty">Empty</option>
            </select>
          </Field>
          <Field label="Quantity">
            <Input
              inputMode="numeric"
              value={osQty}
              onChange={(e) => setOsQty(e.target.value)}
              placeholder="0"
            />
          </Field>
          <Button type="submit" disabled={busy} className="h-10">
            {busy ? '…' : 'Save'}
          </Button>
        </form>
      )}

      {panel === 'purchase' && (
        <form
          className="mb-4 grid grid-cols-2 items-end gap-2 rounded-lg border bg-slate-50 p-3 md:grid-cols-5"
          onSubmit={(e) => {
            e.preventDefault()
            void submitPurchase()
          }}
        >
          <Field label="Date">
            <Input type="date" value={puDate} onChange={(e) => setPuDate(e.target.value)} />
          </Field>
          <Field label="Quantity">
            <Input
              inputMode="numeric"
              value={puQty}
              onChange={(e) => setPuQty(e.target.value)}
              placeholder="0"
            />
          </Field>
          <Field label="Unit cost (Rs)">
            <Input
              inputMode="decimal"
              value={puUnitCost}
              onChange={(e) => setPuUnitCost(e.target.value)}
              placeholder="0"
            />
          </Field>
          <Field label="Vendor">
            <Input value={puVendor} onChange={(e) => setPuVendor(e.target.value)} />
          </Field>
          <Button type="submit" disabled={busy} className="h-10">
            {busy ? '…' : 'Save'}
          </Button>
        </form>
      )}

      {panel === 'production' && (
        <form
          className="mb-4 grid grid-cols-2 items-end gap-2 rounded-lg border bg-slate-50 p-3 md:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault()
            void submitProduction()
          }}
        >
          <Field label="Date">
            <Input type="date" value={prDate} onChange={(e) => setPrDate(e.target.value)} />
          </Field>
          <Field label="Quantity filled">
            <Input
              inputMode="numeric"
              value={prQty}
              onChange={(e) => setPrQty(e.target.value)}
              placeholder="0"
            />
          </Field>
          <Button type="submit" disabled={busy} className="h-10">
            {busy ? '…' : 'Save'}
          </Button>
        </form>
      )}

      {panel === 'damage' && (
        <form
          className="mb-4 grid grid-cols-2 items-end gap-2 rounded-lg border bg-slate-50 p-3 md:grid-cols-4"
          onSubmit={(e) => {
            e.preventDefault()
            void submitDamage()
          }}
        >
          <Field label="Date">
            <Input type="date" value={dmDate} onChange={(e) => setDmDate(e.target.value)} />
          </Field>
          <Field label="Quantity">
            <Input
              inputMode="numeric"
              value={dmQty}
              onChange={(e) => setDmQty(e.target.value)}
              placeholder="0"
            />
          </Field>
          <Field label="State">
            <select
              className="flex h-10 w-full rounded-md border bg-white px-2 text-sm"
              value={dmState}
              onChange={(e) => setDmState(e.target.value as BottleState)}
            >
              <option value="filled">Filled</option>
              <option value="empty">Empty</option>
            </select>
          </Field>
          <Field label="From location">
            <select
              className="flex h-10 w-full rounded-md border bg-white px-2 text-sm"
              value={dmFrom}
              onChange={(e) => setDmFrom(e.target.value as DamageLocation)}
            >
              <option value="plant">Plant</option>
              <option value="van">Van</option>
              <option value="customer">Customer</option>
            </select>
          </Field>
          <Field label="Reason">
            <select
              className="flex h-10 w-full rounded-md border bg-white px-2 text-sm"
              value={dmReason}
              onChange={(e) => setDmReason(e.target.value as DamageReason)}
            >
              <option value="damaged">Damaged</option>
              <option value="lost">Lost</option>
              <option value="scrapped">Scrapped</option>
            </select>
          </Field>
          <Field label="Notes (required)">
            <Input value={dmNotes} onChange={(e) => setDmNotes(e.target.value)} />
          </Field>
          <Field label="Customer id (optional)">
            <Input
              inputMode="numeric"
              value={dmCustomerId}
              onChange={(e) => setDmCustomerId(e.target.value)}
              placeholder="e.g. 12"
            />
          </Field>
          <label className="flex h-10 items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={dmCharge}
              onChange={(e) => setDmCharge(e.target.checked)}
            />
            Charge customer
          </label>
          <Button type="submit" disabled={busy} className="h-10 md:col-span-4">
            {busy ? '…' : 'Save'}
          </Button>
        </form>
      )}

      {panel === 'adjustment' && (
        <form
          className="mb-4 grid grid-cols-2 items-end gap-2 rounded-lg border bg-slate-50 p-3 md:grid-cols-5"
          onSubmit={(e) => {
            e.preventDefault()
            void submitAdjustment()
          }}
        >
          <Field label="Date">
            <Input type="date" value={ajDate} onChange={(e) => setAjDate(e.target.value)} />
          </Field>
          <Field label="State">
            <select
              className="flex h-10 w-full rounded-md border bg-white px-2 text-sm"
              value={ajState}
              onChange={(e) => setAjState(e.target.value as BottleState)}
            >
              <option value="filled">Filled</option>
              <option value="empty">Empty</option>
            </select>
          </Field>
          <Field label="Location">
            <select
              className="flex h-10 w-full rounded-md border bg-white px-2 text-sm"
              value={ajLocation}
              onChange={(e) => setAjLocation(e.target.value as AdjustLocation)}
            >
              <option value="plant">Plant</option>
              <option value="van">Van</option>
            </select>
          </Field>
          <Field label="Delta (+/−)">
            <Input
              inputMode="numeric"
              value={ajDelta}
              onChange={(e) => setAjDelta(e.target.value)}
              placeholder="+5 or -3"
            />
          </Field>
          <Field label="Notes (required)">
            <Input value={ajNotes} onChange={(e) => setAjNotes(e.target.value)} />
          </Field>
          <Button type="submit" disabled={busy} className="h-10 md:col-span-5">
            {busy ? '…' : 'Save'}
          </Button>
        </form>
      )}

      <div className="mb-3 flex flex-wrap items-end gap-2">
        <h2 className="mr-auto text-sm font-semibold text-slate-800">Movement history</h2>
        <Input
          type="date"
          className="w-40"
          value={movFrom}
          onChange={(e) => setMovFrom(e.target.value)}
        />
        <Input
          type="date"
          className="w-40"
          value={movTo}
          onChange={(e) => setMovTo(e.target.value)}
        />
        <select
          className="h-10 rounded-md border px-2 text-sm"
          value={reasonFilter}
          onChange={(e) => setReasonFilter(e.target.value as StockMovementDto['reason'] | '')}
        >
          <option value="">All reasons</option>
          {REASON_OPTIONS.map((r) => (
            <option key={r} value={r}>
              {REASON_LABELS[r]}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-auto rounded-lg border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-600">
            <tr>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Reason</th>
              <th className="px-3 py-2">State</th>
              <th className="px-3 py-2 text-right">Qty</th>
              <th className="px-3 py-2">From → To</th>
              <th className="px-3 py-2">Notes</th>
              <th className="px-3 py-2 text-right">Owned after</th>
            </tr>
          </thead>
          <tbody>
            {(movementsQ.data?.items ?? []).map((m) => (
              <tr key={m.id} className="border-t">
                <td className="px-3 py-2">
                  <DateText value={m.movementDate} />
                </td>
                <td className="px-3 py-2">{REASON_LABELS[m.reason] ?? m.reason}</td>
                <td className="px-3 py-2 capitalize">{m.bottleState}</td>
                <td className="px-3 py-2 text-right tabular-nums font-medium">{m.quantity}</td>
                <td className="px-3 py-2 text-slate-600">
                  {m.fromLocation} → {m.toLocation}
                  {m.vehicleName ? ` · ${m.vehicleName}` : ''}
                  {m.customerName ? ` · ${m.customerName}` : ''}
                </td>
                <td className="max-w-[200px] truncate px-3 py-2 text-slate-600">
                  {m.notes ?? '—'}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{m.balanceAfterOwned ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {movementsQ.isLoading && (
          <p className="p-6 text-center text-sm text-muted-foreground">Loading movements…</p>
        )}
        {!movementsQ.isLoading && !(movementsQ.data?.items.length ?? 0) && (
          <p className="p-6 text-center text-sm text-muted-foreground">
            No movements in this range.
          </p>
        )}
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  loading,
  hint,
  emphasize,
}: {
  label: string
  value?: number
  loading?: boolean
  hint?: string
  emphasize?: boolean
}) {
  return (
    <div
      className={
        emphasize
          ? 'rounded-lg border border-sky-200 bg-sky-50 px-3 py-3'
          : 'rounded-lg border bg-white px-3 py-3'
      }
    >
      <p className="text-xs text-slate-600">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">
        {loading ? '…' : (value ?? 0)}
      </p>
      {hint ? <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs text-slate-600">{label}</label>
      {children}
    </div>
  )
}
