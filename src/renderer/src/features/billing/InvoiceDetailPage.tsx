import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { confirmDialog, promptDialog } from '@renderer/components/ConfirmDialog'
import { DateText } from '@renderer/components/DateText'
import { Money } from '@renderer/components/Money'
import { PageHeader } from '@renderer/components/PageHeader'
import { toast } from '@renderer/components/Toast'
import { Button } from '@renderer/components/ui/button'
import { RecordPaymentDialog } from '@renderer/features/payments/RecordPaymentDialog'
import { api } from '@renderer/lib/api'
import { formatAppError } from '@renderer/lib/app-error-message'
import { INVOICE_STATUS_LABEL } from '@renderer/lib/plain-labels'
import {
  InvoiceTemplate,
  type InvoiceTemplateProps,
} from '@renderer/print/templates/InvoiceTemplate'
import { AppError } from '@shared/errors'
import '@renderer/print/print.css'

export function InvoiceDetailPage() {
  const id = Number(useParams().id)
  const qc = useQueryClient()
  const [payOpen, setPayOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [waHint, setWaHint] = useState(false)

  const q = useQuery({
    queryKey: ['invoice', id],
    queryFn: () => api.invoices.get(id),
    enabled: Number.isFinite(id),
  })
  /** Same payload as PDF generation — WYSIWYG with logo, phones, empties, amount-in-words. */
  const previewQ = useQuery({
    queryKey: ['invoice-print-payload', id],
    queryFn: () => api.pdf.getInvoicePrintPayload(id),
    enabled: Number.isFinite(id) && !!q.data?.item,
  })
  const inv = q.data?.item
  const previewPayload: InvoiceTemplateProps | null = previewQ.data
    ? {
        business: previewQ.data.business,
        invoice: previewQ.data.invoice,
        customer: previewQ.data.customer,
        emptiesReturned: previewQ.data.emptiesReturned,
        amountInWords: previewQ.data.amountInWords,
        generatedAt: previewQ.data.generatedAt,
      }
    : null

  if (!inv) return <div className="p-8">Loading…</div>

  const timeline: Array<{ label: string; at: string | null }> = [
    { label: 'Created (draft)', at: inv.createdAt },
    ...(inv.status !== 'draft'
      ? [{ label: inv.status === 'void' ? 'Was sent' : 'Sent', at: inv.issueDate }]
      : []),
    ...(inv.status === 'partially_paid' || inv.status === 'paid'
      ? [{ label: inv.status === 'paid' ? 'Paid in full' : 'Partially paid', at: inv.updatedAt }]
      : []),
    ...(inv.lastSharedAt ? [{ label: 'Shared', at: inv.lastSharedAt }] : []),
    ...(inv.status === 'void'
      ? [{ label: `Cancelled${inv.voidReason ? `: ${inv.voidReason}` : ''}`, at: inv.updatedAt }]
      : []),
  ]

  async function issue(forceClosedPeriod = false) {
    try {
      await api.invoices.issue(inv!.id, forceClosedPeriod)
      toast({ title: 'Bill sent', variant: 'success' })
      await qc.invalidateQueries({ queryKey: ['invoice', id] })
      await qc.invalidateQueries({ queryKey: ['invoices'] })
      await qc.invalidateQueries({ queryKey: ['receivables'] })
    } catch (e) {
      if (e instanceof AppError && e.code === 'PERIOD_LOCKED' && !forceClosedPeriod) {
        const ok = await confirmDialog({
          title: 'This billing month is locked',
          description: `${formatAppError(e)} Send this bill anyway into the locked month?`,
          confirmLabel: 'Send anyway',
          danger: true,
        })
        if (ok) await issue(true)
        return
      }
      toast({
        title: 'Could not send this bill',
        description: formatAppError(e),
        variant: 'error',
      })
    }
  }

  async function voidInvoice(reason: string, forceClosedPeriod = false) {
    try {
      await api.invoices.void(inv!.id, reason, forceClosedPeriod)
      toast({ title: 'Bill cancelled', variant: 'success' })
      await qc.invalidateQueries({ queryKey: ['invoice', id] })
      await qc.invalidateQueries({ queryKey: ['invoices'] })
      await qc.invalidateQueries({ queryKey: ['receivables'] })
    } catch (e) {
      if (e instanceof AppError && e.code === 'PERIOD_LOCKED' && !forceClosedPeriod) {
        const ok = await confirmDialog({
          title: 'This billing month is locked',
          description: `${formatAppError(e)} Cancel this bill even though the month is locked?`,
          confirmLabel: 'Cancel this bill anyway',
          danger: true,
        })
        if (ok) await voidInvoice(reason, true)
        return
      }
      toast({
        title: 'Could not cancel this bill',
        description: formatAppError(e),
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
        subtitle={`${inv.customerCode} — ${inv.customerName} · ${INVOICE_STATUS_LABEL[inv.status] ?? inv.status}${
          inv.lastSharedAt ? ' · Shared' : ''
        }`}
        actions={
          <>
            {inv.status === 'draft' && <Button onClick={() => void issue()}>Send this bill</Button>}
            {inv.status !== 'void' && inv.status !== 'draft' && (
              <Button variant="outline" onClick={() => setPayOpen(true)}>
                Record payment
              </Button>
            )}
            {inv.status !== 'void' && (
              <Button
                variant="destructive"
                onClick={() => {
                  void (async () => {
                    const reason = await promptDialog({
                      title: 'Cancel this bill?',
                      description:
                        'Use only if this bill should not count. The customer and month stay the same.',
                      label: 'Reason',
                      confirmLabel: 'Cancel this bill',
                      danger: true,
                    })
                    if (!reason?.trim()) return
                    await voidInvoice(reason.trim())
                  })()
                }}
              >
                Cancel this bill
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
          <div>Billing month: {inv.period ?? 'One-off'}</div>
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
            void qc.invalidateQueries({ queryKey: ['receivables'] })
          }}
        />
      )}
    </div>
  )
}
