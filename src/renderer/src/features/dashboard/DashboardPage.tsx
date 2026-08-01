import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Money } from '@renderer/components/Money'
import { PageHeader } from '@renderer/components/PageHeader'
import { api } from '@renderer/lib/api'
import { useSessionStore } from '@renderer/stores/session'
import { todayBusinessDate } from '@shared/date'

export function DashboardPage() {
  const today = todayBusinessDate()
  const role = useSessionStore((s) => s.user?.role)
  const summary = useQuery({
    queryKey: ['deliveries', 'todaySummary', today],
    queryFn: () => api.deliveries.todaySummary(today),
  })
  const missed = useQuery({
    queryKey: ['deliveries', 'missed', today],
    queryFn: () => api.deliveries.missed({ asOf: today }),
  })
  const dueRecurring = useQuery({
    queryKey: ['recurringExpenses', 'due', today],
    queryFn: () => api.recurringExpenses.due(today),
    enabled: role === 'owner',
  })

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="Live delivery snapshot · full analytics arrive in Phase 8"
      />
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          label="Today's deliveries"
          value={String(summary.data?.customersServed ?? '—')}
          hint={
            summary.data
              ? `${summary.data.totalBottles} bottles · ${summary.data.totalAmount / 100} Rs`
              : 'Loading…'
          }
          link="/deliveries/daily"
        />
        <StatCard label="Outstanding" value={<Money value={0} />} hint="Phase 3" />
        <StatCard label="This month revenue" value={<Money value={0} />} hint="Phase 8" />
      </div>

      {role === 'owner' && (dueRecurring.data?.items.length ?? 0) > 0 && (
        <div className="mt-6 rounded border border-sky-200 bg-sky-50 p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold text-sky-950">
              Recurring expenses due this month: {dueRecurring.data!.items.length}
            </h2>
            <Link className="text-sm text-sky-700 underline" to="/expenses">
              Open expenses
            </Link>
          </div>
          <ul className="space-y-1 text-sm">
            {dueRecurring.data!.items.map((r) => (
              <li key={r.id}>
                {r.name} — <Money value={r.amount} />
                {r.vendorName ? ` · ${r.vendorName}` : ''}
                {r.lastRecordedDate ? '' : ' — not yet recorded'}
              </li>
            ))}
          </ul>
        </div>
      )}

      {(missed.data?.items.length ?? 0) > 0 && (
        <div className="mt-6 rounded border border-amber-200 bg-amber-50 p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold text-amber-950">Missed / overdue deliveries</h2>
            <Link className="text-sm text-sky-700 underline" to="/deliveries/daily">
              Open daily entry
            </Link>
          </div>
          <ul className="space-y-1 text-sm">
            {missed.data!.items.slice(0, 12).map((m) => (
              <li key={m.customerId} className="flex flex-wrap gap-2">
                <Link className="font-medium text-sky-900" to={`/customers/${m.customerId}`}>
                  {m.code} {m.name}
                </Link>
                <span className="text-muted-foreground">
                  {m.daysSince == null ? 'never delivered' : `${m.daysSince}d ago`} · {m.reason}
                </span>
                {m.whatsappNumber && (
                  <a
                    className="text-sky-700"
                    href={`https://wa.me/${m.whatsappNumber.replace(/\D/g, '')}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    WhatsApp
                  </a>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function StatCard({
  label,
  value,
  hint,
  link,
}: {
  label: string
  value: React.ReactNode
  hint: string
  link?: string
}) {
  const body = (
    <div className="rounded-lg border border-sky-100 bg-white/80 p-5 shadow-sm">
      <p className="text-sm text-muted-foreground">{label}</p>
      <div className="mt-2 text-2xl font-bold tabular-nums text-sky-950">{value}</div>
      <p className="mt-2 text-xs text-muted-foreground">{hint}</p>
    </div>
  )
  return link ? <Link to={link}>{body}</Link> : body
}
