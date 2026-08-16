import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { promptDialog } from '@renderer/components/ConfirmDialog'
import { Money } from '@renderer/components/Money'
import { toast } from '@renderer/components/Toast'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { api } from '@renderer/lib/api'
import type { ExpenseCategoryDto, RecurringExpenseDto } from '@shared/contracts'
import { todayBusinessDate } from '@shared/date'
import { AppError } from '@shared/errors'
import { paisaToDecimalString, toPaisa } from '@shared/money'

type Props = {
  categories: ExpenseCategoryDto[]
  onRecordDue: (r: RecurringExpenseDto) => void
}

export function RecurringExpensesPanel({ categories, onRecordDue }: Props) {
  const qc = useQueryClient()
  const listQ = useQuery({
    queryKey: ['recurringExpenses', 'list', true],
    queryFn: () => api.recurringExpenses.list(true),
  })
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [categoryId, setCategoryId] = useState<number | ''>('')
  const [amount, setAmount] = useState('')
  const [frequency, setFrequency] = useState<'monthly' | 'quarterly' | 'yearly'>('monthly')
  const [dayOfMonth, setDayOfMonth] = useState('1')
  const [vendorName, setVendorName] = useState('')
  const [nextDueDate, setNextDueDate] = useState(todayBusinessDate())
  const [busy, setBusy] = useState(false)

  const items = listQ.data?.items ?? []
  const activeCategories = categories.filter((c) => c.isActive)

  async function refresh() {
    await qc.invalidateQueries({ queryKey: ['recurringExpenses'] })
  }

  async function create() {
    if (!name.trim() || categoryId === '' || !amount.trim()) {
      toast({ title: 'Name, category and amount are required', variant: 'error' })
      return
    }
    let paisa: number
    try {
      paisa = Number(toPaisa(amount))
    } catch {
      toast({ title: 'Invalid amount', variant: 'error' })
      return
    }
    setBusy(true)
    try {
      const day = Number(dayOfMonth)
      await api.recurringExpenses.create({
        name: name.trim(),
        categoryId: Number(categoryId),
        amount: paisa,
        frequency,
        dayOfMonth: Number.isFinite(day) && day >= 1 && day <= 28 ? day : null,
        vendorName: vendorName.trim() || null,
        nextDueDate,
      })
      setName('')
      setAmount('')
      setVendorName('')
      toast({ title: 'Recurring expense created', variant: 'success' })
      await refresh()
    } catch (e) {
      toast({
        title: e instanceof AppError ? e.message : 'Could not create recurring expense',
        variant: 'error',
        code: e instanceof AppError ? e.code : undefined,
      })
    } finally {
      setBusy(false)
    }
  }

  async function rename(r: RecurringExpenseDto) {
    const next = await promptDialog({
      title: 'Rename recurring expense',
      label: 'Name',
      defaultValue: r.name,
      confirmLabel: 'Rename',
    })
    if (!next?.trim() || next.trim() === r.name) return
    try {
      await api.recurringExpenses.update({ id: r.id, name: next.trim() })
      toast({ title: 'Updated', variant: 'success' })
      await refresh()
    } catch (e) {
      toast({
        title: e instanceof AppError ? e.message : 'Update failed',
        variant: 'error',
      })
    }
  }

  async function editAmount(r: RecurringExpenseDto) {
    const next = await promptDialog({
      title: 'Expected amount',
      label: 'Amount (Rs)',
      defaultValue: paisaToDecimalString(r.amount),
      confirmLabel: 'Update amount',
    })
    if (next == null || !next.trim()) return
    let paisa: number
    try {
      paisa = Number(toPaisa(next))
    } catch {
      toast({ title: 'Invalid amount', variant: 'error' })
      return
    }
    try {
      await api.recurringExpenses.update({ id: r.id, amount: paisa })
      toast({ title: 'Amount updated', variant: 'success' })
      await refresh()
    } catch (e) {
      toast({
        title: e instanceof AppError ? e.message : 'Update failed',
        variant: 'error',
      })
    }
  }

  async function toggleActive(r: RecurringExpenseDto) {
    try {
      await api.recurringExpenses.update({ id: r.id, isActive: !r.isActive })
      toast({ title: r.isActive ? 'Deactivated' : 'Reactivated', variant: 'success' })
      await refresh()
    } catch (e) {
      toast({
        title: e instanceof AppError ? e.message : 'Update failed',
        variant: 'error',
      })
    }
  }

  return (
    <div className="mb-4 rounded-lg border bg-white">
      <div className="flex items-center justify-between px-4 py-3">
        <div>
          <h3 className="font-semibold">Recurring expenses</h3>
          <p className="text-xs text-muted-foreground">
            Define rent, electricity, etc. — due items appear above for one-click confirm.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          data-testid="recurring-manage"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? 'Hide' : 'Manage'}
        </Button>
      </div>

      {open && (
        <div className="border-t px-4 py-3">
          <div className="mb-4 grid grid-cols-2 items-end gap-2 md:grid-cols-7">
            <div>
              <label className="mb-1 block text-xs text-slate-600">Name</label>
              <Input
                data-testid="recurring-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Rent"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-600">Category</label>
              <select
                className="flex h-10 w-full rounded-md border bg-white px-2 text-sm"
                data-testid="recurring-category"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : '')}
              >
                <option value="">Select…</option>
                {activeCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-600">Amount (Rs)</label>
              <Input
                inputMode="decimal"
                data-testid="recurring-amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-600">Frequency</label>
              <select
                className="flex h-10 w-full rounded-md border bg-white px-2 text-sm"
                value={frequency}
                onChange={(e) => setFrequency(e.target.value as 'monthly' | 'quarterly' | 'yearly')}
              >
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="yearly">Yearly</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-600">Day of month</label>
              <Input
                inputMode="numeric"
                value={dayOfMonth}
                onChange={(e) => setDayOfMonth(e.target.value)}
                placeholder="1–28"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-600">Next due</label>
              <Input
                type="date"
                value={nextDueDate}
                onChange={(e) => setNextDueDate(e.target.value)}
              />
            </div>
            <Button
              disabled={busy}
              data-testid="recurring-add"
              onClick={() => void create()}
              className="h-10"
            >
              {busy ? '…' : 'Add'}
            </Button>
          </div>
          <div className="mb-3">
            <label className="mb-1 block text-xs text-slate-600">Vendor (optional)</label>
            <Input
              className="max-w-xs"
              value={vendorName}
              onChange={(e) => setVendorName(e.target.value)}
            />
          </div>

          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">No recurring templates yet.</p>
          ) : (
            <ul className="divide-y rounded border">
              {items.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
                >
                  <div>
                    <span className={!r.isActive ? 'text-slate-400 line-through' : 'font-medium'}>
                      {r.name}
                    </span>
                    <span className="ml-2 text-slate-600">
                      <Money value={r.amount} /> · {r.frequency}
                      {r.vendorName ? ` · ${r.vendorName}` : ''}
                    </span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      next {r.nextDueDate}
                      {r.isDue ? ' · due' : ''}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    {r.isActive && r.isDue && (
                      <button
                        type="button"
                        className="text-xs text-sky-700 underline"
                        onClick={() => onRecordDue(r)}
                      >
                        Record
                      </button>
                    )}
                    <button
                      type="button"
                      className="text-xs text-slate-600 underline"
                      onClick={() => void rename(r)}
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      className="text-xs text-slate-600 underline"
                      onClick={() => void editAmount(r)}
                    >
                      Amount
                    </button>
                    <button
                      type="button"
                      className="text-xs text-red-600 underline"
                      onClick={() => void toggleActive(r)}
                    >
                      {r.isActive ? 'Deactivate' : 'Reactivate'}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
