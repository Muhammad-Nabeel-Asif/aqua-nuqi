import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { PageHeader } from '@renderer/components/PageHeader'
import { toast } from '@renderer/components/Toast'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { api } from '@renderer/lib/api'
import { periodEnd, periodStart, todayBusinessDate } from '@shared/date'
import { defaultMonthPeriod } from './reportRange'

/**
 * Batch customer statements — reuses Phase 4 pdf:generateStatement for each selection.
 */
export function CustomerStatementsPage() {
  const [period, setPeriod] = useState(defaultMonthPeriod())
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [busy, setBusy] = useState(false)

  const from = periodStart(period)
  const to = periodEnd(period)

  const q = useQuery({
    queryKey: ['customers', 'statement-batch', search],
    queryFn: () =>
      api.customers.list({
        search: search || undefined,
        status: 'active',
        limit: 500,
      }),
  })

  const items = useMemo(
    () => (q.data?.items ?? []).filter((c) => c.customerType !== 'walk_in'),
    [q.data],
  )

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (selected.size === items.length) {
      setSelected(new Set())
      return
    }
    setSelected(new Set(items.map((c) => c.id)))
  }

  async function generate() {
    if (selected.size === 0) {
      toast({ title: 'Select at least one customer', variant: 'error' })
      return
    }
    setBusy(true)
    let ok = 0
    let failed = 0
    try {
      for (const id of selected) {
        try {
          await api.pdf.generateStatement(id, { from, to, openAfter: false })
          ok += 1
        } catch {
          failed += 1
        }
      }
      toast({
        title: `Statements generated: ${ok}`,
        description: failed ? `${failed} failed` : `Saved under Documents · ${from} → ${to}`,
        variant: failed ? 'error' : 'success',
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Customer statements"
        subtitle="Batch-print statements for selected customers (Phase 4 template)"
        actions={
          <Button disabled={busy || selected.size === 0} onClick={() => void generate()}>
            {busy
              ? 'Generating…'
              : `Generate ${selected.size || ''} PDF${selected.size === 1 ? '' : 's'}`}
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Period</label>
          <Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} />
        </div>
        <div className="min-w-[220px] flex-1">
          <label className="mb-1 block text-xs text-muted-foreground">Search</label>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name or code"
          />
        </div>
        <p className="text-sm text-muted-foreground">
          Range {from} → {to} · as of {todayBusinessDate()}
        </p>
      </div>
      <div className="overflow-hidden rounded-lg border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="px-3 py-2">
                <input
                  type="checkbox"
                  checked={items.length > 0 && selected.size === items.length}
                  onChange={toggleAll}
                />
              </th>
              <th className="px-3 py-2">Code</th>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Area</th>
            </tr>
          </thead>
          <tbody>
            {items.map((c) => (
              <tr key={c.id} className="border-t">
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={selected.has(c.id)}
                    onChange={() => toggle(c.id)}
                  />
                </td>
                <td className="px-3 py-2 font-medium">{c.code}</td>
                <td className="px-3 py-2">{c.name}</td>
                <td className="px-3 py-2 text-muted-foreground">{c.areaName ?? '—'}</td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">
                  No customers
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
