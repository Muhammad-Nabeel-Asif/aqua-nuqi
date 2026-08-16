import { useEffect, useState } from 'react'
import { toast } from '@renderer/components/Toast'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { api } from '@renderer/lib/api'
import { formatAppError } from '@renderer/lib/app-error-message'
import {
  BILLING_MODE_LABEL,
  CUSTOMER_STATUS_LABEL,
  CUSTOMER_TYPE_LABEL,
} from '@renderer/lib/plain-labels'
import type { AreaDto, CreateCustomerInput, CustomerDto, RouteDto } from '@shared/contracts'
import { todayBusinessDate } from '@shared/date'
import { toPaisa } from '@shared/money'

type CustomerFormState = {
  name: string
  customerType: CreateCustomerInput['customerType']
  joinedOn: string
  status: NonNullable<CreateCustomerInput['status']>
  phonePrimary: string
  phoneSecondary: string
  whatsappNumber: string
  email: string
  addressLine: string
  landmark: string
  areaId: string
  routeId: string
  deliveryNotes: string
  billingMode: CreateCustomerInput['billingMode']
  rate: string
  packageAmount: string
  packageIncludedQty: string
  packageExcessRate: string
  billingDay: string
  creditLimit: string
  securityDepositHeld: string
  openingBottles: string
  openingBalance: string
  openingAsOf: string
  notes: string
  scheduleEnabled: boolean
  scheduleMode: 'weekdays' | 'interval_days' | 'on_call'
  scheduleWeekdays: string
  scheduleIntervalDays: string
  scheduleDefaultQty: string
}

