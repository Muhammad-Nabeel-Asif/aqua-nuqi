import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { confirmDialog } from '@renderer/components/ConfirmDialog'
import { DateText } from '@renderer/components/DateText'
import { Money } from '@renderer/components/Money'
import { PageHeader } from '@renderer/components/PageHeader'
import { toast } from '@renderer/components/Toast'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@renderer/components/ui/tabs'
import { api } from '@renderer/lib/api'
import { todayBusinessDate, firstOfNextMonth } from '@shared/date'
import { AppError } from '@shared/errors'
import { toPaisa } from '@shared/money'
import { toWhatsAppE164 } from '@shared/phone'
import { CustomerCardView } from '../deliveries/CustomerCardView'
import { RecordPaymentDialog } from '../payments/RecordPaymentDialog'
import { CustomerFormDialog } from './CustomerFormDialog'

export function CustomerDetailPage() {
  const id = Number(useParams().id)
  const qc = useQueryClient()
  const [edit, setEdit] = useState(false)
  const [rateOpen, setRateOpen] = useState(false)
  const [payOpen, setPayOpen] = useState(false)
  const [chargeOpen, setChargeOpen] = useState(false)
  const q = useQuery({ queryKey: ['customer', id], queryFn: () => api.customers.get(id) })
  const c = q.data?.item
  if (!c) return <div className="p-8">Loading…</div>
  const customer = c
  async function deactivate() {
    const warnings: string[] = []
    if (customer.balance > 0) warnings.push(`outstanding balance`)
    if (customer.bottlesWithCustomer > 0)
      warnings.push(`holds ${customer.bottlesWithCustomer} bottles`)
    const reason = window.prompt(
      warnings.length
        ? `This customer still has ${warnings.join(' and ')}. Enter a reason to deactivate:`
        : 'Reason for deactivating this customer:',
      '',
    )
    if (reason == null) return
    if (!reason.trim()) {
      toast({ title: 'A reason is required', variant: 'error' })
      return
    }
    await api.customers.setStatus({
      id,
      status: 'inactive',
      reason: reason.trim(),
    })
    await qc.invalidateQueries({ queryKey: ['customer', id] })
    toast({ title: 'Customer deactivated', variant: 'success' })
  }
  return (
    <div>
      <PageHeader
        title={`${c.code} — ${c.name}`}
        subtitle={c.phonePrimary ?? 'No phone'}
        actions={
          <>
            <Button variant="outline" onClick={() => setPayOpen(true)}>
              Record payment
            </Button>
            <Button variant="outline" onClick={() => setChargeOpen(true)}>
              Add charge/discount
            </Button>
            <Button variant="outline" onClick={() => setEdit(true)}>
              Edit
            </Button>
            <Button variant="outline" onClick={() => setRateOpen(true)}>
              Change rate
            </Button>
            <Button variant="destructive" onClick={() => void deactivate()}>
              Deactivate
            </Button>
          </>
        }
      />
      <Link className="text-sm text-sky-700" to="/customers">
        ← Back to customers
      </Link>
      <Tabs defaultValue="overview" className="mt-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="delivery">Delivery card</TabsTrigger>
          <TabsTrigger value="ledger">Ledger</TabsTrigger>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <div className="grid gap-4 md:grid-cols-2">
            <Card title="Profile">
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <dt className="text-muted-foreground">Type</dt>
                <dd className="capitalize">{c.customerType}</dd>
                <dt className="text-muted-foreground">Phone</dt>
                <dd>
                  {c.phonePrimary ?? '—'}{' '}
                  {c.phonePrimary && (
                    <button
                      className="ml-2 text-sky-700"
                      onClick={() => void navigator.clipboard?.writeText(c.phonePrimary!)}
                    >
                      Copy
                    </button>
                  )}
                </dd>
                <dt className="text-muted-foreground">WhatsApp</dt>
                <dd>
                  {c.whatsappNumber ? (
                    <a
                      className="text-sky-700"
                      href={`https://wa.me/${toWhatsAppE164(c.whatsappNumber)}`}
                    >
                      Open WhatsApp
                    </a>
                  ) : (
                    '—'
                  )}
                </dd>
                <dt className="text-muted-foreground">Address</dt>
                <dd>{c.addressLine ?? '—'}</dd>
                <dt className="text-muted-foreground">Area / route</dt>
                <dd>
                  {c.areaName ?? '—'} / {c.routeName ?? '—'}
                </dd>
                <dt className="text-muted-foreground">Status</dt>
                <dd className="capitalize">{c.status}</dd>
                <dt className="text-muted-foreground">Schedule</dt>
                <dd>
                  {c.schedule
                    ? `${c.schedule.mode}${
                        c.schedule.mode === 'weekdays' && c.schedule.weekdays
                          ? ` (${c.schedule.weekdays})`
                          : ''
                      }${
                        c.schedule.mode === 'interval_days' && c.schedule.intervalDays
                          ? ` every ${c.schedule.intervalDays}d`
                          : ''
                      } × ${c.schedule.defaultQty}`
                    : '—'}
                </dd>
              </dl>
            </Card>
            <Card title="Account">
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <dt className="text-muted-foreground">Balance</dt>
                <dd>
                  <Money value={c.balance} creditSuffix />
                </dd>
                <dt className="text-muted-foreground">Bottles</dt>
                <dd>{c.bottlesWithCustomer}</dd>
                <dt className="text-muted-foreground">Deposit</dt>
                <dd>
                  <Money value={c.securityDepositHeld} />
                </dd>
                <dt className="text-muted-foreground">Rate</dt>
                <dd>
                  <Money value={c.currentRate ?? 0} />
                </dd>
              </dl>
            </Card>
          </div>
          <div className="mt-4 rounded-lg border bg-white p-4">
            <h3 className="font-semibold">Rate history</h3>
            <table className="mt-3 w-full text-left text-sm">
              <thead>
                <tr className="border-b">
                  <th className="py-2">Rate</th>
                  <th>From</th>
                  <th>To</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {q.data?.rateHistory.map((r) => (
                  <tr className="border-b" key={r.id}>
                    <td className="py-2">
                      <Money value={r.rate} />
                    </td>
                    <td>
                      <DateText value={r.effectiveFrom} />
                    </td>
                    <td>{r.effectiveTo ? <DateText value={r.effectiveTo} /> : 'current'}</td>
                    <td>{r.reason ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>
        <TabsContent value="delivery" className="rounded-lg border bg-white p-4">
          <CustomerCardView customerId={id} showHeader />
        </TabsContent>
        <TabsContent value="ledger" className="rounded-lg border bg-white p-4">
          <CustomerLedgerTab customerId={id} />
        </TabsContent>
        <TabsContent value="invoices" className="rounded-lg border bg-white p-4">
          <CustomerInvoicesTab customerId={id} />
        </TabsContent>
        <TabsContent value="history">
          <Audit id={id} />
        </TabsContent>
      </Tabs>
      {payOpen && (
        <RecordPaymentDialog
          customerId={id}
          customerLabel={`${c.code} — ${c.name}`}
          defaultAmount={Math.max(0, c.balance)}
          onClose={() => setPayOpen(false)}
          onSaved={() => {
            setPayOpen(false)
            void qc.invalidateQueries({ queryKey: ['customer', id] })
            void qc.invalidateQueries({ queryKey: ['ledger', id] })
          }}
        />
      )}
      {chargeOpen && (
        <AdjustmentDialog
          customerId={id}
          onClose={() => setChargeOpen(false)}
          onSaved={() => {
            setChargeOpen(false)
            void qc.invalidateQueries({ queryKey: ['customer', id] })
            void qc.invalidateQueries({ queryKey: ['ledger', id] })
          }}
        />
      )}
      {edit && (
        <CustomerFormDialog
          customer={c}
          openingsLocked={!(q.data?.openingsEditable ?? true)}
          onClose={() => setEdit(false)}
          onSaved={() => {
            setEdit(false)
            void qc.invalidateQueries({ queryKey: ['customer', id] })
          }}
        />
      )}
      {rateOpen && (
        <RateDialog
          customerId={id}
          current={c.currentRate ?? 0}
          onClose={() => setRateOpen(false)}
          onSaved={() => {
            setRateOpen(false)
            void qc.invalidateQueries({ queryKey: ['customer', id] })
          }}
        />
      )}
    </div>
  )
}
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-white p-4">
      <h3 className="mb-3 font-semibold">{title}</h3>
      {children}
    </div>
  )
}
function Audit({ id }: { id: number }) {
  const q = useQuery({ queryKey: ['customer-audit', id], queryFn: () => api.customers.audit(id) })
  return (
    <div className="rounded-lg border bg-white p-4">
      <ul className="space-y-2 text-sm">
        {q.data?.items.map((a) => (
          <li className="flex justify-between border-b pb-2" key={a.id}>
            <span>{a.summary}</span>
            <DateText value={a.occurredAt} kind="datetime" />
          </li>
        ))}
      </ul>
    </div>
  )
}
function RateDialog({
  customerId,
  current,
  onClose,
  onSaved,
}: {
  customerId: number
  current: number
  onClose: () => void
  onSaved: () => void
}) {
  const [rate, setRate] = useState(String(current / 100))
  const [date, setDate] = useState(todayBusinessDate())
  const [reason, setReason] = useState('')
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-md space-y-4 rounded-lg bg-white p-6">
        <h2 className="text-lg font-semibold">Change rate</h2>
        <div>
          <Label>New rate (Rs)</Label>
          <Input type="number" value={rate} onChange={(e) => setRate(e.target.value)} />
        </div>
        <div>
          <Label>Effective from</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <button className="mt-1 text-xs text-sky-700" onClick={() => setDate(firstOfNextMonth())}>
            1st of next month
          </button>
        </div>
        <div>
          <Label>Reason</Label>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() =>
              void (async () => {
                async function apply(forceClosedPeriod = false) {
                  try {
                    // TODO(phase-3): warn when effective date falls inside an already-invoiced period
                    await api.rates.change({
                      customerId,
                      rate: toPaisa(rate),
                      effectiveFrom: date,
                      reason,
                      forceClosedPeriod,
                    })
                    onSaved()
                  } catch (e) {
                    if (e instanceof AppError && e.code === 'PERIOD_LOCKED' && !forceClosedPeriod) {
                      const ok = await confirmDialog({
                        title: 'Closed period',
                        description: e.message,
                        confirmLabel: 'Apply anyway',
                        danger: true,
                      })
                      if (ok) await apply(true)
                      return
                    }
                    toast({
                      title: 'Rate change failed',
                      description: e instanceof Error ? e.message : 'Error',
                      variant: 'error',
                    })
                  }
                }
                await apply()
              })()
            }
          >
            Apply
          </Button>
        </div>
      </div>
    </div>
  )
}

