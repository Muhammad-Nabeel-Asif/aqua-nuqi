import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Money } from '@renderer/components/Money'
import { PageHeader } from '@renderer/components/PageHeader'
import { Button } from '@renderer/components/ui/button'
import { api } from '@renderer/lib/api'
import { useSessionStore } from '@renderer/stores/session'
import { todayBusinessDate } from '@shared/date'
import { paisaToDecimalString } from '@shared/money'

export function DashboardPage() {
  const role = useSessionStore((s) => s.user?.role)
  const owner = role === 'owner'
  const [basis, setBasis] = useState<'accrual' | 'cash'>('accrual')
  const today = todayBusinessDate()
  const q = useQuery({
    queryKey: ['reports', 'dashboard', today],
    queryFn: () => api.reports.dashboard(today),
  })
  const d = q.data

  if (!d) {
    return (
      <div>
        <PageHeader title="Dashboard" subtitle="Loading report snapshot…" />
        <div className="animate-pulse rounded-lg bg-slate-100 p-12" />
      </div>
    )
  }

  const revenue = basis === 'accrual' ? d.month.revenueAccrual : d.month.revenueCash
  const profit = basis === 'accrual' ? d.month.profitAccrual : d.month.profitCash
  const buckets = d.assets.ageingBuckets
  const bucketTotal =
    (buckets.current ?? 0) +
    (buckets['1-30'] ?? 0) +
    (buckets['31-60'] ?? 0) +
    (buckets['60+'] ?? 0)

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle={`Operational snapshot · ${d.asOf}`}
        actions={
          owner ? (
            <select
              className="h-9 rounded-md border bg-white px-2 text-sm"
              value={basis}
              onChange={(e) => setBasis(e.target.value as typeof basis)}
            >
              <option value="accrual">Accrual (billed)</option>
              <option value="cash">Cash (received)</option>
            </select>
          ) : undefined
        }
      />

      {/* Row 1 — today */}
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatLink
          label="Bottles delivered today"
          value={d.today.bottlesDelivered}
          to="/deliveries/daily"
        />
        <StatLink
          label="Customers served today"
          value={d.today.customersServed}
          to="/deliveries/daily"
        />
        <StatLink
          label="Cash collected today"
          value={<Money value={d.today.cashCollected} />}
          to="/payments"
        />
        <StatLink
          label="Still not entered"
          value={d.today.missedScheduled}
          to="/deliveries/daily"
          hint="On schedule, no entry"
        />
      </div>

      {/* Row 2 — this month */}
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <DashStat
          label="Month bottles"
          value={d.month.bottlesDelivered}
          change={d.month.pctChangeBottles}
        />
        <DashStat
          label={owner ? `Revenue (${basis})` : 'Revenue'}
          value={owner ? <Money value={revenue} /> : '—'}
          change={owner ? d.month.pctChangeRevenueAccrual : null}
        />
        <DashStat
          label="Expenses"
          value={owner ? <Money value={d.month.expenses} /> : '—'}
          change={owner ? d.month.pctChangeExpenses : null}
        />
        <DashStat
          label="Profit"
          value={owner ? <Money value={profit} /> : '—'}
          change={owner ? d.month.pctChangeProfitAccrual : null}
        />
      </div>
      {owner && (
        <p className="mb-4 text-xs text-muted-foreground">
          {basis === 'accrual'
            ? 'Accrual: counts money you billed this period, whether or not it was paid.'
            : 'Cash: counts money you actually received this period.'}
        </p>
      )}

      {/* Row 3 — money and assets */}
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border bg-white p-4">
          <p className="text-xs text-muted-foreground">Outstanding receivables</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">
            <Money value={d.assets.totalOutstanding} />
          </p>
          <AgeingBar buckets={buckets} total={bucketTotal} />
          <Link className="mt-2 inline-block text-xs text-sky-700 underline" to="/receivables">
            Open receivables
          </Link>
        </div>
        <DashStat
          label="Customers in credit"
          value={
            <>
              {d.assets.customersInCredit} · <Money value={d.assets.totalCredit} />
            </>
          }
        />
        <DashStat
          label="Bottles with customers"
          value={d.assets.bottlesWithCustomers}
          link="/inventory/bottles-out"
        />
        <DashStat
          label="Filled stock at plant"
          value={d.assets.filledStockAtPlant}
          link="/inventory"
        />
      </div>

      {/* Row 4 — charts */}
      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        {owner ? (
          <div className="h-72 rounded-lg border bg-white p-4">
            <h2 className="mb-2 font-semibold">Last 12 months</h2>
            <ResponsiveContainer width="100%" height="90%">
              <ComposedChart
                data={d.charts.last12Months.map((x) => ({
                  period: x.period.slice(2),
                  revenue: (basis === 'accrual' ? x.revenueAccrual : x.revenueCash) / 100,
                  expenses: x.expenses / 100,
                  profit: (basis === 'accrual' ? x.profitAccrual : x.profitCash) / 100,
                }))}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="period" tick={{ fontSize: 10 }} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="revenue" fill="#0284c7" />
                <Bar dataKey="expenses" fill="#f97316" />
                <Line dataKey="profit" stroke="#16a34a" strokeWidth={2} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="flex h-72 items-center justify-center rounded-lg border bg-slate-50 p-4 text-sm text-muted-foreground">
            Profit charts are owner-only
          </div>
        )}
        <div className="h-72 rounded-lg border bg-white p-4">
          <h2 className="mb-2 font-semibold">Daily bottles this month</h2>
          <ResponsiveContainer width="100%" height="90%">
            <LineChart
              data={d.charts.dailyBottlesThisMonth.map((x) => ({
                period: x.date.slice(5),
                bottles: x.bottles,
              }))}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="period" tick={{ fontSize: 10 }} />
              <YAxis />
              <Tooltip />
              <Line dataKey="bottles" stroke="#0284c7" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Row 5 — action lists */}
      <div className="mb-4 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <ActionList
          title="Top overdue"
          link="/receivables"
          items={d.actions.topOverdue.map((r) => ({
            key: r.customerId,
            primary: `${r.code} ${r.name}`,
            secondary: `${r.daysOverdue}d overdue`,
            money: r.balance,
            to: `/customers/${r.customerId}`,
          }))}
        />
        <ActionList
          title="No delivery in 14+ days"
          link="/deliveries/daily"
          items={d.actions.noDeliveryDays.map((r) => ({
            key: r.customerId,
            primary: `${r.code} ${r.name}`,
            secondary: r.daysSince == null ? 'never delivered' : `${r.daysSince}d since last`,
            to: `/customers/${r.customerId}`,
          }))}
        />
        {owner && (
          <ActionList
            title="Recurring not recorded"
            link="/expenses"
            items={d.actions.recurringNotRecorded.map((r) => ({
              key: r.id,
              primary: r.name,
              secondary: r.vendorName ?? '',
              money: r.amount,
              to: `/expenses?recurring=${r.id}`,
            }))}
          />
        )}
        <ActionList
          title="Trip variances this week"
          link="/inventory/trips"
          items={d.actions.tripVariancesThisWeek.map((t) => ({
            key: t.tripId,
            primary: t.employeeName ?? `Trip #${t.tripId}`,
            secondary: `${t.tripDate} · cash Rs ${paisaToDecimalString(t.cashVariance)} · bottles ${t.bottleVariance}`,
            to: '/inventory/trips',
          }))}
        />
        {d.actions.backupStale && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
            <h2 className="font-semibold text-amber-950">Backup warning</h2>
            <p className="mt-1 text-sm text-amber-900">
              {d.actions.backupLastSuccessAt
                ? `Last backup: ${d.actions.backupLastSuccessAt}`
                : 'No successful backup on record.'}
            </p>
            {owner && (
              <Link className="mt-2 inline-block text-sm text-sky-700 underline" to="/settings">
                Open backup settings
              </Link>
            )}
          </div>
        )}
      </div>

      <div className="rounded-lg border bg-white p-4">
        <h2 className="mb-3 font-semibold">Quick actions</h2>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link to="/deliveries/daily">Record delivery</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/payments">Record payment</Link>
          </Button>
          {owner && (
            <>
              <Button variant="outline" asChild>
                <Link to="/expenses">Add expense</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link to="/billing/generate">Generate bills</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link to="/reports/profit-loss">Profit &amp; Loss</Link>
              </Button>
            </>
          )}
          <Button variant="outline" asChild>
            <Link to="/customers">New customer</Link>
          </Button>
        </div>
      </div>
    </div>
  )
}