export function CustomerFormDialog({
  customer,
  onClose,
  onSaved,
  openingsLocked = false,
}: {
  customer?: CustomerDto
  onClose: () => void
  onSaved: () => void
  openingsLocked?: boolean
}) {
  const editing = Boolean(customer)
  const [areas, setAreas] = useState<AreaDto[]>([])
  const [routes, setRoutes] = useState<RouteDto[]>([])
  const [code, setCode] = useState(customer?.code ?? '')
  const [form, setForm] = useState<CustomerFormState>({
    name: customer?.name ?? '',
    customerType: customer?.customerType ?? 'residential',
    joinedOn: customer?.joinedOn ?? todayBusinessDate(),
    status: customer?.status ?? 'active',
    phonePrimary: customer?.phonePrimary ?? '',
    phoneSecondary: customer?.phoneSecondary ?? '',
    whatsappNumber: customer?.whatsappNumber ?? '',
    email: customer?.email ?? '',
    addressLine: customer?.addressLine ?? '',
    landmark: customer?.landmark ?? '',
    areaId: customer?.areaId == null ? '' : String(customer.areaId),
    routeId: customer?.routeId == null ? '' : String(customer.routeId),
    deliveryNotes: customer?.deliveryNotes ?? '',
    billingMode: customer?.billingMode ?? 'per_bottle',
    rate: customer?.currentRate != null ? String(customer.currentRate / 100) : '',
    packageAmount: customer?.packageAmount != null ? String(customer.packageAmount / 100) : '',
    packageIncludedQty:
      customer?.packageIncludedQty != null ? String(customer.packageIncludedQty) : '',
    packageExcessRate:
      customer?.packageExcessRate != null ? String(customer.packageExcessRate / 100) : '',
    billingDay: customer?.billingDay != null ? String(customer.billingDay) : '',
    creditLimit: customer?.creditLimit != null ? String(customer.creditLimit / 100) : '',
    securityDepositHeld: String((customer?.securityDepositHeld ?? 0) / 100),
    openingBottles: String(customer?.openingBottles ?? 0),
    openingBalance: String(customer?.openingBalance ? customer.openingBalance / 100 : 0),
    openingAsOf: customer?.openingAsOf ?? todayBusinessDate(),
    notes: customer?.notes ?? '',
    scheduleEnabled: Boolean(customer?.schedule),
    scheduleMode: customer?.schedule?.mode ?? 'weekdays',
    scheduleWeekdays: customer?.schedule?.weekdays ?? '1,4',
    scheduleIntervalDays: String(customer?.schedule?.intervalDays ?? 3),
    scheduleDefaultQty: String(customer?.schedule?.defaultQty ?? 1),
  })
  useEffect(() => {
    void Promise.all([api.areas.list(), api.routes.list()]).then(([a, r]) => {
      setAreas(a.items)
      setRoutes(r.items)
    })
    if (!editing) void api.customers.nextCode().then((r) => setCode(r.code))
  }, [editing])
  function set<K extends keyof CustomerFormState>(key: K, value: CustomerFormState[K]) {
    setForm((v) => ({ ...v, [key]: value }))
  }
  async function save() {
    try {
      const input: CreateCustomerInput = {
        name: form.name,
        code,
        customerType: form.customerType,
        joinedOn: form.joinedOn || null,
        status: form.status,
        phonePrimary: form.phonePrimary || null,
        phoneSecondary: form.phoneSecondary || null,
        whatsappNumber: form.whatsappNumber || null,
        email: form.email || null,
        addressLine: form.addressLine || null,
        landmark: form.landmark || null,
        areaId: form.areaId ? Number(form.areaId) : null,
        routeId: form.routeId ? Number(form.routeId) : null,
        deliveryNotes: form.deliveryNotes || null,
        billingMode: form.billingMode,
        packageAmount:
          form.billingMode === 'monthly_package' ? toPaisa(form.packageAmount || 0) : null,
        packageIncludedQty:
          form.billingMode === 'monthly_package' ? Number(form.packageIncludedQty || 0) : null,
        packageExcessRate:
          form.billingMode === 'monthly_package' ? toPaisa(form.packageExcessRate || 0) : null,
        billingDay: form.billingDay ? Number(form.billingDay) : null,
        creditLimit: form.creditLimit ? toPaisa(form.creditLimit) : null,
        securityDepositHeld: toPaisa(form.securityDepositHeld || 0),
        openingBalance: toPaisa(form.openingBalance || 0),
        openingBottles: Number(form.openingBottles || 0),
        openingAsOf: form.openingAsOf || null,
        notes: form.notes || null,
        ...(form.rate && !editing ? { rate: toPaisa(form.rate) } : {}),
        schedule: form.scheduleEnabled
          ? {
              mode: form.scheduleMode,
              weekdays: form.scheduleMode === 'weekdays' ? form.scheduleWeekdays : null,
              intervalDays:
                form.scheduleMode === 'interval_days'
                  ? Number(form.scheduleIntervalDays || 1)
                  : null,
              defaultQty: Number(form.scheduleDefaultQty || 1),
            }
          : null,
      }
      if (form.phonePrimary && !form.whatsappNumber) input.whatsappNumber = form.phonePrimary
      if (editing && customer) await api.customers.update({ ...input, id: customer.id })
      else await api.customers.create(input)
      toast({ title: editing ? 'Customer updated' : 'Customer created', variant: 'success' })
      onSaved()
    } catch (e) {
      toast({
        title: 'Could not save customer',
        description: formatAppError(e, 'Could not save customer'),
        variant: 'error',
      })
    }
  }
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-lg border bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex justify-between">
          <h2 className="text-lg font-semibold">{editing ? 'Edit customer' : 'New customer'}</h2>
          <button onClick={onClose}>✕</button>
        </div>
        <Section title="Identity">
          <Field label="Code" value={code} onChange={setCode} disabled={editing} />
          <Field label="Name" value={form.name} onChange={(v) => set('name', v)} />
          <Select
            label="Type"
            value={form.customerType}
            onChange={(v) => set('customerType', v as CustomerFormState['customerType'])}
            options={Object.entries(CUSTOMER_TYPE_LABEL).map(([code, label]) => `${code}:${label}`)}
          />
          <Field
            label="Joining date"
            value={form.joinedOn}
            onChange={(v) => set('joinedOn', v)}
            type="date"
          />
          <Select
            label="Status"
            value={form.status}
            onChange={(v) => set('status', v as CustomerFormState['status'])}
            options={Object.entries(CUSTOMER_STATUS_LABEL).map(
              ([code, label]) => `${code}:${label}`,
            )}
          />
        </Section>
        <Section title="Contact">
          <Field
            label="Primary phone"
            value={form.phonePrimary}
            onChange={(v) => {
              set('phonePrimary', v)
            }}
          />
          <Field
            label="WhatsApp"
            value={form.whatsappNumber}
            onChange={(v) => set('whatsappNumber', v)}
            hint="Leave blank to use the primary phone"
          />
          <Field
            label="Secondary phone"
            value={form.phoneSecondary}
            onChange={(v) => set('phoneSecondary', v)}
          />
          <Field label="Email" value={form.email} onChange={(v) => set('email', v)} />
          <Field label="Address" value={form.addressLine} onChange={(v) => set('addressLine', v)} />
          <Field label="Landmark" value={form.landmark} onChange={(v) => set('landmark', v)} />
          <Select
            label="Area"
            value={form.areaId}
            onChange={(v) => set('areaId', v)}
            options={areas.map((a) => `${a.id}:${a.name}`)}
          />
          <Select
            label="Route"
            value={form.routeId}
            onChange={(v) => set('routeId', v)}
            options={routes
              .filter((r) => !form.areaId || r.areaId === Number(form.areaId))
              .map((r) => `${r.id}:${r.name}`)}
          />
          <Field
            label="Delivery notes"
            value={form.deliveryNotes}
            onChange={(v) => set('deliveryNotes', v)}
          />
        </Section>
        <Section title="Billing">
          <Select
            label="Billing mode"
            value={form.billingMode}
            onChange={(v) => set('billingMode', v as CustomerFormState['billingMode'])}
            options={Object.entries(BILLING_MODE_LABEL).map(([code, label]) => `${code}:${label}`)}
          />
          {form.billingMode === 'per_bottle' ? (
            !editing ? (
              <Field
                label="Rate (Rs)"
                value={form.rate}
                onChange={(v) => set('rate', v)}
                type="number"
              />
            ) : (
              <p className="text-sm text-muted-foreground sm:col-span-2">
                Change the per-bottle rate from the customer detail page (keeps history).
              </p>
            )
          ) : (
            <>
              <Field
                label="Package amount (Rs)"
                value={form.packageAmount}
                onChange={(v) => set('packageAmount', v)}
                type="number"
              />
              <Field
                label="Included quantity"
                value={form.packageIncludedQty}
                onChange={(v) => set('packageIncludedQty', v)}
                type="number"
              />
              <Field
                label="Excess rate (Rs)"
                value={form.packageExcessRate}
                onChange={(v) => set('packageExcessRate', v)}
                type="number"
              />
            </>
          )}
          <Field
            label="Billing day (1–28)"
            value={form.billingDay}
            onChange={(v) => set('billingDay', v)}
            type="number"
          />
          <Field
            label="Credit limit (Rs)"
            value={form.creditLimit}
            onChange={(v) => set('creditLimit', v)}
            type="number"
          />
        </Section>
        <Section title="Starting figures">
          <Field
            label="Security deposit (Rs)"
            value={form.securityDepositHeld}
            onChange={(v) => set('securityDepositHeld', v)}
            type="number"
            disabled={openingsLocked}
          />
          <Field
            label="Bottles already with them"
            value={form.openingBottles}
            onChange={(v) => set('openingBottles', v)}
            type="number"
            disabled={openingsLocked}
          />
          <Field
            label="Money they already owed (Rs)"
            value={form.openingBalance}
            onChange={(v) => set('openingBalance', v)}
            type="number"
            disabled={openingsLocked}
          />
          <Field
            label="As of"
            value={form.openingAsOf}
            onChange={(v) => set('openingAsOf', v)}
            type="date"
            disabled={openingsLocked}
          />
          {openingsLocked ? (
            <p className="text-xs text-muted-foreground sm:col-span-2">
              Openings are locked after the customer has invoices or payments.
            </p>
          ) : null}
        </Section>
        <Section title="Delivery schedule (optional)">
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              checked={form.scheduleEnabled}
              onChange={(e) => set('scheduleEnabled', e.target.checked)}
            />
            Enable schedule (used by Phase 2 daily list)
          </label>
          {form.scheduleEnabled ? (
            <>
              <Select
                label="Mode"
                value={form.scheduleMode}
                onChange={(v) => set('scheduleMode', v as CustomerFormState['scheduleMode'])}
                options={['weekdays', 'interval_days', 'on_call']}
              />
              {form.scheduleMode === 'weekdays' ? (
                <Field
                  label="Weekdays (1=Mon … 7=Sun, CSV)"
                  value={form.scheduleWeekdays}
                  onChange={(v) => set('scheduleWeekdays', v)}
                />
              ) : null}
              {form.scheduleMode === 'interval_days' ? (
                <Field
                  label="Every N days"
                  value={form.scheduleIntervalDays}
                  onChange={(v) => set('scheduleIntervalDays', v)}
                  type="number"
                />
              ) : null}
              <Field
                label="Default quantity"
                value={form.scheduleDefaultQty}
                onChange={(v) => set('scheduleDefaultQty', v)}
                type="number"
              />
            </>
          ) : null}
        </Section>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void save()}>Save customer</Button>
        </div>
      </div>
    </div>
  )
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-5 rounded border p-4">
      <h3 className="mb-3 font-semibold text-sky-700">{title}</h3>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </section>
  )
}
function Field({
  label,
  value,
  onChange,
  type = 'text',
  disabled,
  hint,
}: {
  label: string
  value: string | number | null | undefined
  onChange: (v: string) => void
  type?: string
  disabled?: boolean
  hint?: string
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input
        type={type}
        value={value ?? ''}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}
function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string | number | null | undefined
  onChange: (v: string) => void
  options: string[]
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <select
        className="h-9 w-full rounded-md border px-3 text-sm"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">None</option>
        {options.map((o) => {
          const [id, name] = o.includes(':') ? o.split(':') : [o, o]
          return (
            <option key={o} value={o.includes(':') ? id : o}>
              {name}
            </option>
          )
        })}
      </select>
    </div>
  )
}
