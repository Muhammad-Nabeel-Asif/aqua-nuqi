import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { confirmDialog, promptDialog } from '@renderer/components/ConfirmDialog'
import { Money } from '@renderer/components/Money'
import { PageHeader } from '@renderer/components/PageHeader'
import { toast } from '@renderer/components/Toast'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { api } from '@renderer/lib/api'
import type { ExpensePaymentMethod, PayrollItemDto } from '@shared/contracts'
import { todayBusinessDate } from '@shared/date'
import { AppError } from '@shared/errors'
import { paisaToDecimalString, toPaisa } from '@shared/money'

const METHODS: ExpensePaymentMethod[] = [
  'cash',
  'bank_transfer',
  'jazzcash',
  'easypaisa',
  'cheque',
  'other',
]

export function PayrollPage() {
  const qc = useQueryClient()
  const [period, setPeriod] = useState(todayBusinessDate().slice(0, 7))
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [paymentDate, setPaymentDate] = useState(todayBusinessDate())
  const [paymentMethod, setPaymentMethod] = useState<ExpensePaymentMethod>('cash')
  const [comparePeriod, setComparePeriod] = useState(todayBusinessDate().slice(0, 7))
  const runsQ = useQuery({ queryKey: ['payroll', 'runs'], queryFn: () => api.payroll.list() })
  const compareQ = useQuery({
    queryKey: ['employees', 'compare', comparePeriod],
    queryFn: () => api.employees.comparePerformance(comparePeriod),
  })
  useEffect(() => {
    if (selectedId == null && runsQ.data?.items[0]) setSelectedId(runsQ.data.items[0].id)
  }, [runsQ.data, selectedId])
  const runQ = useQuery({
    queryKey: ['payroll', selectedId],
    queryFn: () => api.payroll.get(selectedId!),
    enabled: selectedId != null,
  })
  const run = runQ.data?.run

  async function refresh() {
    await qc.invalidateQueries({ queryKey: ['payroll'] })
  }
  async function generate() {
    try {
      const result = await api.payroll.generate(period)
      setSelectedId(result.run.id)
      toast({ title: `Salaries generated for ${period}`, variant: 'success' })
      await refresh()
    } catch (err) {
      toast({
        title: err instanceof AppError ? err.message : 'Could not generate payroll',
        variant: 'error',
      })
    }
  }
  async function finalize() {
    if (
      !run ||
      !(await confirmDialog({
        title: `Confirm salaries for ${run.period}?`,
        description: 'This posts salary expenses for the month.',
        confirmLabel: 'Confirm salaries',
      }))
    )
      return
    try {
      const result = await api.payroll.finalize({
        id: run.id,
        paymentDate,
        paymentMethod,
      })
      toast({
        title: 'Salaries confirmed',
        description: `Salary expense: ${result.salariesExpenseTotal / 100}. Record payments when cash is paid.`,
        variant: 'success',
      })
      await refresh()
    } catch (err) {
      toast({
        title: err instanceof AppError ? err.message : 'Could not finalize payroll',
        variant: 'error',
      })
    }
  }
  async function voidRun() {
    if (!run) return
    const reason = await promptDialog({
      title: 'Cancel this payroll run?',
      description: 'Use only if this run was created by mistake. It stays in history.',
      label: 'Reason',
      confirmLabel: 'Cancel payroll',
      danger: true,
    })
    if (!reason?.trim()) return
    try {
      await api.payroll.void(run.id, reason.trim())
      toast({ title: 'Payroll run voided', variant: 'success' })
      await refresh()
    } catch (err) {
      toast({
        title: err instanceof AppError ? err.message : 'Could not void payroll',
        variant: 'error',
      })
    }
  }
  async function payAll() {
    if (!run) return
    const ok = await confirmDialog({
      title: 'Record all unpaid salaries?',
      description: `This records payment for every unpaid salary in ${run.period}.`,
      confirmLabel: 'Record payments',
    })
    if (!ok) return
    try {
      const result = await api.payroll.payAll({
        runId: run.id,
        paymentDate,
        paymentMethod,
      })
      toast({ title: `Recorded ${result.items.length} payments`, variant: 'success' })
      await refresh()
    } catch (err) {
      toast({
        title: err instanceof AppError ? err.message : 'Could not pay salaries',
        variant: 'error',
      })
    }
  }
  async function slips() {
    if (!run) return
    try {
      const result = await api.pdf.batchGenerateSalarySlips(run.id, true)
      toast({
        title: `Generated ${result.generated} salary slips`,
        description: result.folder,
        variant: 'success',
      })
    } catch (err) {
      toast({
        title: err instanceof AppError ? err.message : 'Could not generate salary slips',
        variant: 'error',
      })
    }
  }
  return (
    <div>
      <PageHeader
        title="Monthly salaries"
        subtitle="Generate, review, confirm and pay monthly salaries."
        actions={
          <Button variant="outline" asChild>
            <Link to="/employees/advances">Advances</Link>
          </Button>
        }
      />
      <div className="grid gap-4 xl:grid-cols-[260px_1fr]">
        <aside className="rounded-lg border bg-white p-3">
          <h2 className="font-semibold">Generate salaries</h2>
          <div className="mt-3 flex gap-2">
            <Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} />
            <Button onClick={() => void generate()}>Generate</Button>
          </div>
          <h2 className="mt-6 font-semibold">Salary runs</h2>
          <div className="mt-2 space-y-1">
            {(runsQ.data?.items ?? []).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedId(item.id)}
                className={`w-full rounded-md border px-3 py-2 text-left text-sm ${item.id === selectedId ? 'border-sky-300 bg-sky-50' : 'hover:bg-slate-50'}`}
              >
                <div className="flex justify-between">
                  <strong>{item.period}</strong>
                  <span className="capitalize">{item.status}</span>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {item.itemCount} employees · <Money value={item.totalNet} />
                </div>
              </button>
            ))}
          </div>
        </aside>
        <section>
          {!run ? (
            <div className="rounded-lg border bg-white p-8 text-center text-sm text-muted-foreground">
              Select a payroll run or generate one.
            </div>
          ) : (
            <>
              <div className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border bg-white p-4">
                <div>
                  <p className="text-xs text-muted-foreground">Period</p>
                  <p className="font-semibold">{run.period}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  <p className="font-semibold capitalize">{run.status}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Working-days basis</p>
                  <p className="font-semibold">{run.workingDaysBasis.replaceAll('_', ' ')}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total net</p>
                  <p className="font-semibold">
                    <Money value={run.totalNet} />
                  </p>
                </div>
                <label className="ml-auto text-xs text-muted-foreground">
                  Payment date
                  <Input
                    className="mt-1 w-40"
                    type="date"
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                  />
                </label>
                <label className="text-xs text-muted-foreground">
                  Method
                  <select
                    className="mt-1 flex h-10 rounded-md border bg-white px-2 text-sm"
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as ExpensePaymentMethod)}
                  >
                    {METHODS.map((x) => (
                      <option key={x} value={x}>
                        {x.replaceAll('_', ' ')}
                      </option>
                    ))}
                  </select>
                </label>
                {run.status === 'draft' ? (
                  <Button onClick={() => void finalize()}>Confirm salaries</Button>
                ) : null}
                {run.status === 'finalized' ? (
                  <Button onClick={() => void payAll()}>Pay all</Button>
                ) : null}
                {run.status !== 'void' ? (
                  <Button variant="destructive" onClick={() => void voidRun()}>
                    Void
                  </Button>
                ) : null}
                <Button variant="outline" onClick={() => void slips()}>
                  Salary slips
                </Button>
              </div>
              <PayrollTable
                items={runQ.data?.items ?? []}
                editable={run.status === 'draft'}
                payable={run.status === 'finalized'}
                paymentDate={paymentDate}
                paymentMethod={paymentMethod}
                onSaved={refresh}
              />
            </>
          )}
          <div className="mt-6 rounded-lg border bg-white p-4">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="font-semibold">Employee comparison</h2>
                <p className="text-xs text-muted-foreground">
                  Bottles, customers and attendance for a chosen month
                </p>
              </div>
              <Input
                className="w-40"
                type="month"
                value={comparePeriod}
                onChange={(e) => setComparePeriod(e.target.value)}
              />
            </div>
            <div className="overflow-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b text-xs text-muted-foreground">
                  <tr>
                    {['Employee', 'Bottles', 'Customers', 'Deliveries', 'Cash', 'Attendance'].map(
                      (h) => (
                        <th key={h} className="px-2 py-2 font-medium">
                          {h}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {(compareQ.data?.items ?? []).map((row) => (
                    <tr key={row.employeeId} className="border-b last:border-0">
                      <td className="px-2 py-2">
                        <Link className="text-sky-800" to={`/employees/${row.employeeId}`}>
                          {row.code} · {row.name}
                        </Link>
                      </td>
                      <td className="px-2 py-2">{row.bottlesDelivered}</td>
                      <td className="px-2 py-2">{row.uniqueCustomers}</td>
                      <td className="px-2 py-2">{row.deliveriesCount}</td>
                      <td className="px-2 py-2">
                        <Money value={row.cashCollected} />
                      </td>
                      <td className="px-2 py-2">{row.attendancePercent}%</td>
                    </tr>
                  ))}
                  {!compareQ.data?.items.length ? (
                    <tr>
                      <td className="px-2 py-4 text-muted-foreground" colSpan={6}>
                        No active employees to compare.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

function PayrollTable({
  items,
  editable,
  payable,
  paymentDate,
  paymentMethod,
  onSaved,
}: {
  items: PayrollItemDto[]
  editable: boolean
  payable: boolean
  paymentDate: string
  paymentMethod: ExpensePaymentMethod
  onSaved: () => Promise<void>
}) {
  const totals = items.reduce(
    (a, i) => ({
      gross: a.gross + i.grossPay,
      absence: a.absence + i.absenceDeduction,
      commission: a.commission + i.commissionAmount,
      overtime: a.overtime + i.overtimeAmount,
      bonus: a.bonus + i.bonusAmount,
      advances: a.advances + i.advancesDeducted,
      other: a.other + i.otherDeductions,
      net: a.net + i.netPayable,
      paid: a.paid + i.paidAmount,
    }),
    {
      gross: 0,
      absence: 0,
      commission: 0,
      overtime: 0,
      bonus: 0,
      advances: 0,
      other: 0,
      net: 0,
      paid: 0,
    },
  )
  return (
    <div className="overflow-auto rounded-lg border bg-white">
      <table className="min-w-max w-full text-right text-sm">
        <thead className="bg-sky-50 text-xs text-slate-600">
          <tr>
            {[
              'Employee',
              'Base',
              'Days P/A',
              'Gross',
              'Absence',
              'Commission',
              'OT',
              'Bonus',
              'Advances',
              'Carry forward',
              'Other deductions',
              'Net',
              'Paid',
              '',
            ].map((x) => (
              <th key={x} className="px-2 py-3 font-semibold first:text-left">
                {x}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <PayrollRow
              key={item.id}
              item={item}
              editable={editable}
              payable={payable}
              paymentDate={paymentDate}
              paymentMethod={paymentMethod}
              onSaved={onSaved}
            />
          ))}
        </tbody>
        <tfoot className="border-t bg-slate-50 font-semibold">
          <tr>
            <td className="px-2 py-3 text-left">Totals</td>
            <td />
            <td />
            <td className="px-2">
              <Money value={totals.gross} />
            </td>
            <td className="px-2">
              <Money value={totals.absence} />
            </td>
            <td className="px-2">
              <Money value={totals.commission} />
            </td>
            <td className="px-2">
              <Money value={totals.overtime} />
            </td>
            <td className="px-2">
              <Money value={totals.bonus} />
            </td>
            <td className="px-2">
              <Money value={totals.advances} />
            </td>
            <td />
            <td className="px-2">
              <Money value={totals.other} />
            </td>
            <td className="px-2">
              <Money value={totals.net} />
            </td>
            <td className="px-2">
              <Money value={totals.paid} />
            </td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
function PayrollRow({
  item,
  editable,
  payable,
  paymentDate,
  paymentMethod,
  onSaved,
}: {
  item: PayrollItemDto
  editable: boolean
  payable: boolean
  paymentDate: string
  paymentMethod: ExpensePaymentMethod
  onSaved: () => Promise<void>
}) {
  const [bonus, setBonus] = useState(paisaToDecimalString(item.bonusAmount))
  const [other, setOther] = useState(paisaToDecimalString(item.otherDeductions))
  const [notes, setNotes] = useState(item.deductionNotes ?? '')
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    setBonus(paisaToDecimalString(item.bonusAmount))
    setOther(paisaToDecimalString(item.otherDeductions))
    setNotes(item.deductionNotes ?? '')
  }, [item])
  async function save() {
    try {
      setSaving(true)
      await api.payroll.updateItem({
        id: item.id,
        bonusAmount: Number(toPaisa(bonus || '0')),
        otherDeductions: Number(toPaisa(other || '0')),
        deductionNotes: notes || null,
      })
      await onSaved()
    } catch (err) {
      toast({
        title: err instanceof AppError ? err.message : 'Could not update payroll item',
        variant: 'error',
      })
    } finally {
      setSaving(false)
    }
  }
  async function pay() {
    const remaining = item.netPayable - item.paidAmount
    if (remaining <= 0) return
    const raw = await promptDialog({
      title: `Pay ${item.employeeCode}`,
      description: `Remaining ${paisaToDecimalString(remaining)} Rs`,
      label: 'Amount (Rs)',
      defaultValue: paisaToDecimalString(remaining),
      confirmLabel: 'Record payment',
    })
    if (raw == null) return
    try {
      setSaving(true)
      await api.payroll.recordPayment({
        itemId: item.id,
        amount: Number(toPaisa(raw || '0')),
        paymentDate,
        paymentMethod,
      })
      toast({ title: 'Payment recorded', variant: 'success' })
      await onSaved()
    } catch (err) {
      toast({
        title: err instanceof AppError ? err.message : 'Could not record payment',
        variant: 'error',
      })
    } finally {
      setSaving(false)
    }
  }
  const unpaid = payable && item.netPayable - item.paidAmount > 0
  return (
    <tr className="border-t">
      <td className="max-w-48 px-2 py-2 text-left">
        <strong>{item.employeeCode}</strong> {item.employeeName}
        <div className="text-xs text-muted-foreground">{item.salaryType.replaceAll('_', ' ')}</div>
        {item.warning ? <div className="mt-1 text-xs text-amber-700">{item.warning}</div> : null}
      </td>
      <td className="px-2">
        <Money value={item.baseAmount} />
      </td>
      <td className="px-2">
        {item.daysPresent}/{item.daysAbsent}
      </td>
      <td className="px-2">
        <Money value={item.grossPay} />
      </td>
      <td className="px-2">
        <Money value={item.absenceDeduction} />
      </td>
      <td className="px-2">
        <Money value={item.commissionAmount} />
      </td>
      <td className="px-2">
        <Money value={item.overtimeAmount} />
      </td>
      <td className="px-2">
        {editable ? (
          <Input
            className="h-8 w-24 text-right"
            value={bonus}
            onChange={(e) => setBonus(e.target.value)}
          />
        ) : (
          <Money value={item.bonusAmount} />
        )}
      </td>
      <td className="px-2">
        <Money value={item.advancesDeducted} />
      </td>
      <td className={`px-2 ${item.advancesCarryForward > 0 ? 'font-semibold text-amber-700' : ''}`}>
        <Money value={item.advancesCarryForward} />
      </td>
      <td className="px-2">
        {editable ? (
          <div>
            <Input
              className="h-8 w-24 text-right"
              value={other}
              onChange={(e) => setOther(e.target.value)}
            />
            <Input
              className="mt-1 h-7 w-32"
              placeholder="Note"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        ) : (
          <Money value={item.otherDeductions} />
        )}
      </td>
      <td className="px-2 font-semibold">
        <Money value={item.netPayable} />
      </td>
      <td className="px-2">
        <Money value={item.paidAmount} />
      </td>
      <td className="px-2">
        {editable ? (
          <Button size="sm" variant="outline" disabled={saving} onClick={() => void save()}>
            {saving ? '…' : 'Save'}
          </Button>
        ) : null}
        {unpaid ? (
          <Button size="sm" variant="outline" disabled={saving} onClick={() => void pay()}>
            {saving ? '…' : 'Pay'}
          </Button>
        ) : null}
      </td>
    </tr>
  )
}
