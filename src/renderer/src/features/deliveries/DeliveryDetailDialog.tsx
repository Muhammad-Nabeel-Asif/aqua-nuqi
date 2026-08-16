import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { promptDialog } from '@renderer/components/ConfirmDialog'
import { Money } from '@renderer/components/Money'
import { toast } from '@renderer/components/Toast'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { api } from '@renderer/lib/api'
import { AppError } from '@shared/errors'

type Props = {
  open: boolean
  onClose: () => void
  deliveryId?: number | null
  defaults?: {
    customerId: number
    customerName?: string
    date: string
    quantity?: number
    emptiesCollected?: number
    rate?: number
  }
}

export function DeliveryDetailDialog({ open, onClose, deliveryId, defaults }: Props) {
  const qc = useQueryClient()
  const existing = useQuery({
    queryKey: ['delivery', deliveryId],
    queryFn: () => api.deliveries.get(deliveryId!),
    enabled: open && Boolean(deliveryId),
  })
  const employees = useQuery({
    queryKey: ['employees', 'active'],
    queryFn: () => api.employees.listActive(),
    enabled: open,
  })

  const [quantity, setQuantity] = useState(0)
  const [empties, setEmpties] = useState(0)
  const [rate, setRate] = useState(0)
  const [overrideRate, setOverrideRate] = useState(false)
  const [overrideReason, setOverrideReason] = useState('')
  const [isFree, setIsFree] = useState(false)
  const [freeReason, setFreeReason] = useState('')
  const [cash, setCash] = useState(0)
  const [notes, setNotes] = useState('')
  const [employeeId, setEmployeeId] = useState('')

  useEffect(() => {
    if (!open) return
    const item = existing.data?.item
    if (item) {
      setQuantity(item.quantity)
      setEmpties(item.emptiesCollected)
      setRate(item.rate)
      setOverrideRate(false)
      setIsFree(item.isFree)
      setFreeReason(item.freeReason ?? '')
      setCash(item.cashCollected)
      setNotes(item.notes ?? '')
      setEmployeeId(item.employeeId == null ? '' : String(item.employeeId))
    } else if (defaults) {
      setQuantity(defaults.quantity ?? 0)
      setEmpties(defaults.emptiesCollected ?? defaults.quantity ?? 0)
      setRate(defaults.rate ?? 0)
      setOverrideRate(false)
      setIsFree(false)
      setFreeReason('')
      setCash(0)
      setNotes('')
      setEmployeeId('')
    }
  }, [open, existing.data, defaults])

  const save = useMutation({
    mutationFn: () =>
      api.deliveries.upsert({
        customerId: existing.data?.item.customerId ?? defaults!.customerId,
        date: existing.data?.item.deliveryDate ?? defaults!.date,
        quantity,
        emptiesCollected: empties,
        employeeId: employeeId ? Number(employeeId) : null,
        rate: overrideRate ? rate : undefined,
        rateOverrideReason: overrideRate ? overrideReason || 'manual override' : undefined,
        isFree,
        freeReason: isFree ? freeReason || 'complimentary' : null,
        cashCollected: cash,
        notes: notes || null,
      }),
    onSuccess: async () => {
      toast({ title: 'Delivery saved', variant: 'success' })
      await qc.invalidateQueries({ queryKey: ['deliveries'] })
      await qc.invalidateQueries({ queryKey: ['customer'] })
      onClose()
    },
    onError: (err) => {
      const e = err instanceof AppError ? err : null
      toast({
        title: e?.message ?? 'Save failed',
        description: e?.code,
        variant: 'error',
      })
    },
  })

  const voidMut = useMutation({
    mutationFn: async () => {
      const reason = await promptDialog({
        title: 'Cancel this delivery?',
        description: 'Use only if this row was entered by mistake. It stays in history.',
        label: 'Reason',
        confirmLabel: 'Cancel delivery',
        danger: true,
      })
      if (!reason?.trim()) throw new AppError('VALIDATION_FAILED', 'Reason required')
      if (!deliveryId) throw new AppError('NOT_FOUND', 'No delivery to void')
      return api.deliveries.void(deliveryId, reason.trim())
    },
    onSuccess: async () => {
      toast({ title: 'Delivery voided', variant: 'success' })
      await qc.invalidateQueries({ queryKey: ['deliveries'] })
      onClose()
    },
    onError: (err) => {
      if (err instanceof AppError && err.code === 'VALIDATION_FAILED') return
      toast({
        title: err instanceof AppError ? err.message : 'Void failed',
        variant: 'error',
      })
    },
  })

  if (!open) return null
  const locked = existing.data?.item.locked
  const amount = isFree ? 0 : quantity * rate

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-lg bg-white p-5 shadow-xl">
        <h2 className="text-lg font-semibold text-sky-950">Delivery detail</h2>
        <p className="text-sm text-muted-foreground">
          {defaults?.customerName ?? existing.data?.item.customerName ?? 'Customer'} ·{' '}
          {existing.data?.item.deliveryDate ?? defaults?.date}
        </p>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <Field label="Quantity">
            <Input
              type="number"
              min={0}
              disabled={locked}
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value) || 0)}
            />
          </Field>
          <Field label="Empties collected">
            <Input
              type="number"
              min={0}
              disabled={locked}
              value={empties}
              onChange={(e) => setEmpties(Number(e.target.value) || 0)}
            />
          </Field>
          <Field label="Rate (paisa)">
            <Input
              type="number"
              min={0}
              disabled={locked || !overrideRate}
              value={rate}
              onChange={(e) => setRate(Number(e.target.value) || 0)}
            />
          </Field>
          <Field label="Amount">
            <div className="flex h-10 items-center font-medium tabular-nums">
              <Money value={amount} />
            </div>
          </Field>
        </div>

        <label className="mt-3 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            disabled={locked}
            checked={overrideRate}
            onChange={(e) => setOverrideRate(e.target.checked)}
          />
          Override rate
        </label>
        {overrideRate && (
          <Input
            className="mt-1"
            placeholder="Override reason"
            disabled={locked}
            value={overrideReason}
            onChange={(e) => setOverrideReason(e.target.value)}
          />
        )}

        <label className="mt-3 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            disabled={locked}
            checked={isFree}
            onChange={(e) => setIsFree(e.target.checked)}
          />
          Free / complimentary
        </label>
        {isFree && (
          <Input
            className="mt-1"
            placeholder="Free reason"
            disabled={locked}
            value={freeReason}
            onChange={(e) => setFreeReason(e.target.value)}
          />
        )}

        <Field label="Employee">
          <select
            className="flex h-10 w-full rounded-md border px-2 text-sm"
            disabled={locked}
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
          >
            <option value="">Unassigned</option>
            {(employees.data?.items ?? []).map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.code} — {employee.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Cash collected (paisa)">
          <Input
            type="number"
            min={0}
            disabled={locked}
            value={cash}
            onChange={(e) => setCash(Number(e.target.value) || 0)}
          />
        </Field>
        <Field label="Notes">
          <Input disabled={locked} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>

        {existing.data?.item && (
          <p className="mt-3 text-xs text-muted-foreground">
            Created {existing.data.item.createdAt} · Updated {existing.data.item.updatedAt}
            {existing.data.item.invoiceId != null && ' · Locked to invoice'}
          </p>
        )}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          {deliveryId && !locked && (
            <Button variant="destructive" onClick={() => voidMut.mutate()}>
              Void
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          {!locked && (
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              Save
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-2">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  )
}