function CustomerLedgerTab({ customerId }: { customerId: number }) {
  const q = useQuery({
    queryKey: ['ledger', customerId],
    queryFn: () => api.ledger.get(customerId),
  })
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b text-left">
          <th className="py-2">Date</th>
          <th>Description</th>
          <th className="text-right">Debit</th>
          <th className="text-right">Credit</th>
          <th className="text-right">Balance</th>
        </tr>
      </thead>
      <tbody>
        {(q.data?.items ?? []).map((r) => (
          <tr key={r.id} className="border-b">
            <td className="py-2">
              <DateText value={r.entryDate} />
            </td>
            <td>
              {r.description}
              {r.isNonRevenue ? ' (non-revenue)' : ''}
              {r.refTable === 'invoices' && r.refId != null && (
                <Link className="ml-2 text-sky-700" to={`/billing/invoices/${r.refId}`}>
                  view
                </Link>
              )}
            </td>
            <td className="text-right">{r.debit ? <Money value={r.debit} /> : '—'}</td>
            <td className="text-right">{r.credit ? <Money value={r.credit} /> : '—'}</td>
            <td className="text-right">
              <Money value={r.balanceAfter} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function CustomerInvoicesTab({ customerId }: { customerId: number }) {
  const q = useQuery({
    queryKey: ['invoices', 'customer', customerId],
    queryFn: () => api.invoices.list({ customerId, limit: 200 }),
  })
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b text-left">
          <th className="py-2">Invoice</th>
          <th>Period</th>
          <th>Status</th>
          <th className="text-right">Total</th>
          <th className="text-right">Balance</th>
        </tr>
      </thead>
      <tbody>
        {(q.data?.items ?? []).map((inv) => (
          <tr key={inv.id} className="border-b">
            <td className="py-2">
              <Link className="text-sky-700" to={`/billing/invoices/${inv.id}`}>
                {inv.invoiceNo}
              </Link>
            </td>
            <td>{inv.period ?? '—'}</td>
            <td className="capitalize">{inv.status.replace(/_/g, ' ')}</td>
            <td className="text-right">
              <Money value={inv.invoiceTotal} />
            </td>
            <td className="text-right">
              <Money value={inv.balanceDue} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function AdjustmentDialog({
  customerId,
  onClose,
  onSaved,
}: {
  customerId: number
  onClose: () => void
  onSaved: () => void
}) {
  const [kind, setKind] = useState<'discount' | 'other_charge' | 'deposit_received' | 'write_off'>(
    'discount',
  )
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayBusinessDate())
  const [description, setDescription] = useState('')
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-md space-y-4 rounded-lg bg-white p-6">
        <h2 className="text-lg font-semibold">Add charge / discount</h2>
        <div>
          <Label>Kind</Label>
          <select
            className="flex h-10 w-full rounded-md border px-3 text-sm"
            value={kind}
            onChange={(e) => setKind(e.target.value as typeof kind)}
          >
            <option value="discount">Discount</option>
            <option value="other_charge">Other charge</option>
            <option value="write_off">Write-off</option>
            <option value="deposit_received">Deposit received</option>
          </select>
        </div>
        <div>
          <Label>Date</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <Label>Amount (Rs)</Label>
          <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div>
          <Label>Description</Label>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() =>
              void (async () => {
                try {
                  await api.adjustments.create({
                    customerId,
                    adjustmentDate: date,
                    kind,
                    amount: Number(toPaisa(amount)),
                    description: description || null,
                  })
                  toast({ title: 'Adjustment saved', variant: 'success' })
                  onSaved()
                } catch (e) {
                  toast({
                    title: 'Failed',
                    description: e instanceof Error ? e.message : 'Error',
                    variant: 'error',
                  })
                }
              })()
            }
          >
            Save
          </Button>
        </div>
      </div>
    </div>
  )
}
