import { useEffect, useState } from 'react'
import { toast } from '@renderer/components/Toast'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { api } from '@renderer/lib/api'
import type { AreaDto, CreateCustomerInput, CustomerDto, RouteDto } from '@shared/contracts'
import { toPaisa } from '@shared/money'

type CustomerFormState = {
  name: string
  customerType: CreateCustomerInput['customerType']
  phonePrimary: string
  phoneSecondary: string
  whatsappNumber: string
  email: string
  addressLine: string
  landmark: string
  areaId: string
  routeId: string
  billingMode: CreateCustomerInput['billingMode']
  rate: string
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
    phonePrimary: customer?.phonePrimary ?? '',
    phoneSecondary: customer?.phoneSecondary ?? '',
    whatsappNumber: customer?.whatsappNumber ?? '',
    email: customer?.email ?? '',
    addressLine: customer?.addressLine ?? '',
    landmark: customer?.landmark ?? '',
    areaId: customer?.areaId == null ? '' : String(customer.areaId),
    routeId: customer?.routeId == null ? '' : String(customer.routeId),
    billingMode: customer?.billingMode ?? 'per_bottle',
    rate: '',
    securityDepositHeld: String(customer?.securityDepositHeld ?? 0),
    openingBottles: String(customer?.openingBottles ?? 0),
    openingBalance: String(customer?.openingBalance ? customer.openingBalance / 100 : 0),
    openingAsOf: customer?.openingAsOf ?? new Date().toISOString().slice(0, 10),
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
  function set(key: string, value: unknown) {
    setForm((v) => ({ ...v, [key]: value }) as CustomerFormState)
  }
  async function save() {
    try {
      const {
        rate,
        securityDepositHeld,
        openingBottles,
        openingBalance,
        scheduleEnabled,
        scheduleMode,
        scheduleWeekdays,
        scheduleIntervalDays,
        scheduleDefaultQty,
        ...textFields
      } = form
      const input: CreateCustomerInput = {
        ...textFields,
        code,
        areaId: form.areaId ? Number(form.areaId) : null,
        routeId: form.routeId ? Number(form.routeId) : null,
        securityDepositHeld: toPaisa(securityDepositHeld || 0),
        openingBalance: toPaisa(openingBalance || 0),
        openingBottles: Number(openingBottles || 0),
        ...(rate ? { rate: toPaisa(rate) } : {}),
        schedule: scheduleEnabled
          ? {
              mode: scheduleMode,
              weekdays: scheduleMode === 'weekdays' ? scheduleWeekdays : null,
              intervalDays:
                scheduleMode === 'interval_days' ? Number(scheduleIntervalDays || 1) : null,
              defaultQty: Number(scheduleDefaultQty || 1),
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
        description: e instanceof Error ? e.message : 'Error',
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
            onChange={(v) => set('customerType', v)}
            options={['residential', 'commercial', 'walk_in']}
          />
        </Section>
        <Section title="Contact">
          <Field
            label="Primary phone"
            value={form.phonePrimary}
            onChange={(v) => {
              set('phonePrimary', v)
              if (!form.whatsappNumber) set('whatsappNumber', v)
            }}
          />
          <Field
            label="WhatsApp"
            value={form.whatsappNumber}
            onChange={(v) => set('whatsappNumber', v)}
          />
          <Field
            label="Secondary phone"
            value={form.phoneSecondary}
            onChange={(v) => set('phoneSecondary', v)}
          />
          <Field label="Email" value={form.email} onChange={(v) => set('email', v)} />
          <Field label="Address" value={form.addressLine} onChange={(v) => set('addressLine', v)} />
          <Field label="Landmark" value={form.landmark} onChange={(v) => set('landmark', v)} />
        </Section>
        <Section title="Billing">
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
          <Select
            label="Billing mode"
            value={form.billingMode}
            onChange={(v) => set('billingMode', v)}
            options={['per_bottle', 'monthly_package']}
          />
          {!editing && (
            <Field
              label="Rate (Rs)"
              value={form.rate}
              onChange={(v) => set('rate', v)}
              type="number"
            />
          )}
        </Section>
        <Section title="Opening balances">
          <Field
            label="Security deposit (Rs)"
            value={form.securityDepositHeld}
            onChange={(v) => set('securityDepositHeld', v)}
            type="number"
            disabled={openingsLocked}
          />
          <Field
            label="Opening bottles"
            value={form.openingBottles}
            onChange={(v) => set('openingBottles', v)}
            type="number"
            disabled={openingsLocked}
          />
          <Field
            label="Opening balance (Rs)"
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
}: {
  label: string
  value: string | number | null | undefined
  onChange: (v: string) => void
  type?: string
  disabled?: boolean
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
