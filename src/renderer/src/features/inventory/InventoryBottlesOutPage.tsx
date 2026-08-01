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
import { todayBusinessDate } from '@shared/date'
import { AppError } from '@shared/errors'

type ActionPanel = 'return' | 'charge' | null

export function InventoryBottlesOutPage() {
  const qc = useQueryClient()
  const today = todayBusinessDate()

  const [search, setSearch] = useState('')
  const [routeId, setRouteId] = useState('')
  const [minBottles, setMinBottles] = useState('')
  const [shortfallOnly, setShortfallOnly] = useState(false)
  const [noReturnDays, setNoReturnDays] = useState('')

  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null)
  const [panel, setPanel] = useState<ActionPanel>(null)
  const [busy, setBusy] = useState(false)

  const [retDate, setRetDate] = useState(today)
  const [retEmpties, setRetEmpties] = useState('')
  const [retNotes, setRetNotes] = useState('')

  const [chDate, setChDate] = useState(today)
  const [chQty, setChQty] = useState('')
  const [chDesc, setChDesc] = useState('')

  const routesQ = useQuery({
    queryKey: ['routes'],
    queryFn: () => api.routes.list(),
  })

  const listInput = useMemo(() => {
    const min = minBottles.trim() ? Number(minBottles) : undefined
    const days = noReturnDays.trim() ? Number(noReturnDays) : undefined
    return {
      search: search.trim() || undefined,
      routeId: routeId ? Number(routeId) : undefined,
      minBottles: min != null && Number.isFinite(min) ? min : undefined,
      shortfallOnly: shortfallOnly || undefined,
      noReturnDays: days != null && Number.isFinite(days) && days > 0 ? days : undefined,
    }
  }, [search, routeId, minBottles, shortfallOnly, noReturnDays])

  const listQ = useQuery({
    queryKey: ['inventory', 'bottlesOut', listInput],
    queryFn: () => api.inventory.bottlesOut(listInput),
  })

  const items = listQ.data?.items ?? []
  const summary = listQ.data?.summary
  const selected = items.find((r) => r.customerId === selectedCustomerId) ?? null

  async function invalidate() {
    await qc.invalidateQueries({ queryKey: ['inventory'] })
    await qc.invalidateQueries({ queryKey: ['deliveries', 'bottlesOut'] })
  }

  function openAction(customerId: number, kind: ActionPanel) {
    setSelectedCustomerId(customerId)
    setPanel(kind)
    setRetDate(today)
    setRetEmpties('')
    setRetNotes('')
    setChDate(today)
    setChQty('')
    setChDesc('')
  }

  async function exportPdf() {
    try {
      const r = await api.pdf.generateBottlesOut({
        search: listInput.search,
        routeId: listInput.routeId,
        minBottles: listInput.minBottles,
        openAfter: true,
      })
      toast({ title: 'Bottles-out PDF saved', description: r.path, variant: 'success' })
    } catch (e) {
      toast({
        title: e instanceof AppError ? e.message : 'PDF export failed',
        variant: 'error',
        code: e instanceof AppError ? e.code : undefined,
      })
    }
  }

  async function submitReturn() {
    if (selectedCustomerId == null) return
    const empties = Number(retEmpties)
    if (!Number.isFinite(empties) || empties <= 0) {
      toast({ title: 'Empties must be a positive number', variant: 'error' })
      return
    }
    setBusy(true)
    try {
      const r = await api.inventory.recordBottleReturn({
        customerId: selectedCustomerId,
        date: retDate,
        empties,
        notes: retNotes.trim() || null,
      })
      toast({
        title: 'Bottle return recorded',
        description: `Now holding ${r.bottlesWithCustomer}`,
        variant: 'success',
      })
      setPanel(null)
      await invalidate()
    } catch (e) {
      toast({
        title: e instanceof AppError ? e.message : 'Return failed',
        variant: 'error',
        code: e instanceof AppError ? e.code : undefined,
      })
    } finally {
      setBusy(false)
    }
  }

  async function submitCharge() {
    if (selectedCustomerId == null) return
    const quantity = Number(chQty)
    if (!Number.isFinite(quantity) || quantity <= 0) {
      toast({ title: 'Quantity must be a positive number', variant: 'error' })
      return
    }
    setBusy(true)
    try {
      const r = await api.deliveries.recordLoss({
        customerId: selectedCustomerId,
        date: chDate,
        kind: 'lost_bottle',
        quantity,
        description: chDesc.trim() || undefined,
      })
      toast({
        title: 'Lost bottles charged',
        description: `Now holding ${r.bottlesWithCustomer}`,
        variant: 'success',
      })
      setPanel(null)
      await invalidate()
    } catch (e) {
      toast({
        title: e instanceof AppError ? e.message : 'Charge failed',
        variant: 'error',
        code: e instanceof AppError ? e.code : undefined,
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Bottles out"
        subtitle="Customers holding bottles — recovery worklist by quantity"
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to="/inventory">Inventory</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/deliveries/bottles-out">Simple view</Link>
            </Button>
            <Button variant="outline" onClick={() => void exportPdf()}>
              Export PDF
            </Button>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
        <SummaryCard
          label="Total bottles with customers"
          value={summary ? String(summary.totalBottlesWithCustomers) : '…'}
        />
        <SummaryCard
          label="Value at deposit rate"
          valueNode={summary ? <Money value={summary.totalValueAtDepositRate} /> : '…'}
        />
        <SummaryCard
          label="Deposit shortfall"
          valueNode={summary ? <Money value={summary.totalDepositShortfall} /> : '…'}
          warn={!!summary && summary.totalDepositShortfall > 0}
        />
      </div>

      <div className="mb-3 flex flex-wrap items-end gap-2">
        <Input
          className="w-56"
          placeholder="Search…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="h-10 rounded-md border px-2 text-sm"
          value={routeId}
          onChange={(e) => setRouteId(e.target.value)}
        >
          <option value="">All routes</option>
          {(routesQ.data?.items ?? []).map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        <Input
          className="w-28"
          placeholder="Min bottles"
          inputMode="numeric"
          value={minBottles}
          onChange={(e) => setMinBottles(e.target.value)}
        />
        <Input
          className="w-36"
          placeholder="No return (days)"
          inputMode="numeric"
          value={noReturnDays}
          onChange={(e) => setNoReturnDays(e.target.value)}
        />
        <label className="flex h-10 items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={shortfallOnly}
            onChange={(e) => setShortfallOnly(e.target.checked)}
          />
          Shortfall only
        </label>
      </div>

      {panel && selected && (
        <div className="mb-4 rounded-lg border bg-slate-50 p-3">
          <p className="mb-2 text-sm font-medium text-slate-900">
            {panel === 'return' ? 'Record return' : 'Charge lost bottles'} — {selected.code}{' '}
            {selected.name} (holding {selected.bottlesWithCustomer})
          </p>
          {panel === 'return' ? (
            <form
              className="grid grid-cols-2 items-end gap-2 md:grid-cols-4"
              onSubmit={(e) => {
                e.preventDefault()
                void submitReturn()
              }}
            >
              <div>
                <label className="mb-1 block text-xs text-slate-600">Date</label>
                <Input type="date" value={retDate} onChange={(e) => setRetDate(e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-600">Empties returned</label>
                <Input
                  inputMode="numeric"
                  value={retEmpties}
                  onChange={(e) => setRetEmpties(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-600">Notes</label>
                <Input value={retNotes} onChange={(e) => setRetNotes(e.target.value)} />
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={busy} className="h-10">
                  {busy ? '…' : 'Save return'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-10"
                  onClick={() => setPanel(null)}
                >
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <form
              className="grid grid-cols-2 items-end gap-2 md:grid-cols-4"
              onSubmit={(e) => {
                e.preventDefault()
                void submitCharge()
              }}
            >
              <div>
                <label className="mb-1 block text-xs text-slate-600">Date</label>
                <Input type="date" value={chDate} onChange={(e) => setChDate(e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-600">Quantity lost</label>
                <Input
                  inputMode="numeric"
                  value={chQty}
                  onChange={(e) => setChQty(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-600">Description</label>
                <Input value={chDesc} onChange={(e) => setChDesc(e.target.value)} />
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={busy} className="h-10">
                  {busy ? '…' : 'Charge'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-10"
                  onClick={() => setPanel(null)}
                >
                  Cancel
                </Button>
              </div>
            </form>
          )}
        </div>
      )}

      <div className="overflow-auto rounded-lg border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-600">
            <tr>
              <th className="px-3 py-2">Customer</th>
              <th className="px-3 py-2 text-right">Bottles</th>
              <th className="px-3 py-2 text-right">Deposit held</th>
              <th className="px-3 py-2 text-right">Shortfall</th>
              <th className="px-3 py-2">Last delivery</th>
              <th className="px-3 py-2">Last return</th>
              <th className="px-3 py-2 text-right">Days since return</th>
              <th className="px-3 py-2">Phone</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((r) => (
              <tr
                key={r.customerId}
                className={`border-t ${
                  r.depositShortfallAmount > 0 ? 'bg-amber-50' : ''
                } ${selectedCustomerId === r.customerId ? 'ring-1 ring-inset ring-sky-300' : ''}`}
              >
                <td className="px-3 py-2">
                  <Link className="text-sky-800" to={`/customers/${r.customerId}`}>
                    {r.code}
                  </Link>{' '}
                  {r.name}
                  <div className="text-xs text-muted-foreground">
                    {[r.areaName, r.routeName].filter(Boolean).join(' · ') || '—'}
                  </div>
                </td>
                <td className="px-3 py-2 text-right font-medium tabular-nums">
                  {r.bottlesWithCustomer}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  <Money value={r.securityDepositHeld} />
                </td>
                <td
                  className={`px-3 py-2 text-right tabular-nums ${
                    r.depositShortfallAmount > 0 ? 'font-medium text-red-600' : ''
                  }`}
                >
                  <Money value={r.depositShortfallAmount} />
                </td>
                <td className="px-3 py-2">
                  {r.lastDeliveryDate ? <DateText value={r.lastDeliveryDate} /> : '—'}
                </td>
                <td className="px-3 py-2">
                  {r.lastEmptyReturnDate ? <DateText value={r.lastEmptyReturnDate} /> : '—'}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {r.daysSinceLastReturn ?? '—'}
                </td>
                <td className="px-3 py-2">
                  {r.phonePrimary ?? '—'}
                  {r.whatsappNumber && (
                    <a
                      className="ml-2 text-sky-700"
                      href={`https://wa.me/${r.whatsappNumber.replace(/\D/g, '')}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      WhatsApp
                    </a>
                  )}
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="text-xs text-sky-700 underline"
                      onClick={() => openAction(r.customerId, 'return')}
                    >
                      Return
                    </button>
                    <button
                      type="button"
                      className="text-xs text-red-600 underline"
                      onClick={() => openAction(r.customerId, 'charge')}
                    >
                      Charge lost
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {listQ.isLoading && (
          <p className="p-6 text-center text-sm text-muted-foreground">Loading…</p>
        )}
        {!listQ.isLoading && items.length === 0 && (
          <p className="p-6 text-center text-sm text-muted-foreground">
            No bottles currently out matching filters.
          </p>
        )}
      </div>
    </div>
  )
}

function SummaryCard({
  label,
  value,
  valueNode,
  warn,
}: {
  label: string
  value?: string
  valueNode?: React.ReactNode
  warn?: boolean
}) {
  return (
    <div
      className={
        warn
          ? 'rounded-lg border border-amber-300 bg-amber-50 px-3 py-3'
          : 'rounded-lg border bg-white px-3 py-3'
      }
    >
      <p className="text-xs text-slate-600">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums text-slate-900">{valueNode ?? value}</p>
    </div>
  )
}
