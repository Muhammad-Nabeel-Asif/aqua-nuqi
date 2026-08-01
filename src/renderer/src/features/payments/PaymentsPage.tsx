import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { DateText } from '@renderer/components/DateText'
import { Money } from '@renderer/components/Money'
import { PageHeader } from '@renderer/components/PageHeader'
import { toast } from '@renderer/components/Toast'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { api } from '@renderer/lib/api'
import { RecordPaymentDialog } from './RecordPaymentDialog'

export function PaymentsPage() {
  const qc = useQueryClient()
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [customerId, setCustomerId] = useState('')
  const [recordFor, setRecordFor] = useState<number | null>(null)

  const q = useQuery({
    queryKey: ['payments', from, to, customerId],
    queryFn: () =>
      api.payments.list({
        from: from || undefined,
        to: to || undefined,
        customerId: customerId ? Number(customerId) : undefined,
        limit: 500,
      }),
  })

  return (
    <div>
      <PageHeader
        title="Payments"
        subtitle={
          q.data
            ? `${q.data.total} payments · total Rs ${(q.data.totalAmount / 100).toLocaleString('en-PK')}`
            : 'Loading…'
        }
        actions={
          <Button
            onClick={() => {
              const id = window.prompt('Customer ID to record payment for:')
              if (!id) return
              setRecordFor(Number(id))
            }}
          >
            Record payment
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap gap-3">
        <Input
          type="date"
          className="w-40"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
        />
        <Input type="date" className="w-40" value={to} onChange={(e) => setTo(e.target.value)} />
        <Input
          className="w-40"
          placeholder="Customer ID"
          value={customerId}
          onChange={(e) => setCustomerId(e.target.value)}
        />
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
                <td className="p-2">
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

      {recordFor != null && (
        <RecordPaymentDialog
          customerId={recordFor}
          onClose={() => setRecordFor(null)}
          onSaved={() => {
            setRecordFor(null)
            void qc.invalidateQueries({ queryKey: ['payments'] })
          }}
        />
      )}
    </div>
  )
}
