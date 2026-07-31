import { Money } from '@renderer/components/Money'
import { PageHeader } from '@renderer/components/PageHeader'

export function DashboardPage() {
  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="A live snapshot of the business will appear here in Phase 8."
      />
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Today's deliveries" value="—" hint="Phase 2" />
        <StatCard label="Outstanding" value={<Money value={0} />} hint="Phase 3" />
        <StatCard label="This month revenue" value={<Money value={0} />} hint="Phase 8" />
      </div>
    </div>
  )
}

function StatCard({ label, value, hint }: { label: string; value: React.ReactNode; hint: string }) {
  return (
    <div className="rounded-lg border border-sky-100 bg-white/80 p-5 shadow-sm">
      <p className="text-sm text-muted-foreground">{label}</p>
      <div className="mt-2 text-2xl font-bold tabular-nums text-sky-950">{value}</div>
      <p className="mt-2 text-xs text-muted-foreground">{hint}</p>
    </div>
  )
}
