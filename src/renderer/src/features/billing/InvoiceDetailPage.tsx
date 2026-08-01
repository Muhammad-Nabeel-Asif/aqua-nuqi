import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { DateText } from '@renderer/components/DateText'
import { Money } from '@renderer/components/Money'
import { PageHeader } from '@renderer/components/PageHeader'
import { toast } from '@renderer/components/Toast'
import { Button } from '@renderer/components/ui/button'
import { RecordPaymentDialog } from '@renderer/features/payments/RecordPaymentDialog'
import { api } from '@renderer/lib/api'
import { InvoiceTemplate } from '@renderer/print/templates/InvoiceTemplate'
import { AppError } from '@shared/errors'
import '@renderer/print/print.css'

export function InvoiceDetailPage() {
  const id = Number(useParams().id)
  const qc = useQueryClient()
  const [payOpen, setPayOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [waHint, setWaHint] = useState(false)
  const [previewPayload, setPreviewPayload] = useState<
    Parameters<typeof InvoiceTemplate>[0] | null
  >(null)

  const q = useQuery({
    queryKey: ['invoice', id],
    queryFn: () => api.invoices.get(id),
    enabled: Number.isFinite(id),
  })
  const settingsQ = useQuery({
    queryKey: ['settings', 'print-preview'],
    queryFn: () => api.settings.get(),
  })
  const inv = q.data?.item

  useEffect(() => {
    if (!inv || !settingsQ.data) return
    const v = settingsQ.data.values
    setPreviewPayload({
      business: {
        name: String(v['business.name'] ?? 'Aqua Nuqi'),
        address: String(v['business.address'] ?? ''),
        phone: String(v['business.phone'] ?? ''),
        phone2: String(v['business.phone2'] ?? ''),
        email: String(v['business.email'] ?? ''),
        bankDetails: String(v['business.bankDetails'] ?? ''),
        taxNumber: String(v['business.taxNumber'] ?? ''),
        logoDataUrl: null,
        accentColour: String(v['invoice.accentColour'] ?? '#0284c7'),
        footerNote: String(v['invoice.footerNote'] ?? ''),
        termsText: String(v['invoice.termsText'] ?? ''),
        showBottleBalance: Boolean(v['invoice.showBottleBalance']),
        showRateColumn: Boolean(v['invoice.showRateColumn']),
        currencySymbol: String(v['locale.currencySymbol'] ?? 'Rs'),
        decimalPlaces: Number(v['locale.decimalPlaces'] ?? 0),
      },
      invoice: {
        invoiceNo: inv.invoiceNo,
        period: inv.period,
        periodStart: inv.periodStart,
        periodEnd: inv.periodEnd,
        issueDate: inv.issueDate,
        dueDate: inv.dueDate,
        openingBalance: inv.openingBalance,
        deliveriesQty: inv.deliveriesQty,
        deliveriesTotal: inv.deliveriesTotal,
        chargesTotal: inv.chargesTotal,
        discountTotal: inv.discountTotal,
        taxTotal: inv.taxTotal,
        invoiceTotal: inv.invoiceTotal,
        totalPayable: inv.totalPayable,
        bottlesWithCustomerAtIssue: inv.bottlesWithCustomerAtIssue,
        status: inv.status,
        lines: inv.lines.map((l) => ({
          lineNo: l.lineNo,
          lineType: l.lineType,
          lineDate: l.lineDate,
          description: l.description,
          quantity: l.quantity,
          rate: l.rate,
          amount: l.amount,
        })),
      },
      customer: {
        code: inv.customerCode,
        name: inv.customerName,
        addressLine: null,
        phonePrimary: null,
        phoneSecondary: null,
        securityDepositHeld: 0,
      },
      emptiesReturned: 0,
      amountInWords: '',
      generatedAt: new Date().toISOString(),
    })
  }, [inv, settingsQ.data])

  if (!inv) return <div className="p-8">Loading…</div>

  const timeline: Array<{ label: string; at: string | null }> = [
    { label: 'Created (draft)', at: inv.createdAt },
    ...(inv.status !== 'draft'
      ? [{ label: inv.status === 'void' ? 'Was issued' : 'Issued', at: inv.issueDate }]
      : []),
    ...(inv.status === 'partially_paid' || inv.status === 'paid'
      ? [{ label: inv.status === 'paid' ? 'Paid in full' : 'Partially paid', at: inv.updatedAt }]
      : []),
    ...(inv.lastSharedAt ? [{ label: 'Shared', at: inv.lastSharedAt }] : []),
    ...(inv.status === 'void'
      ? [{ label: `Voided${inv.voidReason ? `: ${inv.voidReason}` : ''}`, at: inv.updatedAt }]
      : []),
  ]

  async function issue(forceClosedPeriod = false) {
    try {
      await api.invoices.issue(inv!.id, forceClosedPeriod)
      toast({ title: 'Invoice issued', variant: 'success' })
      await qc.invalidateQueries({ queryKey: ['invoice', id] })
    } catch (e) {
      if (e instanceof AppError && e.code === 'PERIOD_LOCKED' && !forceClosedPeriod) {
        if (window.confirm(`${e.message}\n\nIssue anyway into the closed period?`)) {
          await issue(true)
        }
        return
      }
      toast({
        title: 'Issue failed',
        description: e instanceof Error ? e.message : 'Error',
        variant: 'error',
      })
    }
  }

  async function voidInvoice(reason: string, forceClosedPeriod = false) {
    try {
      await api.invoices.void(inv!.id, reason, forceClosedPeriod)
      toast({ title: 'Invoice voided', variant: 'success' })
      await qc.invalidateQueries({ queryKey: ['invoice', id] })
    } catch (e) {
      if (e instanceof AppError && e.code === 'PERIOD_LOCKED' && !forceClosedPeriod) {
        if (window.confirm(`${e.message}\n\nVoid anyway in the closed period?`)) {
          await voidInvoice(reason, true)
        }
        return
      }
      toast({
        title: 'Void failed',
        description: e instanceof Error ? e.message : 'Error',
        variant: 'error',
      })
    }
  }

  async function generatePdf(openAfter = true) {
    setBusy(true)
    try {
      const r = await api.pdf.generateInvoice(inv!.id, openAfter)
      toast({ title: 'PDF saved', description: r.path, variant: 'success' })
      await qc.invalidateQueries({ queryKey: ['invoice', id] })
    } catch (e) {
      toast({
        title: 'PDF failed',
        description: e instanceof Error ? e.message : 'Error',
        variant: 'error',
      })
    } finally {
      setBusy(false)
    }
  }

  async function printPdf() {
    setBusy(true)
    try {
      await api.pdf.printInvoice(inv!.id)
    } catch (e) {
      toast({
        title: 'Print failed',
        description: e instanceof Error ? e.message : 'Error',
        variant: 'error',
      })
    } finally {
      setBusy(false)
    }
  }

  async function shareWhatsApp() {
    setBusy(true)
    try {
      const r = await api.pdf.shareWhatsApp(inv!.id)
      if (r.phoneWarning) {
        toast({ title: 'Check phone number', description: r.phoneWarning, variant: 'error' })
      }
      setWaHint(true)
      await qc.invalidateQueries({ queryKey: ['invoice', id] })
    } catch (e) {
      toast({
        title: 'WhatsApp share failed',
        description: e instanceof Error ? e.message : 'Error',
        variant: 'error',
      })
    } finally {
      setBusy(false)
    }
  }

  async function shareEmail() {
    setBusy(true)
    try {
      await api.pdf.shareEmail(inv!.id)
      toast({ title: 'Email drafted — PDF path copied', variant: 'success' })
      await qc.invalidateQueries({ queryKey: ['invoice', id] })
    } catch (e) {
      toast({
        title: 'Email share failed',
        description: e instanceof Error ? e.message : 'Error',
        variant: 'error',
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <PageHeader
        title={inv.invoiceNo}
        subtitle={`${inv.customerCode} — ${inv.customerName} · ${inv.status}${
          inv.lastSharedAt ? ' · Shared' : ''
        }`}
        actions={
          <>
            {inv.status === 'draft' && <Button onClick={() => void issue()}>Issue</Button>}
            {inv.status !== 'void' && inv.status !== 'draft' && (
              <Button variant="outline" onClick={() => setPayOpen(true)}>
                Record payment
              </Button>
            )}
            {inv.status !== 'void' && (
              <Button
                variant="destructive"
                onClick={() => {
                  const reason = window.prompt('Reason for voiding this invoice:')
                  if (!reason?.trim()) return
                  void voidInvoice(reason.trim())
                }}
              >
                Void
              </Button>
            )}
            <Button disabled={busy} onClick={() => void generatePdf(true)}>
              Save PDF
            </Button>
            <Button disabled={busy} variant="outline" onClick={() => void printPdf()}>
              Print
            </Button>
            <Button disabled={busy} variant="outline" onClick={() => void shareWhatsApp()}>
              WhatsApp
            </Button>
            <Button disabled={busy} variant="outline" onClick={() => void shareEmail()}>
              Email
            </Button>
            {inv.pdfPath ? (
              <Button
                variant="outline"
                onClick={() =>
                  void api.pdf.saveAs(inv.pdfPath!, `${inv.invoiceNo}.pdf`).then((r) => {
                    if (r.path)
                      toast({ title: 'Saved copy', description: r.path, variant: 'success' })
                  })
                }
              >
                Save as…
              </Button>
            ) : null}
          </>
        }
      />
      <Link className="text-sm text-sky-700" to="/billing/invoices">
        ← Back to invoices
      </Link>

      {waHint ? (
        <div className="mt-3 flex items-start justify-between gap-3 rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm">
          <p>
            Attach the PDF that is now highlighted in your file explorer (path also copied to the
            clipboard).
          </p>
          <Button size="sm" variant="outline" onClick={() => setWaHint(false)}>
            Dismiss
          </Button>
        </div>
      ) : null}

      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border bg-white p-4 text-sm">
          <div>
            Issue: <DateText value={inv.issueDate} />
          </div>
          <div>Due: {inv.dueDate ? <DateText value={inv.dueDate} /> : '—'}</div>
          <div>Period: {inv.period ?? 'ad-hoc'}</div>
          <div>Bottles at issue: {inv.bottlesWithCustomerAtIssue}</div>
          {inv.pdfPath ? (
            <div className="mt-2 break-all text-xs text-muted-foreground">PDF: {inv.pdfPath}</div>
          ) : null}
          <div className="mt-3 border-t pt-3">
            <div className="mb-1 font-medium">Status timeline</div>
            <ol className="space-y-1 text-xs text-slate-600">
              {timeline.map((t) => (
                <li key={`${t.label}-${t.at}`}>
                  <span className="font-medium text-slate-800">{t.label}</span>
                  {t.at ? (
                    <>
                      {' · '}
                      <DateText value={t.at.slice(0, 10)} />
                    </>
                  ) : null}
                </li>
              ))}
            </ol>
          </div>
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
            <dt className="font-semibold">Invoice total (revenue)</dt>
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

      {previewPayload ? (
        <div className="mt-4 overflow-auto rounded-lg border bg-slate-100 p-3">
          <div className="mb-2 text-sm font-medium">Print preview</div>
          <div className="bg-white shadow-sm">
            <InvoiceTemplate {...previewPayload} />
          </div>
        </div>
      ) : null}

      <div className="mt-4 overflow-auto rounded-lg border bg-white">
        <div className="border-b bg-slate-50 px-3 py-2 text-sm font-medium">Payment history</div>
        {inv.paymentHistory.length === 0 ? (
          <p className="p-3 text-sm text-muted-foreground">
            No payments allocated to this invoice.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="p-2">Receipt</th>
                <th className="p-2">Date</th>
                <th className="p-2">Method</th>
                <th className="p-2 text-right">Amount</th>
                <th className="p-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {inv.paymentHistory.map((p) => (
                <tr key={`${p.paymentId}-${p.allocationStatus}-${p.amount}`} className="border-t">
                  <td className="p-2">{p.receiptNo ?? '—'}</td>
                  <td className="p-2">
                    {p.paymentDate ? <DateText value={p.paymentDate} /> : '—'}
                  </td>
                  <td className="p-2 capitalize">{p.method.replace(/_/g, ' ')}</td>
                  <td className="p-2 text-right">
                    <Money value={p.amount} />
                  </td>
                  <td className="p-2">
                    {p.paymentStatus === 'void'
                      ? 'payment void'
                      : p.allocationStatus === 'active'
                        ? 'applied'
                        : p.allocationStatus}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
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
