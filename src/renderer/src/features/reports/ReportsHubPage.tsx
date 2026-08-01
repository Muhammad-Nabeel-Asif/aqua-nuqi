import { Link } from 'react-router-dom'
import { PageHeader } from '@renderer/components/PageHeader'
import { useSessionStore } from '@renderer/stores/session'

type ReportItem = { label: string; path: string; ownerOnly?: boolean }

const groups: Array<{ title: string; items: ReportItem[] }> = [
  {
    title: 'Sales',
    items: [
      { label: 'Sales summary', path: 'sales-summary' },
      { label: 'Customer-wise sales', path: 'customer-sales' },
      { label: 'Area / route performance', path: 'area-route-performance' },
      { label: 'Employee delivery', path: 'employee-delivery' },
      { label: 'Customer activity', path: 'customer-activity' },
    ],
  },
  {
    title: 'Money',
    items: [
      { label: 'Profit & Loss', path: 'profit-loss', ownerOnly: true },
      { label: 'Receivables ageing', path: 'receivables-ageing' },
      { label: 'Collection', path: 'collection', ownerOnly: true },
      { label: 'Expense report', path: 'expenses', ownerOnly: true },
      { label: 'Cost per bottle', path: 'cost-per-bottle', ownerOnly: true },
    ],
  },
  {
    title: 'Operations',
    items: [
      { label: 'Bottles out', path: '/inventory/bottles-out' },
      { label: 'Bottle loss', path: 'bottle-loss' },
      { label: 'Trip variance', path: 'trip-variance' },
      { label: 'Stock movements', path: 'stock-movements' },
    ],
  },
  {
    title: 'Staff',
    items: [{ label: 'Employee delivery', path: 'employee-delivery' }],
  },
]

export function ReportsHubPage() {
  const owner = useSessionStore((s) => s.user?.role === 'owner')
  return (
    <div>
      <PageHeader title="Reports" subtitle="Operational and financial views for Aqua Nuqi" />
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        {groups.map((group) => {
          const items = group.items.filter((item) => owner || !item.ownerOnly)
          if (items.length === 0) return null
          return (
            <section className="rounded-lg border bg-white p-4" key={group.title}>
              <h2 className="mb-3 text-lg font-semibold text-sky-950">{group.title}</h2>
              <div className="space-y-2">
                {items.map((item) => (
                  <Link
                    className="block rounded-md border border-slate-100 px-3 py-2 text-sm text-slate-700 hover:border-sky-200 hover:bg-sky-50 hover:text-sky-900"
                    key={item.path + item.label}
                    to={item.path.startsWith('/') ? item.path : `/reports/${item.path}`}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
