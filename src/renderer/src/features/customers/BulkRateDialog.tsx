import { useState } from 'react'
import { toast } from '@renderer/components/Toast'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { api } from '@renderer/lib/api'
import type { ListCustomersInput } from '@shared/contracts'
import { todayBusinessDate } from '@shared/date'
import { toPaisa } from '@shared/money'

export function BulkRateDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [rate, setRate] = useState('')
  const [preview, setPreview] = useState<
    { id: number; code: string; name: string; oldRate: number | null }[]
  >([])
  const [type, setType] = useState<ListCustomersInput['customerType']>()
  async function load() {
    const r = await api.rates.previewBulk({ customerType: type || undefined })
    setPreview(r.items)
  }
  async function apply() {
    try {
      await api.rates.bulkChange({
        customerIds: preview.map((x) => x.id),
        rate: toPaisa(rate),
        effectiveFrom: todayBusinessDate(),
      })
      toast({ title: 'Rates updated', variant: 'success' })
      onSaved()
    } catch (e) {
      toast({
        title: 'Bulk rate change failed',
        description: e instanceof Error ? e.message : 'Error',
        variant: 'error',
      })
    }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-lg space-y-4 rounded-lg bg-white p-6">
        <h2 className="text-lg font-semibold">Bulk rate change</h2>
        <div>
          <Label>Customer type</Label>
          <select
            className="h-9 w-full rounded border px-2"
            value={type ?? ''}
            onChange={(e) =>
              setType((e.target.value || undefined) as ListCustomersInput['customerType'])
            }
          >
            <option value="">All</option>
            <option value="residential">Residential</option>
            <option value="commercial">Commercial</option>
            <option value="walk_in">Walk-in</option>
          </select>
        </div>
        <div>
          <Label>New rate (Rs)</Label>
          <Input value={rate} onChange={(e) => setRate(e.target.value)} type="number" />
        </div>
        <Button variant="outline" onClick={() => void load()}>
          Preview
        </Button>
        <div className="max-h-48 overflow-auto text-sm">
          {preview.map((x) => (
            <div className="flex justify-between border-b py-1" key={x.id}>
              <span>
                {x.code} — {x.name}
              </span>
              <span>
                {x.oldRate == null ? '—' : x.oldRate / 100} → {rate || '—'}
              </span>
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!preview.length || !rate} onClick={() => void apply()}>
            Apply to {preview.length}
          </Button>
        </div>
      </div>
    </div>
  )
}
