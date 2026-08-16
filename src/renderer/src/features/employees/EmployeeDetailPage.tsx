import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { confirmDialog, promptDialog } from '@renderer/components/ConfirmDialog'
import { DateText } from '@renderer/components/DateText'
import { Money } from '@renderer/components/Money'
import { PageHeader } from '@renderer/components/PageHeader'
import { toast } from '@renderer/components/Toast'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@renderer/components/ui/tabs'
import { api } from '@renderer/lib/api'
import type { EmployeeDto, SalaryType } from '@shared/contracts'
import { todayBusinessDate } from '@shared/date'
import { AppError } from '@shared/errors'
import { formatMoney, paisaToDecimalString, toPaisa, type Paisa } from '@shared/money'

const salaryTypes: SalaryType[] = ['monthly', 'daily', 'monthly_plus_commission', 'commission_only']

export function EmployeeDetailPage() {
  const id = Number(useParams().id)
  const qc = useQueryClient()
  const employeeQ = useQuery({
    queryKey: ['employee', id],
    queryFn: () => api.employees.get(id),
    enabled: Number.isFinite(id) && id > 0,
  })
  const advancesQ = useQuery({
    queryKey: ['advances', id],
    queryFn: () => api.advances.list({ employeeId: id, status: 'all' }),
    enabled: Boolean(employeeQ.data),
  })
  const payrollQ = useQuery({
    queryKey: ['employee', id, 'payroll'],
    queryFn: () => api.employees.payrollHistory(id),
    enabled: Boolean(employeeQ.data),
  })
  const performanceQ = useQuery({
    queryKey: ['employee', id, 'performance'],
    queryFn: () => api.employees.performance(id),
    enabled: Boolean(employeeQ.data),
  })
  const [advanceOpen, setAdvanceOpen] = useState(false)
  const [salaryOpen, setSalaryOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const employee = employeeQ.data?.item
  if (employeeQ.isLoading) return <div className="p-8">Loading…</div>
  if (!employee) return <div className="p-8 text-red-700">Employee not found.</div>

  async function deactivate(name: string, outstandingAdvances: number) {
    const warning =
      outstandingAdvances > 0
        ? ` This employee has outstanding advances of ${formatMoney(outstandingAdvances as Paisa)}.`
        : ''
    const leavingDate = await promptDialog({
      title: `Deactivate ${name}?`,
      description: warning.trim() || 'This person will no longer appear on daily routes.',
      label: 'Leaving date (YYYY-MM-DD)',
      defaultValue: todayBusinessDate(),
      confirmLabel: 'Continue',
    })
    if (!leavingDate) return
    const ok = await confirmDialog({
      title: `Deactivate ${name}?`,
      description: warning.trim() || undefined,
      confirmLabel: 'Deactivate',
      danger: true,
    })
    if (!ok) return
    try {
      const result = await api.employees.setStatus({ id, status: 'inactive', leavingDate })
      toast({
        title: 'Employee deactivated',
        description: result.warning ?? undefined,
        variant: 'success',
      })
      await qc.invalidateQueries({ queryKey: ['employee', id] })
      await qc.invalidateQueries({ queryKey: ['employees'] })
    } catch (err) {
      toast({
        title: err instanceof AppError ? err.message : 'Could not deactivate employee',
        variant: 'error',
      })
    }
  }

  return (
    <div>
      <PageHeader
        title={`${employee.code} — ${employee.name}`}
        subtitle={`${employee.role} · ${employee.phone ?? 'No phone'} · ${employee.status}`}
        actions={
          <>
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              Edit name / phone
            </Button>
            <Button
              variant="destructive"
              disabled={employee.status === 'inactive'}
              onClick={() => void deactivate(employee.name, employee.outstandingAdvances)}
            >
              Deactivate
            </Button>
          </>
        }
      />
      <Tabs defaultValue="overview" className="mt-4">
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
          <TabsTrigger value="advances">Advances</TabsTrigger>
          <TabsTrigger value="salary">Salary history</TabsTrigger>
          <TabsTrigger value="payroll">Monthly salaries</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <div className="grid gap-4 md:grid-cols-2">
            <Panel title="Profile">
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <dt className="text-muted-foreground">Role</dt>
                <dd className="capitalize">{employee.role}</dd>
                <dt className="text-muted-foreground">Phone</dt>
                <dd>{employee.phone ?? '—'}</dd>
                <dt className="text-muted-foreground">CNIC</dt>
                <dd>{employee.cnic ?? '—'}</dd>
                <dt className="text-muted-foreground">Joining date</dt>
                <dd>{employee.joiningDate ? <DateText value={employee.joiningDate} /> : '—'}</dd>
                <dt className="text-muted-foreground">Leaving date</dt>
                <dd>{employee.leavingDate ? <DateText value={employee.leavingDate} /> : '—'}</dd>
              </dl>
            </Panel>
            <Panel title="Current compensation">
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <dt className="text-muted-foreground">Salary type</dt>
                <dd className="capitalize">
                  {employee.currentSalary?.salaryType.replaceAll('_', ' ') ?? '—'}
                </dd>
                <dt className="text-muted-foreground">Base amount</dt>
                <dd>
                  <Money value={employee.currentSalary?.baseAmount ?? 0} />
                </dd>
                <dt className="text-muted-foreground">Commission / bottle</dt>
                <dd>
                  <Money value={employee.currentSalary?.commissionPerBottle ?? 0} />
                </dd>
                <dt className="text-muted-foreground">OT rate / hour</dt>
                <dd>
                  <Money value={employee.currentSalary?.overtimeHourlyRate ?? 0} />
                </dd>
                <dt className="text-muted-foreground">Outstanding advances</dt>
                <dd>
                  <Money value={employee.outstandingAdvances} />
                </dd>
              </dl>
            </Panel>
          </div>
        </TabsContent>
        <TabsContent value="attendance">
          <EmployeeAttendanceStrip employeeId={id} />
        </TabsContent>
        <TabsContent value="advances">
          <Panel
            title="Salary advances"
            action={
              <Button size="sm" onClick={() => setAdvanceOpen(true)}>
                Add advance
              </Button>
            }
          >
            <p className="mb-3 text-sm">
              Outstanding: <Money value={advancesQ.data?.outstandingTotal ?? 0} />
            </p>
            <HistoryTable
              headers={['Date', 'Amount', 'Reason', 'Status']}
              rows={(advancesQ.data?.items ?? []).map((a) => [
                <DateText key="date" value={a.advanceDate} />,
                <Money key="amount" value={a.amount} />,
                a.reason ?? '—',
                a.status,
              ])}
            />
          </Panel>
        </TabsContent>
        <TabsContent value="salary">
          <Panel
            title="Salary history"
            action={
              <Button size="sm" onClick={() => setSalaryOpen(true)}>
                Change salary
              </Button>
            }
          >
            <HistoryTable
              headers={['Type', 'Base', 'Commission', 'OT rate', 'From', 'To', 'Reason']}
              rows={(employeeQ.data?.salaryHistory ?? []).map((s) => [
                s.salaryType.replaceAll('_', ' '),
                <Money key="base" value={s.baseAmount} />,
                <Money key="commission" value={s.commissionPerBottle} />,
                <Money key="ot" value={s.overtimeHourlyRate} />,
                <DateText key="from" value={s.effectiveFrom} />,
                s.effectiveTo ? <DateText key="to" value={s.effectiveTo} /> : 'Current',
                s.reason ?? '—',
              ])}
            />
          </Panel>
        </TabsContent>
        <TabsContent value="payroll">
          <Panel title="Monthly salaries">
            <HistoryTable
              headers={['Period', 'Status', 'Net payable', 'Paid']}
              rows={(payrollQ.data?.items ?? []).map((r) => [
                r.period,
                r.status,
                <Money key="net" value={r.netPayable} />,
                <Money key="paid" value={r.paidAmount} />,
              ])}
            />
          </Panel>
        </TabsContent>
        <TabsContent value="performance">
          <Performance trend={performanceQ.data?.trend ?? []} />
        </TabsContent>
      </Tabs>
      {advanceOpen ? (
        <AdvanceForm
          employeeId={id}
          onClose={() => setAdvanceOpen(false)}
          onSaved={async () => {
            setAdvanceOpen(false)
            await qc.invalidateQueries({ queryKey: ['advances', id] })
            await qc.invalidateQueries({ queryKey: ['employee', id] })
          }}
        />
      ) : null}
      {salaryOpen ? (
        <SalaryForm
          employeeId={id}
          current={employee.currentSalary}
          onClose={() => setSalaryOpen(false)}
          onSaved={async () => {
            setSalaryOpen(false)
            await qc.invalidateQueries({ queryKey: ['employee', id] })
          }}
        />
      ) : null}
      {editOpen ? (
        <EditProfile
          employee={employee}
          onClose={() => setEditOpen(false)}
          onSaved={async () => {
            setEditOpen(false)
            await qc.invalidateQueries({ queryKey: ['employee', id] })
            await qc.invalidateQueries({ queryKey: ['employees'] })
          }}
        />
      ) : null}
    </div>
  )
}

function EditProfile({
  employee,
  onClose,
  onSaved,
}: {
  employee: EmployeeDto
  onClose: () => void
  onSaved: () => void | Promise<void>
}) {
  const [name, setName] = useState(employee.name)
  const [phone, setPhone] = useState(employee.phone ?? '')
  const [busy, setBusy] = useState(false)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    try {
      setBusy(true)
      await api.employees.update({
        id: employee.id,
        name: name.trim(),
        phone: phone.trim() || null,
      })
      toast({ title: 'Employee updated', variant: 'success' })
      await onSaved()
    } catch (err) {
      toast({
        title: err instanceof AppError ? err.message : 'Could not update employee',
        variant: 'error',
      })
    } finally {
      setBusy(false)
    }
  }

  async function pickPhoto() {
    const picked = await api.dialog.pickFile({
      title: 'Choose a photo',
      filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp'] }],
    })
    if (!picked.path) return
    try {
      setBusy(true)
      await api.employees.uploadPhoto(picked.path, employee.id)
      toast({ title: 'Photo saved', variant: 'success' })
      await onSaved()
    } catch (err) {
      toast({
        title: err instanceof AppError ? err.message : 'Could not save photo',
        variant: 'error',
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="Edit name / phone" onClose={onClose}>
      <form className="space-y-3" onSubmit={(e) => void save(e)}>
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Phone">
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <Button type="button" variant="outline" disabled={busy} onClick={() => void pickPhoto()}>
          {employee.photoPath ? 'Replace photo' : 'Add photo'}
        </Button>
        <Actions onClose={onClose} busy={busy} label="Save" />
      </form>
    </Modal>
  )
}

function EmployeeAttendanceStrip({ employeeId }: { employeeId: number }) {
  const period = todayBusinessDate().slice(0, 7)
  const monthQ = useQuery({
    queryKey: ['attendance', period, employeeId],
    queryFn: () => api.attendance.getMonth(period),
  })
  const row = monthQ.data?.rows.find((r) => r.employeeId === employeeId)
  const letters: Record<string, string> = {
    present: 'P',
    absent: 'A',
    half_day: 'H',
    paid_leave: 'L',
    unpaid_leave: 'U',
    holiday: 'O',
  }
  return (
    <Panel
      title={`Attendance — ${period}`}
      action={
        <Button size="sm" variant="outline" asChild>
          <Link to={`/employees/attendance?employeeId=${employeeId}`}>Open full grid</Link>
        </Button>
      }
    >
      {monthQ.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !row ? (
        <p className="text-sm text-muted-foreground">No attendance row for this employee.</p>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap gap-4 text-sm">
            <span>
              Present <strong>{row.present}</strong>
            </span>
            <span>
              Absent <strong>{row.absent}</strong>
            </span>
            <span>
              Half-days <strong>{row.halfDays}</strong>
            </span>
            <span>
              Leave <strong>{row.paidLeave + row.unpaidLeave}</strong>
            </span>
          </div>
          <div className="flex flex-wrap gap-1">
            {row.cells.map((cell) => (
              <span
                key={cell.date}
                title={`${cell.date}: ${cell.status ?? 'not set'}`}
                className="inline-flex h-7 w-7 items-center justify-center rounded bg-slate-100 text-xs font-bold text-slate-700"
              >
                {cell.status ? letters[cell.status] : '—'}
              </span>
            ))}
          </div>
        </>
      )}
    </Panel>
  )
}

function AdvanceForm({
  employeeId,
  onClose,
  onSaved,
}: {
  employeeId: number
  onClose: () => void
  onSaved: () => void | Promise<void>
}) {
  const [date, setDate] = useState(todayBusinessDate())
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    try {
      setBusy(true)
      await api.advances.create({
        employeeId,
        advanceDate: date,
        amount: Number(toPaisa(amount)),
        reason: reason || null,
        paymentMethod: 'cash',
      })
      toast({ title: 'Advance recorded', variant: 'success' })
      await onSaved()
    } catch (err) {
      toast({
        title: err instanceof AppError ? err.message : 'Could not record advance',
        variant: 'error',
      })
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal title="Add salary advance" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Date">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Amount (Rs)">
          <Input
            required
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>
        <Field label="Reason">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <Actions onClose={onClose} busy={busy} label="Record advance" />
      </form>
    </Modal>
  )
}
function SalaryForm({
  employeeId,
  current,
  onClose,
  onSaved,
}: {
  employeeId: number
  current: {
    salaryType: SalaryType
    baseAmount: number
    commissionPerBottle: number
    overtimeHourlyRate: number
  } | null
  onClose: () => void
  onSaved: () => void | Promise<void>
}) {
  const [type, setType] = useState<SalaryType>(current?.salaryType ?? 'monthly')
  const [base, setBase] = useState(paisaToDecimalString(current?.baseAmount ?? 0))
  const [commission, setCommission] = useState(
    paisaToDecimalString(current?.commissionPerBottle ?? 0),
  )
  const [ot, setOt] = useState(paisaToDecimalString(current?.overtimeHourlyRate ?? 0))
  const [from, setFrom] = useState(todayBusinessDate())
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    try {
      setBusy(true)
      const r = await api.employees.changeSalary({
        employeeId,
        salaryType: type,
        baseAmount: Number(toPaisa(base || '0')),
        commissionPerBottle: Number(toPaisa(commission || '0')),
        overtimeHourlyRate: Number(toPaisa(ot || '0')),
        effectiveFrom: from,
        reason: reason || null,
      })
      toast({ title: 'Salary changed', description: r.warning ?? undefined, variant: 'success' })
      await onSaved()
    } catch (err) {
      toast({
        title: err instanceof AppError ? err.message : 'Could not change salary',
        variant: 'error',
      })
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal title="Change salary" onClose={onClose}>
      <form onSubmit={submit} className="grid gap-3 md:grid-cols-2">
        <Field label="Salary type">
          <select
            className="flex h-10 w-full rounded-md border px-2 text-sm"
            value={type}
            onChange={(e) => setType(e.target.value as SalaryType)}
          >
            {salaryTypes.map((x) => (
              <option key={x} value={x}>
                {x.replaceAll('_', ' ')}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Effective from">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="Base amount (Rs)">
          <Input value={base} onChange={(e) => setBase(e.target.value)} />
        </Field>
        <Field label="Commission / bottle (Rs)">
          <Input value={commission} onChange={(e) => setCommission(e.target.value)} />
        </Field>
        <Field label="OT rate / hour (Rs)">
          <Input value={ot} onChange={(e) => setOt(e.target.value)} />
        </Field>
        <Field label="Reason">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <div className="md:col-span-2">
          <Actions onClose={onClose} busy={busy} label="Save salary" />
        </div>
      </form>
    </Modal>
  )
}
function Performance({
  trend,
}: {
  trend: Array<{
    period: string
    bottlesDelivered: number
    uniqueCustomers: number
    deliveriesCount: number
    attendancePercent: number
  }>
}) {
  const data = trend.map((x) => ({ ...x, period: x.period.slice(2) }))
  return (
    <Panel title="Delivery performance (last 12 months)">
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="period" />
            <YAxis />
            <Tooltip />
            <Bar dataKey="bottlesDelivered" name="Bottles" fill="#0284c7" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <HistoryTable
        headers={['Period', 'Bottles', 'Customers', 'Deliveries', 'Attendance']}
        rows={trend.map((x) => [
          x.period,
          x.bottlesDelivered,
          x.uniqueCustomers,
          x.deliveriesCount,
          `${x.attendancePercent}%`,
        ])}
      />
    </Panel>
  )
}
function Panel({
  title,
  action,
  children,
}: {
  title: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="rounded-lg border bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="font-semibold">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  )
}
function HistoryTable({ headers, rows }: { headers: string[]; rows: React.ReactNode[][] }) {
  return rows.length ? (
    <div className="overflow-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b text-muted-foreground">
            {headers.map((x) => (
              <th key={x} className="px-2 py-2 font-medium">
                {x}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, i) => (
            <tr key={i} className="border-b last:border-0">
              {cells.map((cell, j) => (
                <td key={j} className="whitespace-nowrap px-2 py-2">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <p className="text-sm text-muted-foreground">No records yet.</p>
  )
}
function Modal({
  title,
  onClose: _onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-lg bg-white p-5 shadow-xl">
        <h2 className="text-lg font-semibold">{title}</h2>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  )
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}
function Actions({ onClose, busy, label }: { onClose: () => void; busy: boolean; label: string }) {
  return (
    <div className="flex justify-end gap-2">
      <Button type="button" variant="outline" onClick={onClose}>
        Cancel
      </Button>
      <Button disabled={busy}>{busy ? 'Saving…' : label}</Button>
    </div>
  )
}
