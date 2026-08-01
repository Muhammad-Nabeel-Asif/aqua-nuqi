import { useEffect, useState } from 'react'
import { Money } from '@renderer/components/Money'
import { toast } from '@renderer/components/Toast'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { api } from '@renderer/lib/api'
import type { ExpenseCategoryDto, ExpenseDto, ExpensePaymentMethod } from '@shared/contracts'
import { AppError } from '@shared/errors'
import { toPaisa } from '@shared/money'
import { PAYMENT_METHODS, SOURCE_LABELS } from './date-presets'

export type ExpensePrefill = Partial<{
  expenseDate: string
  categoryId: number
  amountRupees: string
  description: string
  paymentMethod: ExpensePaymentMethod
  vendorName: string
  recurringExpenseId: number
}>

type Props = {
  open: boolean
  expense: ExpenseDto | null
  categories: ExpenseCategoryDto[]
  onClose: () => void
  onSaved: () => void
  prefill?: ExpensePrefill
}

export function ExpenseSidePanel({ open, expense, categories, onClose, onSaved, prefill }: Props) {
  const readOnly = expense != null && expense.readOnly
  const [expenseDate, setExpenseDate] = useState('')
  const [categoryId, setCategoryId] = useState<number | ''>('')
  const [amountRupees, setAmountRupees] = useState('')
  const [description, setDescription] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<ExpensePaymentMethod>('cash')
  const [vendorName, setVendorName] = useState('')
  const [referenceNo, setReferenceNo] = useState('')
  const [attachmentPath, setAttachmentPath] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [employeeId, setEmployeeId] = useState<number | ''>('')
  const [vehicleId, setVehicleId] = useState<number | ''>('')
  const [employees, setEmployees] = useState<Array<{ id: number; name: string; code: string }>>([])
  const [vehicles, setVehicles] = useState<Array<{ id: number; name: string }>>([])
  const [saving, setSaving] = useState(false)
  const [lightbox, setLightbox] = useState(false)

  useEffect(() => {
    if (!open) return
    void api.expenses.attributionOptions().then((r) => {
      setEmployees(r.employees)
      setVehicles(r.vehicles)
    })
  }, [open])

  useEffect(() => {
    if (!open) return
    if (expense) {
      setExpenseDate(expense.expenseDate)
      setCategoryId(expense.categoryId)
      setAmountRupees(String(expense.amount / 100))
      setDescription(expense.description ?? '')
      setPaymentMethod(expense.paymentMethod)
      setVendorName(expense.vendorName ?? '')
      setReferenceNo(expense.referenceNo ?? '')
      setAttachmentPath(expense.attachmentPath)
      setEmployeeId(expense.employeeId ?? '')
      setVehicleId(expense.vehicleId ?? '')
    } else {
      setExpenseDate(prefill?.expenseDate ?? '')
      setCategoryId(prefill?.categoryId ?? '')
      setAmountRupees(prefill?.amountRupees ?? '')
      setDescription(prefill?.description ?? '')
      setPaymentMethod(prefill?.paymentMethod ?? 'cash')
      setVendorName(prefill?.vendorName ?? '')
      setReferenceNo('')
      setAttachmentPath(null)
      setEmployeeId('')
      setVehicleId('')
    }
  }, [open, expense, prefill])

  useEffect(() => {
    if (!attachmentPath) {
      setPreviewUrl(null)
      return
    }
    void api.expenses.attachmentPreview(attachmentPath).then((r) => setPreviewUrl(r.dataUrl))
  }, [attachmentPath])

  if (!open) return null

  async function pickReceipt() {
    const picked = await api.dialog.pickFile({
      title: 'Attach receipt',
      filters: [{ name: 'Images & PDF', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'pdf'] }],
    })
    if (!picked.path) return
    try {
      const result = await api.expenses.attachReceipt(picked.path, expenseDate || undefined)
      setAttachmentPath(result.relativePath)
      if (result.warnedLarge) {
        toast({ title: 'Receipt larger than 5 MB', description: 'Consider a smaller scan.' })
      }
      if (result.downscaled) {
        toast({ title: 'Image downscaled', description: 'Resized to fit under 2000 px.' })
      }
    } catch (e) {
      toast({
        title: e instanceof AppError ? e.message : 'Could not attach receipt',
        variant: 'error',
        code: e instanceof AppError ? e.code : undefined,
      })
    }
  }

  async function save(forceClosedPeriod = false) {
    if (!expenseDate || categoryId === '' || !amountRupees.trim()) {
      toast({ title: 'Date, category and amount are required', variant: 'error' })
      return
    }
    let amount: number
    try {
      amount = Number(toPaisa(amountRupees))
    } catch {
      toast({ title: 'Invalid amount', variant: 'error' })
      return
    }
    if (amount <= 0) {
      toast({ title: 'Amount must be positive', variant: 'error' })
      return
    }
    setSaving(true)
    try {
      if (expense) {
        await api.expenses.update({
          id: expense.id,
          expenseDate,
          categoryId: Number(categoryId),
          amount,
          paymentMethod,
          vendorName: vendorName || null,
          description: description || null,
          referenceNo: referenceNo || null,
          attachmentPath,
          employeeId: employeeId === '' ? null : Number(employeeId),
          vehicleId: vehicleId === '' ? null : Number(vehicleId),
          forceClosedPeriod,
        })
        toast({ title: 'Expense updated', variant: 'success' })
      } else {
        await api.expenses.create({
          expenseDate,
          categoryId: Number(categoryId),
          amount,
          paymentMethod,
          vendorName: vendorName || null,
          description: description || null,
          referenceNo: referenceNo || null,
          attachmentPath,
          employeeId: employeeId === '' ? null : Number(employeeId),
          vehicleId: vehicleId === '' ? null : Number(vehicleId),
          recurringExpenseId: prefill?.recurringExpenseId,
          forceClosedPeriod,
        })
        toast({ title: 'Expense recorded', variant: 'success' })
      }
      onSaved()
      onClose()
    } catch (e) {
      if (e instanceof AppError && e.code === 'PERIOD_LOCKED' && !forceClosedPeriod) {
        if (window.confirm('This period is closed. Save anyway?')) {
          await save(true)
          return
        }
      }
      toast({
        title: e instanceof AppError ? e.message : 'Save failed',
        variant: 'error',
        code: e instanceof AppError ? e.code : undefined,
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} />
      <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-lg font-semibold">
            {expense ? (readOnly ? 'View expense' : 'Edit expense') : 'New expense'}
          </h2>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>

        {readOnly && expense && (
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            Read-only — source is <strong>{SOURCE_LABELS[expense.source] ?? expense.source}</strong>
            .
            {expense.source === 'payroll' &&
              ' Edit from Employees → Payroll so profit is not double-counted.'}
            {expense.source === 'purchase' && ' Edit from Inventory → Purchases.'}
          </div>
        )}

        <div className="flex-1 space-y-3 overflow-auto p-4">
          <div>
            <Label>Date</Label>
            <Input
              type="date"
              value={expenseDate}
              disabled={readOnly}
              onChange={(e) => setExpenseDate(e.target.value)}
            />
          </div>
          <div>
            <Label>Category</Label>
            <select
              className="flex h-10 w-full rounded-md border px-3 text-sm"
              value={categoryId}
              disabled={readOnly}
              onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : '')}
            >
              <option value="">Select…</option>
              {categories
                .filter((c) => c.isActive || c.id === categoryId)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </div>
          <div>
            <Label>Amount (Rs)</Label>
            <Input
              inputMode="decimal"
              value={amountRupees}
              disabled={readOnly}
              onChange={(e) => setAmountRupees(e.target.value)}
            />
          </div>
          <div>
            <Label>Payment method</Label>
            <select
              className="flex h-10 w-full rounded-md border px-3 text-sm"
              value={paymentMethod}
              disabled={readOnly}
              onChange={(e) => setPaymentMethod(e.target.value as ExpensePaymentMethod)}
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Vendor</Label>
            <Input
              value={vendorName}
              disabled={readOnly}
              onChange={(e) => setVendorName(e.target.value)}
            />
          </div>
          <div>
            <Label>Description</Label>
            <Input
              value={description}
              disabled={readOnly}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div>
            <Label>Reference no.</Label>
            <Input
              value={referenceNo}
              disabled={readOnly}
              onChange={(e) => setReferenceNo(e.target.value)}
            />
          </div>
          {employees.length > 0 && (
            <div>
              <Label>Employee</Label>
              <select
                className="flex h-10 w-full rounded-md border px-3 text-sm"
                value={employeeId}
                disabled={readOnly}
                onChange={(e) => setEmployeeId(e.target.value ? Number(e.target.value) : '')}
              >
                <option value="">—</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.code} {e.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {vehicles.length > 0 && (
            <div>
              <Label>Vehicle</Label>
              <select
                className="flex h-10 w-full rounded-md border px-3 text-sm"
                value={vehicleId}
                disabled={readOnly}
                onChange={(e) => setVehicleId(e.target.value ? Number(e.target.value) : '')}
              >
                <option value="">—</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <Label>Receipt</Label>
            <div className="mt-1 flex flex-wrap gap-2">
              {!readOnly && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void pickReceipt()}
                >
                  {attachmentPath ? 'Replace' : 'Attach'}
                </Button>
              )}
              {attachmentPath && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void api.expenses.openAttachment(attachmentPath)}
                  >
                    Open
                  </Button>
                  {previewUrl && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setLightbox(true)}
                    >
                      Preview
                    </Button>
                  )}
                  {!readOnly && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setAttachmentPath(null)
                        setPreviewUrl(null)
                      }}
                    >
                      Remove
                    </Button>
                  )}
                </>
              )}
            </div>
            {previewUrl && (
              <button type="button" className="mt-2 block" onClick={() => setLightbox(true)}>
                <img
                  src={previewUrl}
                  alt="Receipt thumbnail"
                  className="max-h-40 rounded border object-contain"
                />
              </button>
            )}
          </div>

          {expense && (
            <p className="text-xs text-muted-foreground">
              Source: {SOURCE_LABELS[expense.source]} · Amount <Money value={expense.amount} />
            </p>
          )}
        </div>

        {!readOnly && (
          <div className="border-t p-4">
            <Button className="w-full" disabled={saving} onClick={() => void save()}>
              {saving ? 'Saving…' : expense ? 'Save changes' : 'Record expense'}
            </Button>
          </div>
        )}
      </aside>

      {lightbox && previewUrl && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-8"
          onClick={() => setLightbox(false)}
        >
          <img src={previewUrl} alt="Receipt" className="max-h-full max-w-full rounded shadow-lg" />
        </div>
      )}
    </>
  )
}
