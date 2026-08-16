import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { PageHeader } from '@renderer/components/PageHeader'
import { toast } from '@renderer/components/Toast'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { api } from '@renderer/lib/api'
import { formatAppError } from '@renderer/lib/app-error-message'
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
  const byId = useMemo(() => new Map(items.map((c) => [c.id, c])), [items])

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
    const errors: string[] = []
    let lastPath: string | null = null
    try {
      for (const id of selected) {
        const label = byId.get(id)
        const who = label ? `${label.code} ${label.name}` : `Customer ${id}`
        try {
          const result = await api.pdf.generateStatement(id, { from, to, openAfter: false })
          lastPath = result.path
        } catch (err) {
          errors.push(`${who}: ${formatAppError(err, 'Could not create this statement')}`)
        }
      }
      const ok = selected.size - errors.length
      if (errors.length === 0 && lastPath) {
        toast({
          title: `Statements generated: ${ok}`,
          description: `Saved under Documents · Statements · ${from} → ${to}`,
          variant: 'success',
        })
        void api.pdf.showInFolder(lastPath).catch(() => {
          // folder reveal is optional
        })
      } else {
        toast({
          title: ok ? `Statements generated: ${ok} · ${errors.length} failed` : 'Statements failed',
          description: errors.slice(0, 3).join(' · '),
          variant: 'error',
        })
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Customer statements"
        subtitle="Tick the customers, then generate PDFs for this month"
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
