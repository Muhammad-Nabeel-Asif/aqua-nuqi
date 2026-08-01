import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { DateText } from '@renderer/components/DateText'
import { Money } from '@renderer/components/Money'
import { PageHeader } from '@renderer/components/PageHeader'
import { toast } from '@renderer/components/Toast'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { api } from '@renderer/lib/api'
import type { PaymentDto } from '@shared/contracts'
import { formatMoney, type Paisa } from '@shared/money'
import { ReallocatePaymentDialog } from './ReallocatePaymentDialog'
import { RecordPaymentDialog } from './RecordPaymentDialog'

export function PaymentsPage() {
  const qc = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [customerQuery, setCustomerQuery] = useState('')
  const [customerId, setCustomerId] = useState<number | ''>('')
  const [customerHits, setCustomerHits] = useState<
    Array<{ id: number; code: string; name: string }>
  >([])
  const [recordFor, setRecordFor] = useState<{ id: number; label: string } | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [reallocate, setReallocate] = useState<PaymentDto | null>(null)

  useEffect(() => {
    if (searchParams.get('record') === '1') {
      setPickerOpen(true)
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, setSearchParams])

  useEffect(() => {
    const q = customerQuery.trim()
    if (q.length < 2) {
      setCustomerHits([])
      return
    }
    const timer = window.setTimeout(
      () =>
        void api.customers
          .search(q)
          .then((r) =>
            setCustomerHits(r.items.map((c) => ({ id: c.id, code: c.code, name: c.name }))),
          ),
      250,
    )
    return () => window.clearTimeout(timer)
  }, [customerQuery])

  const q = useQuery({
    queryKey: ['payments', from, to, customerId],
    queryFn: () =>
      api.payments.list({
        from: from || undefined,
        to: to || undefined,
        customerId: customerId === '' ? undefined : customerId,
        limit: 500,
      }),
  })

  return (
    <div>
      <PageHeader
        title="Payments"
        subtitle={
          q.data
            ? `${q.data.total} payments · total ${formatMoney(q.data.totalAmount as Paisa)}`
            : 'Loading…'
        }
        actions={<Button onClick={() => setPickerOpen(true)}>Record payment</Button>}
      />

      <div className="mb-4 flex flex-wrap gap-3">
        <Input
          type="date"
          className="w-40"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
        />
        <Input type="date" className="w-40" value={to} onChange={(e) => setTo(e.target.value)} />
        <div className="relative">
          <Input
            className="w-56"
            placeholder="Filter by customer"
            value={customerQuery}
            onChange={(e) => {
              setCustomerQuery(e.target.value)
              if (!e.target.value.trim()) setCustomerId('')
            }}
          />
          {customerHits.length > 0 && (
            <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-md border bg-white shadow">
              {customerHits.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className="w-full px-3 py-2 text-left text-sm hover:bg-sky-50"
                    onClick={() => {
                      setCustomerId(c.id)
                      setCustomerQuery(`${c.code} — ${c.name}`)
                      setCustomerHits([])
                    }}
                  >
                    {c.code} — {c.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="overflow-auto rounded-lg border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="p-2">Receipt</th>
              <th className="p-2">Date</th>
              <th className="p-2">Customer</th>
              <th className="p-2">Method</th>
              <th className="p-2 text-right">Amount</th>
              <th className="p-2 text-right">Unallocated</th>
              <th className="p-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(q.data?.items ?? []).map((p) => (
              <tr key={p.id} className="border-t">
                <td className="p-2">{p.receiptNo}</td>
                <td className="p-2">
                  <DateText value={p.paymentDate} />
                </td>
                <td className="p-2">
                  {p.customerCode} — {p.customerName}
                </td>
                <td className="p-2 capitalize">{p.method.replace(/_/g, ' ')}</td>
                <td className="p-2 text-right">
                  <Money value={p.amount} />
                </td>
                <td className="p-2 text-right">
                  <Money value={p.unallocated} />
                </td>
                <td className="p-2 space-x-2">
                  <Button size="sm" variant="outline" onClick={() => setReallocate(p)}>
                    Reallocate
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      void (async () => {
                        const reason = window.prompt('Reason to void this payment:')
                        if (!reason?.trim()) return
                        await api.payments.void(p.id, reason.trim())
                        toast({ title: 'Payment voided', variant: 'success' })
                        await qc.invalidateQueries({ queryKey: ['payments'] })
                      })()
                    }
                  >
                    Void
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pickerOpen && (
        <CustomerPickDialog
          onClose={() => setPickerOpen(false)}
          onPick={(c) => {
            setPickerOpen(false)
            setRecordFor(c)
          }}
        />
      )}

      {recordFor != null && (
        <RecordPaymentDialog
          customerId={recordFor.id}
          customerLabel={recordFor.label}
          onClose={() => setRecordFor(null)}
          onSaved={() => {
            setRecordFor(null)
            void qc.invalidateQueries({ queryKey: ['payments'] })
          }}
        />
      )}

      {reallocate && (
        <ReallocatePaymentDialog
          payment={reallocate}
          onClose={() => setReallocate(null)}
          onSaved={() => {
            setReallocate(null)
            void qc.invalidateQueries({ queryKey: ['payments'] })
          }}
        />
      )}
    </div>
  )
}

function CustomerPickDialog({
  onClose,
  onPick,
}: {
  onClose: () => void
  onPick: (c: { id: number; label: string }) => void
}) {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<Array<{ id: number; code: string; name: string }>>([])

  useEffect(() => {
    const query = q.trim()
    if (query.length < 2) {
      setHits([])
      return
    }
    const timer = window.setTimeout(
      () =>
        void api.customers
          .search(query)
          .then((r) => setHits(r.items.map((c) => ({ id: c.id, code: c.code, name: c.name })))),
      250,
    )
    return () => window.clearTimeout(timer)
  }, [q])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-md space-y-4 rounded-lg bg-white p-6 shadow-lg">
        <h2 className="text-lg font-semibold">Record payment — pick customer</h2>
        <Input
          autoFocus
          placeholder="Search name, code, phone…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <ul className="max-h-64 overflow-auto rounded-md border">
          {hits.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm hover:bg-sky-50"
                onClick={() => onPick({ id: c.id, label: `${c.code} — ${c.name}` })}
              >
                {c.code} — {c.name}
              </button>
            </li>
          ))}
          {q.trim().length >= 2 && hits.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-muted-foreground">No matches</li>
          ) : null}
        </ul>
        <div className="flex justify-end">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  )
}
