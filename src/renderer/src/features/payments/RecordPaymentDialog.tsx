import { useState } from 'react'
import { toast } from '@renderer/components/Toast'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { api } from '@renderer/lib/api'
import { todayBusinessDate } from '@shared/date'
import { toPaisa } from '@shared/money'

const METHODS = [
  'cash',
  'bank_transfer',
  'jazzcash',
  'easypaisa',
  'cheque',
  'online',
  'other',
] as const

export function RecordPaymentDialog({
  customerId,
  customerLabel,
  defaultAmount,
  onClose,
  onSaved,
}: {
  customerId: number
  customerLabel?: string
  defaultAmount?: number
  onClose: () => void
  onSaved: () => void
}) {
  const [date, setDate] = useState(todayBusinessDate())
  const [amount, setAmount] = useState(defaultAmount != null ? String(defaultAmount / 100) : '')
  const [method, setMethod] = useState<(typeof METHODS)[number]>('cash')
  const [referenceNo, setReferenceNo] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-md space-y-4 rounded-lg bg-white p-6 shadow-lg">
        <h2 className="text-lg font-semibold">Record payment</h2>
        {customerLabel && <p className="text-sm text-muted-foreground">{customerLabel}</p>}
        <div>
          <Label>Date</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <Label>Amount (Rs)</Label>
          <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div>
          <Label>Method</Label>
          <select
            className="flex h-10 w-full rounded-md border px-3 text-sm"
            value={method}
            onChange={(e) => setMethod(e.target.value as (typeof METHODS)[number])}
          >
            {METHODS.map((m) => (
              <option key={m} value={m}>
                {m.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label>Reference</Label>
          <Input value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} />
        </div>
        <div>
          <Label>Notes</Label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            disabled={busy}
            onClick={() =>
              void (async () => {
                setBusy(true)
                try {
                  await api.payments.record({
                    customerId,
                    date,
                    amount: Number(toPaisa(amount)),
                    method,
                    referenceNo: referenceNo || null,
                    notes: notes || null,
                  })
                  toast({ title: 'Payment recorded', variant: 'success' })
                  onSaved()
                } catch (e) {
                  toast({
                    title: 'Payment failed',
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
