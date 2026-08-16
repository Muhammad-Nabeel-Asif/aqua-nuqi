import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { DateText } from '@renderer/components/DateText'
import { Money } from '@renderer/components/Money'
import { PageHeader } from '@renderer/components/PageHeader'
import { toast } from '@renderer/components/Toast'
import { Button } from '@renderer/components/ui/button'
import { RecordPaymentDialog } from '@renderer/features/payments/RecordPaymentDialog'
import { api } from '@renderer/lib/api'
import { formatMoney, type Paisa } from '@shared/money'
import { toWhatsAppE164 } from '@shared/phone'

export function ReceivablesPage() {
  const qc = useQueryClient()
  const [payFor, setPayFor] = useState<{ id: number; label: string; balance: number } | null>(null)
  const q = useQuery({
    queryKey: ['receivables'],
    queryFn: () => api.receivables.report(),
  })
  const data = q.data

  async function exportCsv() {
    if (!data) return
    await api.pdf.exportExcel({
      title: `Receivables ${data.asOf}`,
      fileName: `receivables-${data.asOf}.xlsx`,
      openAfter: true,
      columns: [
        { key: 'code', header: 'Code' },
        { key: 'name', header: 'Name' },
        { key: 'phone', header: 'Phone' },
        { key: 'balance', header: 'Balance', align: 'right' },
        { key: 'bucket', header: 'Bucket' },
        { key: 'daysOverdue', header: 'Days overdue', align: 'right' },
        { key: 'oldestUnpaid', header: 'Oldest unpaid' },
        { key: 'lastPayment', header: 'Last payment' },
      ],
      rows: data.outstanding.map((r) => ({
        code: r.code,
        name: r.name,
        phone: r.phone,
        balance: formatMoney(r.balance as Paisa),
        bucket: r.ageingBucket,
        daysOverdue: r.daysOverdue,
        oldestUnpaid: r.oldestUnpaidInvoiceDate,
        lastPayment: r.lastPaymentDate,
      })),
    })
  }

  async function exportPdf() {
    try {
      const r = await api.pdf.generateReceivables(undefined, true)
      toast({ title: 'Receivables PDF saved', description: r.path, variant: 'success' })
    } catch (e) {
      toast({
        title: 'PDF export failed',
        description: e instanceof Error ? e.message : 'Error',
        variant: 'error',
      })
    }
  }

  return (
    <div>
      <PageHeader
        title="Unpaid bills"
        subtitle={data ? `As of ${data.asOf}` : 'Loading…'}
        actions={
          <>
            <Button variant="outline" onClick={() => void exportCsv()}>
              Export Excel
            </Button>
            <Button variant="outline" onClick={() => void exportPdf()}>
              Export PDF
            </Button>
          </>
        }
      />

      {data && (
        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
          {(
            [
              ['Current', data.bucketTotals.current],
              ['1–30', data.bucketTotals['1-30']],
              ['31–60', data.bucketTotals['31-60']],
              ['60+', data.bucketTotals['60+']],
              ['Total', data.totalOutstanding],
            ] as const
          ).map(([label, val]) => (
            <div key={label} className="rounded-lg border bg-white p-3">
              <div className="text-xs text-muted-foreground">{label}</div>
              <div className="text-lg font-semibold">
                <Money value={val} />
              </div>
            </div>
          ))}
        </div>
      )}

      <h2 className="mb-2 font-semibold">Outstanding</h2>
      <div className="mb-6 overflow-auto rounded-lg border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="p-2">Customer</th>
              <th className="p-2">Area / Route</th>
              <th className="p-2 text-right">Balance</th>
              <th className="p-2">Oldest unpaid</th>
              <th className="p-2 text-right">Days</th>
              <th className="p-2">Bucket</th>
              <th className="p-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(data?.outstanding ?? []).map((r) => (
              <tr key={r.customerId} className="border-t">
                <td className="p-2">
                  <Link className="text-sky-700" to={`/customers/${r.customerId}`}>
                    {r.code} — {r.name}
                  </Link>
                </td>
                <td className="p-2 text-xs">
                  {r.areaName ?? '—'} / {r.routeName ?? '—'}
                </td>
                <td className="p-2 text-right text-red-700">
                  <Money value={r.balance} />
                </td>
                <td className="p-2">
                  {r.oldestUnpaidInvoiceDate ? <DateText value={r.oldestUnpaidInvoiceDate} /> : '—'}
                </td>
                <td className="p-2 text-right tabular-nums">{r.daysOverdue}</td>
                <td className="p-2">{r.ageingBucket}</td>
                <td className="p-2 space-x-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setPayFor({
                        id: r.customerId,
                        label: `${r.code} — ${r.name}`,
                        balance: r.balance,
                      })
                    }
                  >
                    Pay
                  </Button>
                  {r.phone && (
                    <a
                      className="text-xs text-sky-700"
                      href={`https://wa.me/${toWhatsAppE164(r.phone)}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      WhatsApp
                    </a>
                  )}
                  <Link className="text-xs text-sky-700" to={`/customers/${r.customerId}`}>
                    Ledger
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mb-2 font-semibold">
        In credit {data ? <Money value={data.totalCredit} /> : null}
      </h2>
      <div className="overflow-auto rounded-lg border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="p-2">Customer</th>
              <th className="p-2 text-right">Credit</th>
              <th className="p-2">Last payment</th>
            </tr>
          </thead>
          <tbody>
            {(data?.inCredit ?? []).map((r) => (
              <tr key={r.customerId} className="border-t">
                <td className="p-2">
                  <Link className="text-sky-700" to={`/customers/${r.customerId}`}>
                    {r.code} — {r.name}
                  </Link>
                </td>
                <td className="p-2 text-right text-emerald-700">
                  <Money value={r.balance} /> CR
                </td>
                <td className="p-2">
                  {r.lastPaymentDate ? <DateText value={r.lastPaymentDate} /> : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {payFor && (
        <RecordPaymentDialog
          customerId={payFor.id}
          customerLabel={payFor.label}
          defaultAmount={payFor.balance}
          onClose={() => setPayFor(null)}
          onSaved={() => {
            setPayFor(null)
            void qc.invalidateQueries({ queryKey: ['receivables'] })
          }}
        />
      )}
    </div>
  )
}
