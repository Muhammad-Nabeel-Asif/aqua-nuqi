import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Money } from '@renderer/components/Money'
import { toast } from '@renderer/components/Toast'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { api } from '@renderer/lib/api'
import { AppError } from '@shared/errors'
import { toPaisa } from '@shared/money'

type Props = {
  open: boolean
  onClose: () => void
  date: string
}

export function WalkInDialog({ open, onClose, date }: Props) {
  const qc = useQueryClient()
  const [quantity, setQuantity] = useState(1)
  const [rateRs, setRateRs] = useState('60')
  const [cashRs, setCashRs] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [notes, setNotes] = useState('')

  const rate = Number(toPaisa(rateRs || '0'))
  const amount = quantity * rate
  const cash = cashRs === '' ? amount : Number(toPaisa(cashRs))

  const save = useMutation({
    mutationFn: () =>
      api.deliveries.walkIn({
        date,
        quantity,
        rate,
        cashCollected: cash,
        name: name || undefined,
        phone: phone || undefined,
        notes: notes || null,
      }),
    onSuccess: async () => {
      toast({ title: 'Walk-in sale recorded', variant: 'success' })
      await qc.invalidateQueries({ queryKey: ['deliveries'] })
      setQuantity(1)
      setName('')
      setPhone('')
      setNotes('')
      setCashRs('')
      onClose()
    },
    onError: (err) => {
      toast({
        title: err instanceof AppError ? err.message : 'Failed',
        description: err instanceof AppError ? err.code : undefined,
        variant: 'error',
      })
    },
  })

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
        <h2 className="text-lg font-semibold">Walk-in / cash sale</h2>
        <p className="text-sm text-muted-foreground">
          Recorded against the system WALK-IN customer (not invoiced).
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div>
            <Label>Quantity</Label>
            <Input
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
            />
          </div>
          <div>
            <Label>Rate (Rs)</Label>
            <Input value={rateRs} onChange={(e) => setRateRs(e.target.value)} />
          </div>
          <div>
            <Label>Amount</Label>
            <div className="flex h-10 items-center font-medium">
              <Money value={amount} />
            </div>
          </div>
          <div>
            <Label>Cash received (Rs)</Label>
            <Input
              placeholder={String(amount / 100)}
              value={cashRs}
              onChange={(e) => setCashRs(e.target.value)}
            />
          </div>
        </div>
        <div className="mt-3">
          <Label>Name (optional)</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="mt-3">
          <Label>Phone (optional)</Label>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div className="mt-3">
          <Label>Notes</Label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            Record sale
          </Button>
        </div>
      </div>
    </div>
  )
}
