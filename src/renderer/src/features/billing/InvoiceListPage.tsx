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
import { previousPeriod, currentPeriod } from '@shared/date'

export function InvoiceListPage() {
  const qc = useQueryClient()
  const [period, setPeriod] = useState(previousPeriod(currentPeriod()))
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [overdueOnly, setOverdueOnly] = useState(false)
  const [selected, setSelected] = useState<Set<number>>(new Set())

  const q = useQuery({
    queryKey: ['invoices', period, status, search, overdueOnly],
    queryFn: () =>
      api.invoices.list({
        period: period || undefined,
        status: (status || undefined) as
          'draft' | 'issued' | 'partially_paid' | 'paid' | 'void' | undefined,
        search: search || undefined,
        overdueOnly: overdueOnly || undefined,
        limit: 500,
      }),
  })

  const items = q.data?.items ?? []

  return (
    <div>
      <PageHeader
        title="Invoices"
        subtitle={`${q.data?.total ?? 0} invoices`}
        actions={
          <>
            <Button asChild variant="outline">
              <Link to="/billing/generate">Generate bills</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/billing/periods">Periods</Link>
            </Button>
            <Button
              disabled={!selected.size}
              onClick={() =>
                void (async () => {
                  const r = await api.invoices.issueAll([...selected])
                  toast({ title: `Issued ${r.issued}`, variant: 'success' })
                  setSelected(new Set())
                  await qc.invalidateQueries({ queryKey: ['invoices'] })
                })()
              }
            >
              Issue selected
            </Button>
            {/* TODO(phase-4): enable PDF export */}
            <Button disabled title="TODO(phase-4)">
              Export PDFs
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap gap-3">
        <Input
          type="month"
          className="w-40"
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
        />
        <select
          className="h-10 rounded-md border px-3 text-sm"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="issued">Issued</option>
          <option value="partially_paid">Partially paid</option>
          <option value="paid">Paid</option>
          <option value="void">Void</option>
        </select>
        <Input
          className="w-56"
          placeholder="Search…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={overdueOnly}
            onChange={(e) => setOverdueOnly(e.target.checked)}
          />
          Overdue only
        </label>
      </div>

      <div className="overflow-auto rounded-lg border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="p-2" />
              <th className="p-2">Invoice</th>
              <th className="p-2">Date</th>
              <th className="p-2">Customer</th>
              <th className="p-2 text-right">Units</th>
              <th className="p-2 text-right">Total</th>
              <th className="p-2 text-right">Paid</th>
              <th className="p-2 text-right">Balance</th>
              <th className="p-2">Status</th>
              <th className="p-2">Due</th>
            </tr>
          </thead>
          <tbody>
            {items.map((inv) => (
              <tr key={inv.id} className="border-t">
                <td className="p-2">
                  <input
                    type="checkbox"
                    checked={selected.has(inv.id)}
                    onChange={(e) => {
                      const next = new Set(selected)
                      if (e.target.checked) next.add(inv.id)
                      else next.delete(inv.id)
                      setSelected(next)
                    }}
                  />
                </td>
                <td className="p-2">
                  <Link className="text-sky-700" to={`/billing/invoices/${inv.id}`}>
                    {inv.invoiceNo}
                  </Link>
                </td>
                <td className="p-2">
                  <DateText value={inv.issueDate} />
                </td>
                <td className="p-2">
                  {inv.customerCode} — {inv.customerName}
                </td>
                <td className="p-2 text-right tabular-nums">{inv.deliveriesQty}</td>
                <td className="p-2 text-right">
                  <Money value={inv.invoiceTotal} />
                </td>
                <td className="p-2 text-right">
                  <Money value={inv.paidTotal} />
                </td>
                <td className="p-2 text-right">
                  <Money value={inv.balanceDue} />
                </td>
                <td className="p-2 capitalize">{inv.status.replace(/_/g, ' ')}</td>
                <td className="p-2">{inv.dueDate ? <DateText value={inv.dueDate} /> : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
