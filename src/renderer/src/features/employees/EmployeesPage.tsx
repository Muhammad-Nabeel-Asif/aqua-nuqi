import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { DateText } from '@renderer/components/DateText'
import { Money } from '@renderer/components/Money'
import { PageHeader } from '@renderer/components/PageHeader'
import { toast } from '@renderer/components/Toast'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { api } from '@renderer/lib/api'
import type { EmployeeRole, SalaryType } from '@shared/contracts'
import { todayBusinessDate } from '@shared/date'
import { AppError } from '@shared/errors'
import { toPaisa } from '@shared/money'

const ROLES: EmployeeRole[] = ['delivery', 'plant', 'admin', 'other']
const SALARY_TYPES: SalaryType[] = [
  'monthly',
  'daily',
  'monthly_plus_commission',
  'commission_only',
]

export function EmployeesPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const parentRef = useRef<HTMLDivElement>(null)
  const [search, setSearch] = useState('')
  const [role, setRole] = useState<EmployeeRole | ''>('')
  const [status, setStatus] = useState<'active' | 'inactive' | 'all'>('active')
  const [formOpen, setFormOpen] = useState(false)
  const query = useQuery({
    queryKey: ['employees', { search, role, status }],
    queryFn: () =>
      api.employees.list({
        search: search.trim() || undefined,
        role: role || undefined,
        status,
      }),
  })
  const rows = query.data?.items ?? []
  const virtual = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 48,
    overscan: 10,
  })

  return (
    <div>
      <PageHeader
        title="Employees"
        subtitle={`${query.data?.total ?? 0} employees`}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to="/employees/attendance">Attendance</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/employees/advances">Advances</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/payroll">Payroll</Link>
            </Button>
            <Button onClick={() => setFormOpen(true)}>New employee</Button>
          </>
        }
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <Input
          className="w-64"
          placeholder="Search name, code or phone…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select
          value={role}
          onChange={(value) => setRole(value as EmployeeRole | '')}
          placeholder="All roles"
          options={ROLES.map((x) => [x, x])}
        />
        <Select
          value={status}
          onChange={(value) => setStatus(value as 'active' | 'inactive' | 'all')}
          placeholder="Status"
          options={[
            ['active', 'Active'],
            ['inactive', 'Inactive'],
            ['all', 'All statuses'],
          ]}
        />
      </div>
      <div className="overflow-hidden rounded-lg border bg-white">
        <div className="grid grid-cols-[90px_1.4fr_100px_100px_110px_120px_100px] border-b bg-sky-50 text-xs font-semibold text-slate-600">
          {[
            'Code',
            'Name / role',
            'Phone',
            'Joined',
            'Salary',
            'Outstanding advance',
            'Status',
          ].map((label) => (
            <div key={label} className="px-3 py-3">
              {label}
            </div>
          ))}
        </div>
        <div
          ref={parentRef}
          className="h-[calc(100vh-290px)] overflow-auto"
          style={{ contain: 'strict' }}
        >
          {query.isLoading ? (
            <div className="space-y-2 p-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-10 animate-pulse rounded bg-slate-100" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">No employees found.</p>
          ) : (
            <div style={{ height: virtual.getTotalSize(), position: 'relative' }}>
              {virtual.getVirtualItems().map((v) => {
                const employee = rows[v.index]!
                return (
                  <button
                    key={employee.id}
                    type="button"
                    onClick={() => navigate(`/employees/${employee.id}`)}
                    className="absolute left-0 grid w-full grid-cols-[90px_1.4fr_100px_100px_110px_120px_100px] items-center border-b text-left text-sm hover:bg-sky-50"
                    style={{ height: v.size, transform: `translateY(${v.start}px)` }}
                  >
                    <span className="px-3 font-medium text-sky-700">{employee.code}</span>
                    <span className="px-3">
                      <span className="block font-medium">{employee.name}</span>
                      <span className="text-xs capitalize text-muted-foreground">
                        {employee.role}
                      </span>
                    </span>
                    <span className="truncate px-3">{employee.phone ?? '—'}</span>
                    <span className="px-3">
                      {employee.joiningDate ? <DateText value={employee.joiningDate} /> : '—'}
                    </span>
                    <span className="px-3 tabular-nums">
                      <Money value={employee.currentSalary?.baseAmount ?? 0} />
                    </span>
                    <span className="px-3 tabular-nums">
                      <Money value={employee.outstandingAdvances} />
                    </span>
                    <span className="px-3 capitalize">{employee.status}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
      {formOpen ? (
        <EmployeeForm
          onClose={() => setFormOpen(false)}
          onSaved={async () => {
            setFormOpen(false)
            await qc.invalidateQueries({ queryKey: ['employees'] })
          }}
        />
      ) : null}
    </div>
  )
}

function EmployeeForm({
  onClose,
  onSaved,
}: {
  onClose: () => void
  onSaved: () => void | Promise<void>
}) {
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [phone, setPhone] = useState('')
  const [cnic, setCnic] = useState('')
  const [role, setRole] = useState<EmployeeRole>('delivery')
  const [joiningDate, setJoiningDate] = useState(todayBusinessDate())
  const [salaryType, setSalaryType] = useState<SalaryType>('monthly')
  const [baseAmount, setBaseAmount] = useState('')
  const [commission, setCommission] = useState('')
  const [overtimeRate, setOvertimeRate] = useState('')
  const [busy, setBusy] = useState(false)

  async function peekCode() {
    try {
      const result = await api.employees.nextCode()
      setCode(result.code)
    } catch (err) {
      toast({
        title: err instanceof AppError ? err.message : 'Could not get next code',
        variant: 'error',
      })
    }
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return toast({ title: 'Employee name is required', variant: 'error' })
    try {
      setBusy(true)
      await api.employees.create({
        name: name.trim(),
        code: code.trim() || undefined,
        phone: phone.trim() || null,
        cnic: cnic.trim() || null,
        role,
        joiningDate: joiningDate || null,
        salaryType,
        baseAmount: Number(toPaisa(baseAmount || '0')),
        commissionPerBottle: Number(toPaisa(commission || '0')),
        overtimeHourlyRate: Number(toPaisa(overtimeRate || '0')),
        salaryEffectiveFrom: joiningDate || undefined,
      })
      toast({ title: 'Employee created', variant: 'success' })
      await onSaved()
    } catch (err) {
      toast({
        title: err instanceof AppError ? err.message : 'Could not create employee',
        variant: 'error',
      })
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form
        onSubmit={submit}
        className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-lg bg-white p-5 shadow-xl"
      >
        <h2 className="text-lg font-semibold">New employee</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </Field>
          <Field label="Code (optional)">
            <div className="flex gap-2">
              <Input value={code} onChange={(e) => setCode(e.target.value)} />
              <Button type="button" variant="outline" onClick={() => void peekCode()}>
                Peek
              </Button>
            </div>
          </Field>
          <Field label="Phone">
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
          <Field label="CNIC">
            <Input value={cnic} onChange={(e) => setCnic(e.target.value)} />
          </Field>
          <Field label="Role">
            <Select
              value={role}
              onChange={(v) => setRole(v as EmployeeRole)}
              options={ROLES.map((x) => [x, x])}
              placeholder="Role"
            />
          </Field>
          <Field label="Joining date">
            <Input
              type="date"
              value={joiningDate}
              onChange={(e) => setJoiningDate(e.target.value)}
            />
          </Field>
          <Field label="Salary type">
            <Select
              value={salaryType}
              onChange={(v) => setSalaryType(v as SalaryType)}
              options={SALARY_TYPES.map((x) => [x, x.replaceAll('_', ' ')])}
              placeholder="Salary type"
            />
          </Field>
          <Field label="Base amount (Rs)">
            <Input
              inputMode="decimal"
              value={baseAmount}
              onChange={(e) => setBaseAmount(e.target.value)}
              placeholder="0"
            />
          </Field>
          <Field label="Commission / bottle (Rs)">
            <Input
              inputMode="decimal"
              value={commission}
              onChange={(e) => setCommission(e.target.value)}
              placeholder="0"
            />
          </Field>
          <Field label="OT rate / hour (Rs)">
            <Input
              inputMode="decimal"
              value={overtimeRate}
              onChange={(e) => setOvertimeRate(e.target.value)}
              placeholder="0"
            />
          </Field>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={busy}>{busy ? 'Saving…' : 'Create employee'}</Button>
        </div>
      </form>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-1.5 text-sm">
      <span className="block text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}
function Select({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string
  onChange: (value: string) => void
  options: Array<[string, string]>
  placeholder: string
}) {
  return (
    <select
      className="flex h-10 w-full rounded-md border bg-white px-2 text-sm"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">{placeholder}</option>
      {options.map(([value, label]) => (
        <option key={value} value={value}>
          {label}
        </option>
      ))}
    </select>
  )
}
