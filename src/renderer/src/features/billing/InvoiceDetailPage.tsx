import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { DateText } from '@renderer/components/DateText'
import { Money } from '@renderer/components/Money'
import { PageHeader } from '@renderer/components/PageHeader'
import { toast } from '@renderer/components/Toast'
import { Button } from '@renderer/components/ui/button'
import { RecordPaymentDialog } from '@renderer/features/payments/RecordPaymentDialog'
import { api } from '@renderer/lib/api'

export function InvoiceDetailPage() {
  const id = Number(useParams().id)
  const qc = useQueryClient()
  const [payOpen, setPayOpen] = useState(false)
  const q = useQuery({
    queryKey: ['invoice', id],
    queryFn: () => api.invoices.get(id),
    enabled: Number.isFinite(id),
  })
  const inv = q.data?.item
  if (!inv) return <div className="p-8">Loading…</div>

  return (
    <div>
      <PageHeader
        title={inv.invoiceNo}
        subtitle={`${inv.customerCode} — ${inv.customerName} · ${inv.status}`}
        actions={
          <>
            {inv.status === 'draft' && (
              <Button
                onClick={() =>
                  void (async () => {
                    await api.invoices.issue(inv.id)
                    toast({ title: 'Invoice issued', variant: 'success' })
                    await qc.invalidateQueries({ queryKey: ['invoice', id] })
                  })()
                }
              >
                Issue
              </Button>
            )}
            {inv.status !== 'void' && inv.status !== 'draft' && (
              <Button variant="outline" onClick={() => setPayOpen(true)}>
                Record payment
              </Button>
            )}
            {inv.status !== 'void' && (
              <Button
                variant="destructive"
                onClick={() =>
                  void (async () => {
                    const reason = window.prompt('Reason for voiding this invoice:')
                    if (!reason?.trim()) return
                    await api.invoices.void(inv.id, reason.trim())
                    toast({ title: 'Invoice voided', variant: 'success' })
                    await qc.invalidateQueries({ queryKey: ['invoice', id] })
                  })()
                }
              >
                Void
              </Button>
            )}
            {/* TODO(phase-4): print / share PDF */}
            <Button disabled title="TODO(phase-4)">
              Print PDF
            </Button>
            <Button disabled title="TODO(phase-4)">
              Share
            </Button>
          </>
        }
      />
      <Link className="text-sm text-sky-700" to="/billing/invoices">
        ← Back to invoices
      </Link>

      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border bg-white p-4 text-sm">
          <div>
            Issue: <DateText value={inv.issueDate} />
          </div>
          <div>Due: {inv.dueDate ? <DateText value={inv.dueDate} /> : '—'}</div>
          <div>Period: {inv.period ?? 'ad-hoc'}</div>
          <div>Bottles at issue: {inv.bottlesWithCustomerAtIssue}</div>
        </div>
        <div className="rounded-lg border bg-white p-4 text-sm md:col-span-2">
          <dl className="grid grid-cols-2 gap-2">
            <dt>Opening</dt>
            <dd className="text-right">
              <Money value={inv.openingBalance} />
            </dd>
            <dt>Deliveries</dt>
            <dd className="text-right">
              <Money value={inv.deliveriesTotal} />
            </dd>
            <dt>Charges</dt>
            <dd className="text-right">
              <Money value={inv.chargesTotal} />
            </dd>
            <dt>Discount</dt>
            <dd className="text-right">
              <Money value={inv.discountTotal} />
            </dd>
            <dt>Tax</dt>
            <dd className="text-right">
              <Money value={inv.taxTotal} />
            </dd>
            <dt className="font-semibold">Invoice total</dt>
            <dd className="text-right font-semibold">
              <Money value={inv.invoiceTotal} />
            </dd>
            <dt className="font-semibold">Total payable</dt>
            <dd className="text-right font-semibold">
              <Money value={inv.totalPayable} />
            </dd>
            <dt>Paid</dt>
            <dd className="text-right">
              <Money value={inv.paidTotal} />
            </dd>
            <dt>Balance due</dt>
            <dd className="text-right">
              <Money value={inv.balanceDue} />
            </dd>
          </dl>
        </div>
      </div>

      <div className="mt-4 overflow-auto rounded-lg border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="p-2">#</th>
              <th className="p-2">Type</th>
              <th className="p-2">Date</th>
              <th className="p-2">Description</th>
              <th className="p-2 text-right">Qty</th>
              <th className="p-2 text-right">Rate</th>
              <th className="p-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {inv.lines.map((l) => (
              <tr key={l.id} className="border-t">
                <td className="p-2">{l.lineNo}</td>
                <td className="p-2">{l.lineType}</td>
                <td className="p-2">{l.lineDate ? <DateText value={l.lineDate} /> : '—'}</td>
                <td className="p-2">{l.description}</td>
                <td className="p-2 text-right tabular-nums">{l.quantity}</td>
                <td className="p-2 text-right">
                  <Money value={l.rate} />
                </td>
                <td className="p-2 text-right">
                  <Money value={l.amount} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {payOpen && (
        <RecordPaymentDialog
          customerId={inv.customerId}
          customerLabel={`${inv.customerCode} — ${inv.customerName}`}
          defaultAmount={Math.max(0, inv.balanceDue)}
          onClose={() => setPayOpen(false)}
          onSaved={() => {
            setPayOpen(false)
            void qc.invalidateQueries({ queryKey: ['invoice', id] })
          }}
        />
      )}
    </div>
  )
}