function StatLink({
  label,
  value,
  to,
  hint,
}: {
  label: string
  value: React.ReactNode
  to: string
  hint?: string
}) {
  return (
    <Link className="rounded-lg border bg-white p-4 hover:border-sky-300" to={to}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </Link>
  )
}

function DashStat({
  label,
  value,
  change,
  link,
}: {
  label: string
  value: React.ReactNode
  change?: number | null
  link?: string
}) {
  const body = (
    <div className="rounded-lg border bg-white p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
      {change != null && (
        <p className={`mt-1 text-xs ${change >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
          {change >= 0 ? '+' : ''}
          {change}% vs prior
        </p>
      )}
    </div>
  )
  return link ? <Link to={link}>{body}</Link> : body
}

function AgeingBar({ buckets, total }: { buckets: Record<string, number>; total: number }) {
  if (total <= 0) return null
  const parts = [
    { key: 'current', color: 'bg-emerald-500' },
    { key: '1-30', color: 'bg-sky-500' },
    { key: '31-60', color: 'bg-amber-500' },
    { key: '60+', color: 'bg-red-500' },
  ]
  return (
    <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-slate-100">
      {parts.map((p) => {
        const w = ((buckets[p.key] ?? 0) / total) * 100
        if (w <= 0) return null
        return <div key={p.key} className={p.color} style={{ width: `${w}%` }} title={p.key} />
      })}
    </div>
  )
}

function ActionList({
  title,
  link,
  items,
}: {
  title: string
  link: string
  items: Array<{
    key: string | number
    primary: string
    secondary: string
    money?: number
    to: string
  }>
}) {
  return (
    <div className="rounded-lg border bg-white p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-semibold">{title}</h2>
        <Link className="text-xs text-sky-700 underline" to={link}>
          View all
        </Link>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">None</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {items.map((item) => (
            <li key={item.key} className="flex flex-wrap items-baseline justify-between gap-2">
              <Link className="font-medium text-sky-900" to={item.to}>
                {item.primary}
              </Link>
              <span className="text-muted-foreground">{item.secondary}</span>
              {item.money != null && <Money value={item.money} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
