import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { Money } from '@renderer/components/Money'
import { toast } from '@renderer/components/Toast'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { api } from '@renderer/lib/api'
import type { PaymentDto } from '@shared/contracts'
import { toPaisa } from '@shared/money'

export function ReallocatePaymentDialog({
  payment,
  onClose,
  onSaved,
}: {
  payment: PaymentDto
  onClose: () => void
  onSaved: () => void
}) {
  const invoices = useQuery({
    queryKey: ['invoices', 'reallocate', payment.customerId],
    queryFn: () =>
      api.invoices.list({
        customerId: payment.customerId,
        limit: 200,
      }),
  })

  const openInvoices = useMemo(() => {
    const items = invoices.data?.items ?? []
    return items.filter(
      (inv) =>
        inv.status === 'issued' ||
        inv.status === 'partially_paid' ||
        payment.allocations.some((a) => a.status === 'active' && a.invoiceId === inv.id),
    )
  }, [invoices.data?.items, payment.allocations])

  const [amounts, setAmounts] = useState<Record<number, string>>(() => {
    const init: Record<number, string> = {}
    for (const a of payment.allocations.filter((x) => x.status === 'active')) {
      init[a.invoiceId] = String(a.amount / 100)
    }
    return init
  })
  const [busy, setBusy] = useState(false)

  const planned = useMemo(() => {
    const rows: Array<{ invoiceId: number; amount: number }> = []
    for (const [id, text] of Object.entries(amounts)) {
      const trimmed = text.trim()
      if (!trimmed) continue
      try {
        const amount = Number(toPaisa(trimmed))
        if (amount > 0) rows.push({ invoiceId: Number(id), amount })
      } catch {
        // ignore invalid while typing
      }
    }
    return rows
  }, [amounts])

  const plannedTotal = planned.reduce((s, r) => s + r.amount, 0)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg space-y-4 overflow-auto rounded-lg bg-white p-6 shadow-lg">
        <h2 className="text-lg font-semibold">Reallocate {payment.receiptNo}</h2>
        <p className="text-sm text-muted-foreground">
          {payment.customerCode} — {payment.customerName} · payment <Money value={payment.amount} />
        </p>
        <div className="space-y-2">
          <Label>Allocate to invoices (Rs)</Label>
          {openInvoices.length === 0 ? (
            <p className="text-sm text-muted-foreground">No open invoices for this customer.</p>
          ) : (
            openInvoices.map((inv) => (
              <div key={inv.id} className="flex items-center gap-2 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{inv.invoiceNo}</div>
                  <div className="text-xs text-muted-foreground">
                    due <Money value={inv.balanceDue} /> · {inv.status}
                  </div>
                </div>
                <Input
                  className="w-28"
                  type="number"
                  value={amounts[inv.id] ?? ''}
                  onChange={(e) => setAmounts((prev) => ({ ...prev, [inv.id]: e.target.value }))}
                />
              </div>
            ))
          )}
        </div>
        <p className="text-sm">
          Allocated <Money value={plannedTotal} /> of <Money value={payment.amount} />
          {plannedTotal > payment.amount ? (
            <span className="text-red-600"> — exceeds payment</span>
          ) : null}
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            disabled={busy || plannedTotal > payment.amount}
            onClick={() =>
              void (async () => {
                setBusy(true)
                try {
                  await api.payments.reallocate(payment.id, planned)
                  toast({ title: 'Payment reallocated', variant: 'success' })
                  onSaved()
                } catch (e) {
                  toast({
                    title: 'Reallocate failed',
                    description: e instanceof Error ? e.message : 'Error',
                    variant: 'error',
                  })
                } finally {
                  setBusy(false)
                }
              })()
            }
          >
            Save
          </Button>
        </div>
      </div>
    </div>
  )
}
